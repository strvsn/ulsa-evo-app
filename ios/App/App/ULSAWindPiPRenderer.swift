import CoreGraphics
import CoreVideo
import Foundation
import UIKit

enum ULSAWindPiPDataState: String {
    case waiting
    case live
    case stale
    case disconnected
}

enum ULSAWindPiPLogState: String {
    case disabled
    case ready
    case recording
    case error
}

struct ULSAWindPiPSnapshot {
    let windSpeedMps: Double?
    let windDirectionDegrees: Double?
    let temperatureCelsius: Double?
    let soundSpeedMps: Double?
    let headingSpeedMps: Double?
    let windSpeedAverage10mMps: Double?
    let windSpeedUnit: String
    let dataState: ULSAWindPiPDataState
    let cardLogState: ULSAWindPiPLogState
    let cardLogDetail: String?
    let appLogState: ULSAWindPiPLogState
    let appLogDetail: String?
    let themeVariant: ULSAWindRoseThemeVariant
    let capturedAtMs: Double

    var hasLiveData: Bool {
        dataState == .live && windSpeedMps != nil && windDirectionDegrees != nil
    }
}

final class ULSAWindPiPRenderer {
    static let width = 640
    static let height = 360
    // Keep the guide renderer available for a future option while leaving the
    // default PiP presentation as clean as the in-app gauge.
    private static let showsMaximumExtensionRingByDefault = false
    private static let rayWidth = CGFloat(height) * 0.007
    private static let overlaySidePadding: CGFloat = 28
    private static let overlayLogBadgeWidth: CGFloat = 150
    private static let overlayLogBadgeGap: CGFloat = 8
    private static let overlayStatusWidth: CGFloat = 198
    // Keep the status clear of the rounded PiP crop at the right edge.
    private static let overlayStatusRightPadding: CGFloat = 35

    private struct ActiveWindRay {
        let angle: Double
        let innerRadius: CGFloat
        let alpha: CGFloat
    }

    private struct SemanticColors {
        let disabled: UIColor
        let ready: UIColor
        let recording: UIColor
        let error: UIColor
    }

    private let motionModel = ULSAWindRoseMotionModel()
    private(set) var needsAnimation = false
    private lazy var pixelBufferPool: CVPixelBufferPool? = {
        let poolAttributes: [CFString: Any] = [
            kCVPixelBufferPoolMinimumBufferCountKey: 3,
        ]
        let pixelAttributes: [CFString: Any] = [
            kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey: Self.width,
            kCVPixelBufferHeightKey: Self.height,
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true,
            kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary,
        ]
        var pool: CVPixelBufferPool?
        guard CVPixelBufferPoolCreate(
            kCFAllocatorDefault,
            poolAttributes as CFDictionary,
            pixelAttributes as CFDictionary,
            &pool
        ) == kCVReturnSuccess else {
            return nil
        }
        return pool
    }()

    func render(snapshot: ULSAWindPiPSnapshot, now: TimeInterval) -> CVPixelBuffer? {
        guard let pixelBuffer = makePixelBuffer() else { return nil }
        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
        guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else { return nil }
        let bitmapInfo = CGBitmapInfo.byteOrder32Little.rawValue
            | CGImageAlphaInfo.premultipliedFirst.rawValue
        guard let context = CGContext(
            data: baseAddress,
            width: Self.width,
            height: Self.height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: bitmapInfo
        ) else { return nil }

        context.translateBy(x: 0, y: CGFloat(Self.height))
        context.scaleBy(x: 1, y: -1)
        motionModel.setTarget(
            speedMps: snapshot.windSpeedMps,
            directionDegrees: snapshot.windDirectionDegrees,
            isLive: snapshot.hasLiveData,
            now: now,
            sampleTimestamp: snapshot.capturedAtMs / 1_000
        )
        let frame = motionModel.advance(now: now)
        needsAnimation = frame.needsAnimation
        draw(snapshot: snapshot, frame: frame, in: context)
        return pixelBuffer
    }

    private func makePixelBuffer() -> CVPixelBuffer? {
        guard let pixelBufferPool else { return nil }
        var pixelBuffer: CVPixelBuffer?
        let status = CVPixelBufferPoolCreatePixelBuffer(
            kCFAllocatorDefault,
            pixelBufferPool,
            &pixelBuffer
        )
        return status == kCVReturnSuccess ? pixelBuffer : nil
    }

    private func draw(
        snapshot: ULSAWindPiPSnapshot,
        frame: ULSAWindRoseMotionFrame,
        in context: CGContext
    ) {
        let colors = ULSAWindRoseTheme.palette(speed: frame.speedMps, theme: snapshot.themeVariant)
        context.setFillColor(colors.background.cgColor)
        context.fill(CGRect(x: 0, y: 0, width: Self.width, height: Self.height))

        // Keep the wind field dominant while reserving a stable telemetry
        // column on the left. Direction and current speed use the same
        // in-gauge hierarchy as the normal measurement screen.
        let center = CGPoint(x: 458, y: 184)
        let outerRadius: CGFloat = 132
        let baselineInnerRadius = outerRadius * 0.905
        let maximumInnerRadius = outerRadius * 0.50
        if Self.showsMaximumExtensionRingByDefault {
            drawMaximumRing(center: center, radius: maximumInnerRadius, color: colors.ring, context: context)
        }
        drawBaselineBars(
            center: center,
            outerRadius: outerRadius,
            innerRadius: baselineInnerRadius,
            color: colors.baseline,
            context: context
        )

        if snapshot.hasLiveData {
            drawActiveWind(
                frame: frame,
                center: center,
                outerRadius: outerRadius,
                maximumInnerRadius: maximumInnerRadius,
                colors: colors,
                context: context
            )
        }
        drawGaugeCenterMetrics(
            snapshot: snapshot,
            frame: frame,
            center: center,
            colors: colors,
            context: context
        )
        drawOverlay(snapshot: snapshot, frame: frame, colors: colors, context: context)
    }

    private func drawGaugeCenterMetrics(
        snapshot: ULSAWindPiPSnapshot,
        frame: ULSAWindRoseMotionFrame,
        center: CGPoint,
        colors: ULSAWindRoseRenderPalette,
        context: CGContext
    ) {
        let live = snapshot.hasLiveData
        let valueColor = live ? colors.text : colors.secondary
        let direction = live ? "\(Int(frame.peakDirectionDegrees.rounded()))°" : "--"
        let speed = live ? formatSpeed(frame.speedMps, unit: snapshot.windSpeedUnit) : "--"

        drawText(
            direction,
            rect: CGRect(x: center.x - 102, y: center.y - 76, width: 204, height: 58),
            font: .monospacedDigitSystemFont(ofSize: 50, weight: .bold),
            color: valueColor,
            alignment: .center,
            context: context
        )
        drawText(
            speed,
            rect: CGRect(x: center.x - 102, y: center.y - 16, width: 204, height: 58),
            font: .monospacedDigitSystemFont(ofSize: 50, weight: .bold),
            color: valueColor,
            alignment: .center,
            context: context
        )
        drawText(
            snapshot.windSpeedUnit,
            rect: CGRect(x: center.x - 102, y: center.y + 45, width: 204, height: 36),
            font: .systemFont(ofSize: 30, weight: .bold),
            color: live ? colors.highlight : colors.secondary,
            alignment: .center,
            context: context
        )
    }

    private func drawMaximumRing(center: CGPoint, radius: CGFloat, color: UIColor, context: CGContext) {
        context.saveGState()
        context.setStrokeColor(color.cgColor)
        context.setLineWidth(1.4)
        context.setLineDash(phase: 0, lengths: [4, 5])
        context.strokeEllipse(in: CGRect(
            x: center.x - radius, y: center.y - radius,
            width: radius * 2, height: radius * 2
        ))
        context.restoreGState()
    }

    private func drawBaselineBars(
        center: CGPoint,
        outerRadius: CGFloat,
        innerRadius: CGFloat,
        color: UIColor,
        context: CGContext
    ) {
        context.saveGState()
        context.setStrokeColor(color.cgColor)
        context.setLineWidth(Self.rayWidth)
        context.setLineCap(.round)
        for index in 0..<ULSAWindRoseMotionModel.barCount {
            strokeRadialLine(
                center: center,
                angle: Double(index) * ULSAWindRoseMotionModel.barStepDegrees,
                from: outerRadius,
                to: innerRadius,
                context: context
            )
        }
        context.restoreGState()
    }

    /// The motion model has already combined the current core and wake into a
    /// single 120-bin field. Every nonzero bin receives the same fixed neon
    /// layers, so line weight remains stable across a discrete 3-degree ray.
    private func drawActiveWind(
        frame: ULSAWindRoseMotionFrame,
        center: CGPoint,
        outerRadius: CGFloat,
        maximumInnerRadius: CGFloat,
        colors: ULSAWindRoseRenderPalette,
        context: CGContext
    ) {
        let maximumLength = outerRadius - maximumInnerRadius
        let minimumActiveLength = max(0.65, outerRadius * 0.005)
        var rays: [ActiveWindRay] = []
        rays.reserveCapacity(frame.rayActivity.count)
        for (index, activity) in frame.rayActivity.enumerated() where activity >= 0.003 {
            let angle = Double(index) * ULSAWindRoseMotionModel.barStepDegrees
            let activeLength = minimumActiveLength
                + (maximumLength - minimumActiveLength) * CGFloat(activity)
            let activeAlpha = min(
                1,
                colors.minimumStrokeAlpha
                    + pow(activity, 0.52) * (1 - colors.minimumStrokeAlpha)
            )
            rays.append(ActiveWindRay(
                angle: angle,
                innerRadius: outerRadius - activeLength,
                alpha: CGFloat(activeAlpha)
            ))
        }

        drawActiveWindLayer(
            rays: rays, center: center, outerRadius: outerRadius,
            color: colors.primary, lineWidth: Self.rayWidth, opacity: 1,
            shadowColor: colors.glow,
            shadowBlur: max(6, CGFloat(Self.height) * colors.glowBlurRatio),
            context: context
        )
        drawActiveWindLayer(
            rays: rays, center: center, outerRadius: outerRadius,
            color: colors.primary, lineWidth: Self.rayWidth,
            opacity: colors.innerGlowOpacity, shadowColor: colors.glow,
            shadowBlur: max(2, CGFloat(Self.height) * colors.innerGlowBlurRatio),
            context: context
        )
        drawActiveWindLayer(
            rays: rays, center: center, outerRadius: outerRadius,
            color: colors.highlight, lineWidth: Self.rayWidth * colors.coreWidthRatio,
            opacity: colors.coreOpacity, shadowColor: nil, shadowBlur: 0,
            context: context
        )
    }

    private func drawActiveWindLayer(
        rays: [ActiveWindRay],
        center: CGPoint,
        outerRadius: CGFloat,
        color: UIColor,
        lineWidth: CGFloat,
        opacity: CGFloat,
        shadowColor: UIColor?,
        shadowBlur: CGFloat,
        context: CGContext
    ) {
        context.saveGState()
        context.setLineCap(.round)
        context.setStrokeColor(color.cgColor)
        if let shadowColor {
            context.setShadow(offset: .zero, blur: shadowBlur, color: shadowColor.cgColor)
        }
        context.setLineWidth(lineWidth)
        for ray in rays {
            context.setAlpha(min(1, ray.alpha * opacity))
            strokeRadialLine(
                center: center,
                angle: ray.angle,
                from: outerRadius,
                to: ray.innerRadius,
                context: context
            )
        }
        context.restoreGState()
    }

    private func drawOverlay(
        snapshot: ULSAWindPiPSnapshot,
        frame: ULSAWindRoseMotionFrame,
        colors: ULSAWindRoseRenderPalette,
        context: CGContext
    ) {
        let semanticColors = semanticColors(theme: snapshot.themeVariant, fallback: colors.secondary)
        drawLogBadge(
            label: "カード",
            state: snapshot.cardLogState,
            detail: snapshot.cardLogDetail,
            rect: CGRect(
                x: Self.overlaySidePadding,
                y: 10,
                width: Self.overlayLogBadgeWidth,
                height: 43
            ),
            semanticColors: semanticColors,
            context: context
        )
        drawLogBadge(
            label: "アプリ",
            state: snapshot.appLogState,
            detail: snapshot.appLogDetail,
            rect: CGRect(
                x: Self.overlaySidePadding + Self.overlayLogBadgeWidth + Self.overlayLogBadgeGap,
                y: 10,
                width: Self.overlayLogBadgeWidth,
                height: 43
            ),
            semanticColors: semanticColors,
            context: context
        )

        let status = dataStatus(snapshot: snapshot)
        drawText(
            status.text,
            rect: CGRect(
                x: CGFloat(Self.width) - Self.overlayStatusRightPadding - Self.overlayStatusWidth,
                y: 2,
                width: Self.overlayStatusWidth,
                height: 58
            ),
            font: .systemFont(ofSize: status.text == "LIVE" ? 39 : 22, weight: .bold),
            color: status.color(semanticColors),
            alignment: .right, context: context
        )

        let live = snapshot.hasLiveData
        drawTelemetryMetric(
            label: "音速",
            value: live ? formatDecimal(snapshot.soundSpeedMps, fractionDigits: 1) : "--",
            unit: "m/s",
            top: 58,
            colors: colors,
            live: live && snapshot.soundSpeedMps != nil,
            context: context
        )
        drawTelemetryMetric(
            label: "音仮温度",
            value: live ? formatDecimal(snapshot.temperatureCelsius, fractionDigits: 1) : "--",
            unit: "°C",
            top: 130,
            colors: colors,
            live: live && snapshot.temperatureCelsius != nil,
            context: context
        )
        drawTelemetryMetric(
            label: "正面風速成分",
            value: live ? formatOptionalSpeed(snapshot.headingSpeedMps, unit: snapshot.windSpeedUnit) : "--",
            unit: snapshot.windSpeedUnit,
            top: 202,
            colors: colors,
            live: live && snapshot.headingSpeedMps != nil,
            context: context
        )
        drawTelemetryMetric(
            label: "10分平均風速",
            value: live ? formatOptionalSpeed(snapshot.windSpeedAverage10mMps, unit: snapshot.windSpeedUnit) : "--",
            unit: snapshot.windSpeedUnit,
            top: 274,
            colors: colors,
            live: live && snapshot.windSpeedAverage10mMps != nil,
            context: context
        )
    }

    private func drawTelemetryMetric(
        label: String,
        value: String,
        unit: String,
        top: CGFloat,
        colors: ULSAWindRoseRenderPalette,
        live: Bool,
        context: CGContext
    ) {
        drawText(
            label,
            rect: CGRect(x: 16, y: top, width: 300, height: 25),
            font: .systemFont(ofSize: 21, weight: .semibold),
            color: colors.secondary,
            alignment: .left,
            context: context
        )
        drawText(
            value,
            rect: CGRect(x: 16, y: top + 22, width: 170, height: 48),
            font: .monospacedDigitSystemFont(ofSize: 35, weight: .bold),
            color: live ? colors.text : colors.secondary,
            alignment: .right,
            context: context
        )
        drawText(
            unit,
            rect: CGRect(x: 192, y: top + 34, width: 110, height: 30),
            font: .systemFont(ofSize: 23, weight: .semibold),
            color: live ? colors.highlight : colors.secondary,
            alignment: .left,
            context: context
        )
    }

    private func drawLogBadge(
        label: String,
        state: ULSAWindPiPLogState,
        detail: String?,
        rect: CGRect,
        semanticColors: SemanticColors,
        context: CGContext
    ) {
        let color = logColor(state: state, semanticColors: semanticColors)
        let stateText: String
        switch state {
        case .disabled: stateText = "OFF"
        case .ready: stateText = "待機"
        case .recording: stateText = "記録"
        case .error: stateText = detail ?? "異常"
        }

        context.saveGState()
        let path = UIBezierPath(roundedRect: rect, cornerRadius: rect.height / 2)
        context.setFillColor(color.withAlphaComponent(0.12).cgColor)
        context.addPath(path.cgPath)
        context.fillPath()
        context.setStrokeColor(color.withAlphaComponent(state == .disabled ? 0.42 : 0.82).cgColor)
        context.setLineWidth(1.25)
        context.addPath(path.cgPath)
        context.strokePath()
        context.restoreGState()

        let font = UIFont.systemFont(ofSize: state == .error && detail != nil ? 18 : 23, weight: .bold)
        let text = "\(label) \(stateText)"
        let textSize = (text as NSString).size(withAttributes: [.font: font])

        drawText(
            text,
            rect: CGRect(
                x: rect.minX + 6,
                y: rect.midY - textSize.height / 2,
                width: rect.width - 12,
                height: textSize.height + 2
            ),
            font: font,
            color: color,
            alignment: .center,
            context: context
        )
    }

    private func semanticColors(theme: ULSAWindRoseThemeVariant, fallback: UIColor) -> SemanticColors {
        switch theme {
        case .light:
            return SemanticColors(
                disabled: fallback.withAlphaComponent(0.58),
                ready: UIColor(red: 21 / 255, green: 128 / 255, blue: 92 / 255, alpha: 1),
                recording: UIColor(red: 214 / 255, green: 57 / 255, blue: 80 / 255, alpha: 1),
                error: UIColor(red: 185 / 255, green: 106 / 255, blue: 19 / 255, alpha: 1)
            )
        case .graphite, .slate:
            return SemanticColors(
                disabled: fallback.withAlphaComponent(0.64),
                ready: UIColor(red: 101 / 255, green: 230 / 255, blue: 167 / 255, alpha: 1),
                recording: UIColor(red: 255 / 255, green: 102 / 255, blue: 120 / 255, alpha: 1),
                error: UIColor(red: 245 / 255, green: 165 / 255, blue: 76 / 255, alpha: 1)
            )
        }
    }

    private func logColor(state: ULSAWindPiPLogState, semanticColors: SemanticColors) -> UIColor {
        switch state {
        case .disabled: return semanticColors.disabled
        case .ready: return semanticColors.ready
        case .recording: return semanticColors.recording
        case .error: return semanticColors.error
        }
    }

    private func dataStatus(
        snapshot: ULSAWindPiPSnapshot
    ) -> (text: String, color: (SemanticColors) -> UIColor) {
        if snapshot.hasLiveData {
            return ("LIVE", { $0.ready })
        }
        switch snapshot.dataState {
        case .live, .waiting: return ("データ待ち", { $0.error })
        case .stale: return ("DATA STOPPED", { $0.recording })
        case .disconnected: return ("未接続", { $0.disabled })
        }
    }

    private func formatDecimal(_ value: Double?, fractionDigits: Int) -> String {
        guard let value, value.isFinite else { return "--" }
        return String(format: "%.*f", fractionDigits, value)
    }

    private func drawText(
        _ text: String,
        rect: CGRect,
        font: UIFont,
        color: UIColor,
        alignment: NSTextAlignment,
        context: CGContext
    ) {
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = alignment
        UIGraphicsPushContext(context)
        (text as NSString).draw(in: rect, withAttributes: [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: paragraph,
        ])
        UIGraphicsPopContext()
    }

    private func strokeRadialLine(
        center: CGPoint,
        angle: Double,
        from outerRadius: CGFloat,
        to innerRadius: CGFloat,
        context: CGContext
    ) {
        let radians = (angle - 90) * .pi / 180
        context.move(to: CGPoint(
            x: center.x + CGFloat(cos(radians)) * outerRadius,
            y: center.y + CGFloat(sin(radians)) * outerRadius
        ))
        context.addLine(to: CGPoint(
            x: center.x + CGFloat(cos(radians)) * innerRadius,
            y: center.y + CGFloat(sin(radians)) * innerRadius
        ))
        context.strokePath()
    }

    private func formatSpeed(_ speedMps: Double, unit: String) -> String {
        let converted: Double
        switch unit {
        case "km/h": converted = speedMps * 3.6
        case "cm/s": converted = speedMps * 100
        default: converted = speedMps
        }
        if unit == "cm/s" { return String(format: "%.0f", converted) }
        return String(format: unit == "km/h" ? "%.1f" : "%.2f", converted)
    }

    private func formatOptionalSpeed(_ speedMps: Double?, unit: String) -> String {
        guard let speedMps, speedMps.isFinite else { return "--" }
        return formatSpeed(speedMps, unit: unit)
    }
}
