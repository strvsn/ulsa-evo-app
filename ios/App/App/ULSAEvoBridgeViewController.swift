import Foundation
import UIKit
import Capacitor
import CoreMotion

@objc(ULSAEvoBridgeViewController)
class ULSAEvoBridgeViewController: CAPBridgeViewController {
    private let motionManager = CMMotionManager()
    private let motionQueue = OperationQueue()
    private var lastPublishedOrientation: String?
    private var lastPublishedScreenMetricsSignature: String?

    override var shouldAutorotate: Bool {
        true
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        AppDelegate.interfaceOrientationMask(for: view.window)
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        UIDevice.current.beginGeneratingDeviceOrientationNotifications()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(deviceOrientationDidChange),
            name: UIDevice.orientationDidChangeNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationWillResignActive),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        if UIApplication.shared.applicationState == .active {
            startPhysicalOrientationPublisher()
        }
        publishDeviceOrientation(orientationName(from: UIDevice.current.orientation), source: "uid-device")
        publishScreenMetrics(source: "view-did-load")
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(ULSASoftApPlugin())
        bridge?.registerPluginInstance(ULSAChartFullscreenPlugin())
        bridge?.registerPluginInstance(ULSATrueHeadingPlugin())
        bridge?.registerPluginInstance(ULSAWindPiPPlugin())
        bridge?.registerPluginInstance(ULSASlideImageSharePlugin())
        bridge?.registerPluginInstance(ULSAAppInfoPlugin())
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        publishDeviceOrientation(orientationName(from: UIDevice.current.orientation), source: "uid-device")
        publishScreenMetrics(source: "view-did-appear")
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        publishScreenMetrics(source: "layout")
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        publishScreenMetrics(source: "safe-area")
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        UIDevice.current.endGeneratingDeviceOrientationNotifications()
        stopPhysicalOrientationPublisher()
    }

    @objc private func deviceOrientationDidChange() {
        publishDeviceOrientation(orientationName(from: UIDevice.current.orientation), source: "uid-device")
    }

    @objc private func applicationWillResignActive() {
        stopPhysicalOrientationPublisher()
    }

    @objc private func applicationDidBecomeActive() {
        startPhysicalOrientationPublisher()
        publishDeviceOrientation(orientationName(from: UIDevice.current.orientation), source: "uid-device")
        publishScreenMetrics(source: "application-did-become-active")
    }

    private func startPhysicalOrientationPublisher() {
        // Keep UIKit locked to portrait for every iPhone. Physical orientation is published
        // separately so the WebView can apply exactly one upside-down transform.
        guard shouldUseManualUpsideDownTransform,
              UIApplication.shared.applicationState == .active,
              motionManager.isDeviceMotionAvailable,
              !motionManager.isDeviceMotionActive else {
            return
        }

        motionQueue.name = "net.strvsn.ulsa-evo.device-orientation"
        motionQueue.qualityOfService = .utility
        motionManager.deviceMotionUpdateInterval = 0.2
        motionManager.startDeviceMotionUpdates(to: motionQueue) { [weak self] motion, _ in
            guard let self, let gravity = motion?.gravity else {
                return
            }

            guard let orientation = self.orientationName(fromGravity: gravity) else {
                return
            }

            DispatchQueue.main.async {
                self.publishDeviceOrientation(orientation, source: "core-motion")
            }
        }
    }

    private func stopPhysicalOrientationPublisher() {
        guard motionManager.isDeviceMotionActive else {
            return
        }
        motionManager.stopDeviceMotionUpdates()
        motionQueue.cancelAllOperations()
    }

    private func orientationName(from orientation: UIDeviceOrientation) -> String? {
        switch orientation {
        case .portrait:
            return "portrait"
        case .portraitUpsideDown:
            return shouldUseManualUpsideDownTransform ? "portraitUpsideDown" : "portrait"
        case .landscapeLeft:
            return "portrait"
        case .landscapeRight:
            return "portrait"
        default:
            return nil
        }
    }

    private func orientationName(fromGravity gravity: CMAcceleration) -> String? {
        let threshold = 0.65

        if abs(gravity.y) >= abs(gravity.x), abs(gravity.y) > threshold {
            return gravity.y > 0 && shouldUseManualUpsideDownTransform
                ? "portraitUpsideDown"
                : "portrait"
        }

        if abs(gravity.x) > threshold {
            return "portrait"
        }

        return nil
    }

    private var shouldUseManualUpsideDownTransform: Bool {
        UIDevice.current.userInterfaceIdiom == .phone
    }

    private func publishScreenMetrics(source: String) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.publishScreenMetrics(source: source)
            }
            return
        }

        guard let webView else {
            return
        }

        let bounds = view.bounds.isEmpty ? UIScreen.main.bounds : view.bounds
        let insets = view.safeAreaInsets
        let scale = UIScreen.main.scale
        let cornerRadius = estimatedScreenCornerRadius(bounds: bounds, safeAreaInsets: insets)
        let idiom = userInterfaceIdiomName()
        let signature = [
            formattedNumber(bounds.width),
            formattedNumber(bounds.height),
            formattedNumber(scale),
            formattedNumber(insets.top),
            formattedNumber(insets.right),
            formattedNumber(insets.bottom),
            formattedNumber(insets.left),
            formattedNumber(cornerRadius),
            idiom,
        ].joined(separator: ":")

        guard signature != lastPublishedScreenMetricsSignature else {
            return
        }

        let js = """
        (function () {
          var detail = {
            screenWidth: \(formattedNumber(bounds.width)),
            screenHeight: \(formattedNumber(bounds.height)),
            screenScale: \(formattedNumber(scale)),
            screenCornerRadius: \(formattedNumber(cornerRadius)),
            safeAreaInsets: {
              top: \(formattedNumber(insets.top)),
              right: \(formattedNumber(insets.right)),
              bottom: \(formattedNumber(insets.bottom)),
              left: \(formattedNumber(insets.left))
            },
            userInterfaceIdiom: '\(idiom)',
            source: '\(source)'
          };
          window.__ULSA_NATIVE_SCREEN_METRICS = detail;
          document.documentElement.style.setProperty('--device-screen-corner-radius', Math.round(detail.screenCornerRadius) + 'px');
          window.dispatchEvent(new CustomEvent('ulsaNativeScreenMetrics', { detail: detail }));
        }());
        """

        webView.evaluateJavaScript(js) { [weak self] _, error in
            if error == nil {
                self?.lastPublishedScreenMetricsSignature = signature
            }
        }
    }

    private func estimatedScreenCornerRadius(bounds: CGRect, safeAreaInsets: UIEdgeInsets) -> CGFloat {
        let minSide = max(0, min(bounds.width, bounds.height))
        let largestSafeInset = max(safeAreaInsets.top, safeAreaInsets.right, safeAreaInsets.bottom, safeAreaInsets.left)

        if UIDevice.current.userInterfaceIdiom == .phone, largestSafeInset > 0 {
            let radiusFromSafeArea = largestSafeInset * 0.92
            let radiusFromScreenSize = minSide * 0.105
            return min(max(max(radiusFromSafeArea, radiusFromScreenSize), 34), 58)
        }

        if UIDevice.current.userInterfaceIdiom == .pad {
            return min(max(minSide * 0.055, 18), 34)
        }

        return min(max(minSide * 0.05, 18), 28)
    }

    private func formattedNumber(_ value: CGFloat) -> String {
        String(format: "%.2f", Double(value))
    }

    private func userInterfaceIdiomName() -> String {
        switch UIDevice.current.userInterfaceIdiom {
        case .phone:
            return "phone"
        case .pad:
            return "pad"
        case .tv:
            return "tv"
        case .carPlay:
            return "carPlay"
        case .mac:
            return "mac"
        case .unspecified:
            return "unspecified"
        @unknown default:
            return "unspecified"
        }
    }

    private func publishDeviceOrientation(_ orientation: String?, source: String) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.publishDeviceOrientation(orientation, source: source)
            }
            return
        }

        guard let orientation else {
            return
        }

        guard orientation != lastPublishedOrientation else {
            return
        }

        guard let webView else {
            return
        }

        let upsideDown = orientation == "portraitUpsideDown" ? "true" : "false"
        let js = """
        (function () {
          var detail = { orientation: '\(orientation)', upsideDown: \(upsideDown), source: '\(source)' };
          window.__ULSA_NATIVE_DEVICE_ORIENTATION = detail;
          window.dispatchEvent(new CustomEvent('ulsaNativeDeviceOrientation', { detail: detail }));
        }());
        """

        webView.evaluateJavaScript(js) { [weak self] _, error in
            if error == nil {
                self?.lastPublishedOrientation = orientation
            }
        }
    }
}

@objc(ULSAAppInfoPlugin)
final class ULSAAppInfoPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "ULSAAppInfoPlugin"
    let jsName = "UlsaAppInfo"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getInfo", returnType: CAPPluginReturnPromise)
    ]

    @objc func getInfo(_ call: CAPPluginCall) {
        let info = Bundle.main.infoDictionary ?? [:]
        call.resolve([
            "name": info["CFBundleDisplayName"] as? String
                ?? info["CFBundleName"] as? String
                ?? "ULSA EVO",
            "version": info["CFBundleShortVersionString"] as? String ?? "unknown",
            "build": info["CFBundleVersion"] as? String ?? "unknown"
        ])
    }
}

@objc(ULSAChartFullscreenPlugin)
class ULSAChartFullscreenPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "ULSAChartFullscreenPlugin"
    let jsName = "UlsaChartFullscreen"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setLandscape", returnType: CAPPluginReturnPromise)
    ]

    @objc func setLandscape(_ call: CAPPluginCall) {
        let landscape = call.getBool("enabled") ?? false

        DispatchQueue.main.async { [weak self] in
            guard let self, let viewController = self.bridge?.viewController else {
                call.reject("ULSA chart fullscreen bridge is unavailable.")
                return
            }

            let idiom = viewController.view.window?.traitCollection.userInterfaceIdiom
                ?? UIDevice.current.userInterfaceIdiom
            let orientationMask: UIInterfaceOrientationMask = landscape
                ? [.landscapeLeft, .landscapeRight]
                : AppDelegate.defaultInterfaceOrientationMask(for: idiom)
            AppDelegate.interfaceOrientationOverride = landscape ? orientationMask : nil

            if #available(iOS 16.0, *) {
                viewController.setNeedsUpdateOfSupportedInterfaceOrientations()

                if let scene = viewController.view.window?.windowScene {
                    let preferences = UIWindowScene.GeometryPreferences.iOS(interfaceOrientations: orientationMask)
                    scene.requestGeometryUpdate(preferences) { _ in
                        // iOS or a managed-device policy may reject geometry updates.
                        // The active mask still permits the regular rotation path.
                    }
                    call.resolve(["landscape": landscape, "geometryUpdated": true])
                    return
                }
            }

            UIViewController.attemptRotationToDeviceOrientation()
            call.resolve(["landscape": landscape, "geometryUpdated": false])
        }
    }
}
