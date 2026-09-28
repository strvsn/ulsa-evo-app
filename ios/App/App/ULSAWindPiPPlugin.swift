import AVFoundation
import AVKit
import Capacitor
import CoreMedia
import Foundation
import UIKit

@objc(ULSAWindPiPPlugin)
final class ULSAWindPiPPlugin: CAPPlugin,
    CAPBridgedPlugin,
    AVPictureInPictureControllerDelegate,
    AVPictureInPictureSampleBufferPlaybackDelegate {

    let identifier = "ULSAWindPiPPlugin"
    let jsName = "UlsaWindPip"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private let renderer = ULSAWindPiPRenderer()
    private let displayLayer = AVSampleBufferDisplayLayer()
    private var sourceView: UIView?
    private var pictureInPictureController: AVPictureInPictureController?
    private var possibleObservation: NSKeyValueObservation?
    private var idleFrameWorkItem: DispatchWorkItem?
    private var pendingFrameWorkItem: DispatchWorkItem?
    private var startWatchdogWorkItem: DispatchWorkItem?
    private var formatDescription: CMVideoFormatDescription?
    private var audioSessionActive = false
    private var startAttemptExpired = false
    private var latestSnapshot = ULSAWindPiPSnapshot(
        windSpeedMps: nil,
        windDirectionDegrees: nil,
        temperatureCelsius: nil,
        soundSpeedMps: nil,
        headingSpeedMps: nil,
        windSpeedAverage10mMps: nil,
        windSpeedUnit: "m/s",
        dataState: .waiting,
        cardLogState: .disabled,
        cardLogDetail: nil,
        appLogState: .disabled,
        appLogDetail: nil,
        themeVariant: .graphite,
        capturedAtMs: 0
    )
    private var lastFrameAt: TimeInterval = 0
    private var phase = "unavailable"
    private var latestError: String?
    private let staleIntervalMs: Double = 3_000
    private let startReadinessTimeout: TimeInterval = 1.5
    private let startLifecycleTimeout: TimeInterval = 5

    deinit {
        possibleObservation?.invalidate()
        cancelStartLifecycleWatchdog()
        pendingFrameWorkItem?.cancel()
        stopIdleFrameTimer()
        deactivateAudioSession()
        sourceView?.removeFromSuperview()
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.ensurePrepared()
            let supported = AVPictureInPictureController.isPictureInPictureSupported()
            call.resolve([
                "supported": supported,
                "possible": self.pictureInPictureController?.isPictureInPicturePossible ?? false,
                "active": self.pictureInPictureController?.isPictureInPictureActive ?? false,
            ])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard let snapshot = self.parseSnapshot(call) else {
                call.reject("PiP表示データが不正です", "INVALID_SNAPSHOT")
                return
            }
            self.latestSnapshot = snapshot
            self.ensurePrepared()
            self.renderFrame(force: true)

            guard let controller = self.pictureInPictureController,
                  AVPictureInPictureController.isPictureInPictureSupported() else {
                call.reject("この端末はPicture in Pictureに対応していません", "PIP_UNSUPPORTED")
                return
            }
            guard !controller.isPictureInPictureActive else {
                call.resolve(self.statePayload(phase: "active"))
                return
            }
            guard self.phase != "starting" else {
                call.resolve(self.statePayload(phase: "starting"))
                return
            }

            do {
                self.startAttemptExpired = false
                try self.activateAudioSession()
                self.phase = "starting"
                self.latestError = nil
                self.publishState()
                self.startPictureInPictureWhenReady(
                    controller,
                    call: call,
                    deadline: ProcessInfo.processInfo.systemUptime + self.startReadinessTimeout
                )
            } catch {
                self.startAttemptExpired = false
                self.cancelStartLifecycleWatchdog()
                self.deactivateAudioSession()
                let message = "PiP用オーディオセッションを開始できません: \(error.localizedDescription)"
                self.phase = "failed"
                self.latestError = message
                self.publishState()
                call.reject(message, "AUDIO_SESSION_FAILED", error)
            }
        }
    }

    private func startPictureInPictureWhenReady(
        _ controller: AVPictureInPictureController,
        call: CAPPluginCall,
        deadline: TimeInterval
    ) {
        guard phase == "starting" else {
            deactivateAudioSession()
            call.reject("Picture in Pictureの開始を中止しました", "PIP_START_CANCELLED")
            return
        }
        if controller.isPictureInPicturePossible {
            scheduleStartLifecycleWatchdog(controller)
            controller.startPictureInPicture()
            call.resolve(statePayload(phase: "starting"))
            return
        }

        guard ProcessInfo.processInfo.systemUptime < deadline else {
            let message = "Picture in Pictureの準備が完了しませんでした。もう一度お試しください"
            phase = "failed"
            startAttemptExpired = false
            latestError = message
            cancelStartLifecycleWatchdog()
            deactivateAudioSession()
            publishState()
            call.reject(message, "PIP_NOT_POSSIBLE")
            return
        }

        renderFrame(force: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self, weak controller] in
            guard let self, let controller else { return }
            self.startPictureInPictureWhenReady(controller, call: call, deadline: deadline)
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard let snapshot = self.parseSnapshot(call) else {
                call.reject("PiP表示データが不正です", "INVALID_SNAPSHOT")
                return
            }
            let stateChanged = snapshot.dataState != self.latestSnapshot.dataState
                || snapshot.themeVariant != self.latestSnapshot.themeVariant
                || snapshot.windSpeedUnit != self.latestSnapshot.windSpeedUnit
                || snapshot.cardLogState != self.latestSnapshot.cardLogState
                || snapshot.cardLogDetail != self.latestSnapshot.cardLogDetail
                || snapshot.appLogState != self.latestSnapshot.appLogState
                || snapshot.appLogDetail != self.latestSnapshot.appLogDetail
            self.latestSnapshot = snapshot
            self.ensurePrepared()
            if self.pictureInPictureController?.isPictureInPictureActive == true || self.phase == "starting" {
                self.renderFrame(force: stateChanged)
            }
            call.resolve(self.statePayload())
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard let controller = self.pictureInPictureController,
                  controller.isPictureInPictureActive else {
                self.phase = "ready"
                self.cancelStartLifecycleWatchdog()
                self.stopIdleFrameTimer()
                self.deactivateAudioSession()
                call.resolve(self.statePayload(phase: "ready"))
                return
            }
            self.phase = "stopping"
            self.cancelStartLifecycleWatchdog()
            self.publishState()
            controller.stopPictureInPicture()
            call.resolve(self.statePayload(phase: "stopping"))
        }
    }

    private func ensurePrepared() {
        guard pictureInPictureController == nil,
              AVPictureInPictureController.isPictureInPictureSupported(),
              let presentingView = bridge?.viewController?.view else {
            if pictureInPictureController == nil {
                phase = "unavailable"
            }
            return
        }

        let view = UIView(frame: CGRect(
            x: max(0, presentingView.bounds.width - 2),
            y: max(0, presentingView.bounds.height - 2),
            width: 2,
            height: 2
        ))
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        view.alpha = 0.02
        view.autoresizingMask = [.flexibleLeftMargin, .flexibleTopMargin]
        displayLayer.frame = view.bounds
        displayLayer.videoGravity = .resizeAspect
        view.layer.addSublayer(displayLayer)
        presentingView.addSubview(view)
        sourceView = view

        let contentSource = AVPictureInPictureController.ContentSource(
            sampleBufferDisplayLayer: displayLayer,
            playbackDelegate: self
        )
        let controller = AVPictureInPictureController(contentSource: contentSource)
        controller.delegate = self
        controller.requiresLinearPlayback = true
        controller.canStartPictureInPictureAutomaticallyFromInline = false
        pictureInPictureController = controller
        phase = "ready"

        possibleObservation = controller.observe(
            \.isPictureInPicturePossible,
            options: [.initial, .new]
        ) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.publishState()
            }
        }
        renderFrame(force: true)
    }

    private func parseSnapshot(_ call: CAPPluginCall) -> ULSAWindPiPSnapshot? {
        guard let rawState = call.getString("dataState"),
              let requestedState = ULSAWindPiPDataState(rawValue: rawState) else {
            return nil
        }
        let speed = finiteDouble(call.getDouble("windSpeedMps")).map { max(0, $0) }
        let direction = finiteDouble(call.getDouble("windDirectionDegrees"))
        let temperature = finiteDouble(call.getDouble("temperatureCelsius"))
        let soundSpeed = finiteDouble(call.getDouble("soundSpeedMps"))
        let headingSpeed = finiteDouble(call.getDouble("headingSpeedMps"))
        let windSpeedAverage10m = finiteDouble(call.getDouble("windSpeedAverage10mMps")).map { max(0, $0) }
        let unit = ["m/s", "km/h", "cm/s"].contains(call.getString("windSpeedUnit") ?? "")
            ? call.getString("windSpeedUnit")!
            : "m/s"
        let state: ULSAWindPiPDataState = requestedState == .live && (speed == nil || direction == nil)
            ? .waiting
            : requestedState
        let fallbackTheme: ULSAWindRoseThemeVariant = call.getBool("isLightTheme") == true ? .light : .graphite
        let theme = call.getString("themeVariant").flatMap(ULSAWindRoseThemeVariant.init(rawValue:))
            ?? fallbackTheme
        let cardLogState = call.getString("cardLogState").flatMap(ULSAWindPiPLogState.init(rawValue:))
            ?? .disabled
        let appLogState = call.getString("appLogState").flatMap(ULSAWindPiPLogState.init(rawValue:))
            ?? .disabled
        return ULSAWindPiPSnapshot(
            windSpeedMps: state == .live ? speed : nil,
            windDirectionDegrees: state == .live ? direction : nil,
            temperatureCelsius: state == .live ? temperature : nil,
            soundSpeedMps: state == .live ? soundSpeed : nil,
            headingSpeedMps: state == .live ? headingSpeed : nil,
            windSpeedAverage10mMps: state == .live ? windSpeedAverage10m : nil,
            windSpeedUnit: unit,
            dataState: state,
            cardLogState: cardLogState,
            cardLogDetail: normalizedDetail(call.getString("cardLogDetail")),
            appLogState: appLogState,
            appLogDetail: normalizedDetail(call.getString("appLogDetail")),
            themeVariant: theme,
            capturedAtMs: call.getDouble("capturedAtMs") ?? Date().timeIntervalSince1970 * 1000
        )
    }

    private func finiteDouble(_ value: Double?) -> Double? {
        guard let value, value.isFinite else { return nil }
        return value
    }

    private func normalizedDetail(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : String(trimmed.prefix(12))
    }

    private func renderFrame(force: Bool) {
        if displayLayer.status == .failed {
            displayLayer.flush()
        }
        guard displayLayer.isReadyForMoreMediaData else {
            pendingFrameWorkItem?.cancel()
            pendingFrameWorkItem = nil
            // The gauge represents the latest state, so dropping a blocked
            // frame is preferable to retaining stale PixelBuffers in a queue.
            if pictureInPictureController?.isPictureInPictureActive == true {
                scheduleNextIdleFrame()
            }
            return
        }

        let now = ProcessInfo.processInfo.systemUptime
        let maximumFramesPerSecond: Double = ProcessInfo.processInfo.isLowPowerModeEnabled ? 15 : 30
        let minimumInterval = 1 / maximumFramesPerSecond
        let remainingDelay = minimumInterval - (now - lastFrameAt)
        if !force && remainingDelay > 0 {
            pendingFrameWorkItem?.cancel()
            let workItem = DispatchWorkItem { [weak self] in
                self?.renderFrame(force: true)
            }
            pendingFrameWorkItem = workItem
            DispatchQueue.main.asyncAfter(deadline: .now() + remainingDelay, execute: workItem)
            return
        }
        pendingFrameWorkItem?.cancel()
        pendingFrameWorkItem = nil

        guard let pixelBuffer = renderer.render(snapshot: snapshotForRendering(), now: now) else {
            return
        }
        enqueue(pixelBuffer: pixelBuffer, framesPerSecond: Int32(maximumFramesPerSecond))
        lastFrameAt = now
        if pictureInPictureController?.isPictureInPictureActive == true {
            scheduleNextIdleFrame()
        }
    }

    private func snapshotForRendering() -> ULSAWindPiPSnapshot {
        guard latestSnapshot.dataState == .live,
              Date().timeIntervalSince1970 * 1_000 - latestSnapshot.capturedAtMs > staleIntervalMs else {
            return latestSnapshot
        }
        return ULSAWindPiPSnapshot(
            windSpeedMps: nil,
            windDirectionDegrees: nil,
            temperatureCelsius: nil,
            soundSpeedMps: nil,
            headingSpeedMps: nil,
            windSpeedAverage10mMps: nil,
            windSpeedUnit: latestSnapshot.windSpeedUnit,
            dataState: .stale,
            cardLogState: latestSnapshot.cardLogState,
            cardLogDetail: latestSnapshot.cardLogDetail,
            appLogState: latestSnapshot.appLogState,
            appLogDetail: latestSnapshot.appLogDetail,
            themeVariant: latestSnapshot.themeVariant,
            capturedAtMs: latestSnapshot.capturedAtMs
        )
    }

    private func enqueue(pixelBuffer: CVPixelBuffer, framesPerSecond: Int32) {
        if formatDescription == nil {
            var description: CMVideoFormatDescription?
            guard CMVideoFormatDescriptionCreateForImageBuffer(
                allocator: kCFAllocatorDefault,
                imageBuffer: pixelBuffer,
                formatDescriptionOut: &description
            ) == noErr else {
                return
            }
            formatDescription = description
        }
        guard let formatDescription else { return }

        var timing = CMSampleTimingInfo(
            duration: CMTime(value: 1, timescale: framesPerSecond),
            presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
            decodeTimeStamp: .invalid
        )
        var sampleBuffer: CMSampleBuffer?
        guard CMSampleBufferCreateReadyWithImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescription: formatDescription,
            sampleTiming: &timing,
            sampleBufferOut: &sampleBuffer
        ) == noErr, let sampleBuffer else {
            return
        }
        CMSetAttachment(
            sampleBuffer,
            key: kCMSampleAttachmentKey_DisplayImmediately,
            value: kCFBooleanTrue,
            attachmentMode: kCMAttachmentMode_ShouldNotPropagate
        )
        displayLayer.enqueue(sampleBuffer)
    }

    private func startIdleFrameTimer() {
        stopIdleFrameTimer()
        scheduleNextIdleFrame()
    }

    private func scheduleNextIdleFrame() {
        idleFrameWorkItem?.cancel()
        guard pictureInPictureController?.isPictureInPictureActive == true else { return }
        let frameRate: Double = ProcessInfo.processInfo.isLowPowerModeEnabled ? 15 : 30
        let delay = renderer.needsAnimation ? 1 / frameRate : 1
        let workItem = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.renderFrame(force: true)
        }
        idleFrameWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
    }

    private func stopIdleFrameTimer() {
        idleFrameWorkItem?.cancel()
        idleFrameWorkItem = nil
        pendingFrameWorkItem?.cancel()
        pendingFrameWorkItem = nil
    }

    private func scheduleStartLifecycleWatchdog(_ controller: AVPictureInPictureController) {
        cancelStartLifecycleWatchdog()
        let workItem = DispatchWorkItem { [weak self, weak controller] in
            guard let self else { return }
            self.startWatchdogWorkItem = nil
            guard self.phase == "starting",
                  controller?.isPictureInPictureActive != true else {
                return
            }
            self.phase = "failed"
            self.startAttemptExpired = true
            self.latestError = "Picture in Pictureの開始確認がタイムアウトしました。もう一度お試しください"
            self.stopIdleFrameTimer()
            self.deactivateAudioSession()
            self.publishState()
        }
        startWatchdogWorkItem = workItem
        DispatchQueue.main.asyncAfter(
            deadline: .now() + startLifecycleTimeout,
            execute: workItem
        )
    }

    private func cancelStartLifecycleWatchdog() {
        startWatchdogWorkItem?.cancel()
        startWatchdogWorkItem = nil
    }

    private func activateAudioSession() throws {
        guard !audioSessionActive else { return }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .moviePlayback, options: [.mixWithOthers])
        try session.setActive(true)
        audioSessionActive = true
    }

    private func deactivateAudioSession() {
        guard audioSessionActive else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        audioSessionActive = false
    }

    private func statePayload(phase overridePhase: String? = nil) -> [String: Any] {
        let currentPhase = overridePhase ?? phase
        var payload: [String: Any] = [
            "supported": AVPictureInPictureController.isPictureInPictureSupported(),
            "possible": pictureInPictureController?.isPictureInPicturePossible ?? false,
            "active": pictureInPictureController?.isPictureInPictureActive ?? false,
            "phase": currentPhase,
        ]
        if let latestError {
            payload["error"] = latestError
        }
        return payload
    }

    private func publishState() {
        notifyListeners("stateChanged", data: statePayload())
    }

    func pictureInPictureControllerWillStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        phase = "starting"
        publishState()
    }

    func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        cancelStartLifecycleWatchdog()
        guard !startAttemptExpired else {
            phase = "stopping"
            stopIdleFrameTimer()
            deactivateAudioSession()
            pictureInPictureController.stopPictureInPicture()
            publishState()
            return
        }
        phase = "active"
        latestError = nil
        startIdleFrameTimer()
        publishState()
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        cancelStartLifecycleWatchdog()
        startAttemptExpired = false
        phase = "failed"
        latestError = error.localizedDescription
        stopIdleFrameTimer()
        deactivateAudioSession()
        publishState()
    }

    func pictureInPictureControllerWillStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        cancelStartLifecycleWatchdog()
        phase = "stopping"
        publishState()
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        cancelStartLifecycleWatchdog()
        startAttemptExpired = false
        phase = "ready"
        stopIdleFrameTimer()
        deactivateAudioSession()
        publishState()
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        notifyListeners("restoreRequested", data: [:])
        completionHandler(true)
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        setPlaying playing: Bool
    ) {
        pictureInPictureController.invalidatePlaybackState()
    }

    func pictureInPictureControllerTimeRangeForPlayback(
        _ pictureInPictureController: AVPictureInPictureController
    ) -> CMTimeRange {
        CMTimeRange(start: .negativeInfinity, duration: .positiveInfinity)
    }

    func pictureInPictureControllerIsPlaybackPaused(
        _ pictureInPictureController: AVPictureInPictureController
    ) -> Bool {
        false
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        didTransitionToRenderSize newRenderSize: CMVideoDimensions
    ) {
        renderFrame(force: true)
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        skipByInterval skipInterval: CMTime,
        completion completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }

    func pictureInPictureControllerShouldProhibitBackgroundAudioPlayback(
        _ pictureInPictureController: AVPictureInPictureController
    ) -> Bool {
        true
    }
}
