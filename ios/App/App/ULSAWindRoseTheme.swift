import Foundation
import UIKit

enum ULSAWindRoseThemeVariant: String {
    case graphite
    case slate
    case light
}

struct ULSAWindRoseRenderPalette {
    let background: UIColor
    let text: UIColor
    let secondary: UIColor
    let baseline: UIColor
    let ring: UIColor
    let primary: UIColor
    let highlight: UIColor
    let glow: UIColor
    let minimumStrokeAlpha: CGFloat
    let glowBlurRatio: CGFloat
    let innerGlowBlurRatio: CGFloat
    let innerGlowOpacity: CGFloat
    let coreWidthRatio: CGFloat
    let coreOpacity: CGFloat
    let warning: UIColor
}

enum ULSAWindRoseTheme {
    static let highlightLightnessDelta = 0.06
    static let glowAlpha = 0.90
    static let darkGlowLightnessDelta = 0.14
    static let lightGlowLightnessDelta = -0.12
    static let glowChromaMultiplier = 1.20
    static let minimumStrokeAlpha = 0.54
    static let glowBlurRatio = 0.042
    static let innerGlowBlurRatio = 0.016
    static let innerGlowOpacity = 0.68
    static let coreWidthRatio = 0.42
    static let coreOpacity = 0.90

    private struct Stop {
        let speed: Double
        let hex: String
    }

    private struct RGB {
        let red: Double
        let green: Double
        let blue: Double
    }

    private struct OKLCH {
        let lightness: Double
        let chroma: Double
        let hue: Double
    }

    private static let stops: [ULSAWindRoseThemeVariant: [Stop]] = [
        .graphite: [
            Stop(speed: 0, hex: "#00E6C7"), Stop(speed: 0.5, hex: "#00D9FF"),
            Stop(speed: 5, hex: "#6E8BFF"), Stop(speed: 20, hex: "#D96CFF"),
            Stop(speed: 25, hex: "#FF3B30"),
        ],
        .slate: [
            Stop(speed: 0, hex: "#00E6C7"), Stop(speed: 0.5, hex: "#00D9FF"),
            Stop(speed: 5, hex: "#6E8BFF"), Stop(speed: 20, hex: "#D96CFF"),
            Stop(speed: 25, hex: "#FF3B30"),
        ],
        .light: [
            Stop(speed: 0, hex: "#00E6C7"), Stop(speed: 0.5, hex: "#00D9FF"),
            Stop(speed: 5, hex: "#6E8BFF"), Stop(speed: 20, hex: "#D96CFF"),
            Stop(speed: 25, hex: "#FF3B30"),
        ],
    ]

    static func palette(speed: Double, theme: ULSAWindRoseThemeVariant) -> ULSAWindRoseRenderPalette {
        let primaryRGB = interpolatedColor(speed: max(0, speed), theme: theme)
        let primaryOKLCH = rgbToOKLCH(primaryRGB)
        let highlightRGB = oklchToRGB(OKLCH(
            lightness: clamp(primaryOKLCH.lightness + highlightLightnessDelta),
            chroma: primaryOKLCH.chroma,
            hue: primaryOKLCH.hue
        ))
        // Preserve one physical glow model across themes. A deeper same-hue
        // glow is the only Light-surface correction because a bright blur
        // disappears into a near-white background.
        let glowLightnessDelta = theme == .light
            ? lightGlowLightnessDelta
            : darkGlowLightnessDelta
        let glowRGB = oklchToRGB(OKLCH(
            lightness: clamp(primaryOKLCH.lightness + glowLightnessDelta),
            chroma: primaryOKLCH.chroma * glowChromaMultiplier,
            hue: primaryOKLCH.hue
        ))
        let primary = color(primaryRGB)
        let highlight = color(highlightRGB)
        let glow = color(glowRGB)
        switch theme {
        case .graphite:
            return ULSAWindRoseRenderPalette(
                background: hexColor("#0C1B26"), text: hexColor("#F7FCFD"),
                secondary: UIColor(red: 0.62, green: 0.74, blue: 0.78, alpha: 1),
                baseline: UIColor(red: 0.84, green: 0.91, blue: 0.93, alpha: 0.32),
                ring: UIColor(red: 0.80, green: 0.89, blue: 0.91, alpha: 0.42),
                primary: primary, highlight: highlight,
                glow: glow.withAlphaComponent(CGFloat(glowAlpha)),
                minimumStrokeAlpha: CGFloat(minimumStrokeAlpha),
                glowBlurRatio: CGFloat(glowBlurRatio),
                innerGlowBlurRatio: CGFloat(innerGlowBlurRatio),
                innerGlowOpacity: CGFloat(innerGlowOpacity),
                coreWidthRatio: CGFloat(coreWidthRatio),
                coreOpacity: CGFloat(coreOpacity),
                warning: UIColor(red: 1, green: 0.58, blue: 0.28, alpha: 1)
            )
        case .slate:
            return ULSAWindRoseRenderPalette(
                background: hexColor("#2C4650"), text: hexColor("#F8FCFD"),
                secondary: UIColor(red: 0.78, green: 0.87, blue: 0.89, alpha: 1),
                baseline: UIColor(red: 0.89, green: 0.94, blue: 0.95, alpha: 0.34),
                ring: UIColor(red: 0.89, green: 0.95, blue: 0.96, alpha: 0.50),
                primary: primary, highlight: highlight,
                glow: glow.withAlphaComponent(CGFloat(glowAlpha)),
                minimumStrokeAlpha: CGFloat(minimumStrokeAlpha),
                glowBlurRatio: CGFloat(glowBlurRatio),
                innerGlowBlurRatio: CGFloat(innerGlowBlurRatio),
                innerGlowOpacity: CGFloat(innerGlowOpacity),
                coreWidthRatio: CGFloat(coreWidthRatio),
                coreOpacity: CGFloat(coreOpacity),
                warning: UIColor(red: 1, green: 0.68, blue: 0.36, alpha: 1)
            )
        case .light:
            return ULSAWindRoseRenderPalette(
                background: hexColor("#FAFBFC"), text: hexColor("#10212B"),
                secondary: hexColor("#46616D"),
                baseline: UIColor(red: 0.18, green: 0.31, blue: 0.36, alpha: 0.48),
                ring: UIColor(red: 0.13, green: 0.29, blue: 0.34, alpha: 0.52),
                primary: primary, highlight: highlight,
                glow: glow.withAlphaComponent(CGFloat(glowAlpha)),
                minimumStrokeAlpha: CGFloat(minimumStrokeAlpha),
                glowBlurRatio: CGFloat(glowBlurRatio),
                innerGlowBlurRatio: CGFloat(innerGlowBlurRatio),
                innerGlowOpacity: CGFloat(innerGlowOpacity),
                coreWidthRatio: CGFloat(coreWidthRatio),
                coreOpacity: CGFloat(coreOpacity),
                warning: UIColor(red: 0.65, green: 0.27, blue: 0.02, alpha: 1)
            )
        }
    }

    static func hexForSpeed(_ speed: Double, theme: ULSAWindRoseThemeVariant) -> String {
        let rgb = interpolatedColor(speed: speed, theme: theme)
        return String(format: "#%02X%02X%02X", Int(round(rgb.red * 255)), Int(round(rgb.green * 255)), Int(round(rgb.blue * 255)))
    }

    private static func interpolatedColor(speed: Double, theme: ULSAWindRoseThemeVariant) -> RGB {
        let themeStops = stops[theme] ?? stops[.graphite]!
        let upperIndex = themeStops.firstIndex { speed <= $0.speed } ?? themeStops.count - 1
        let lowerIndex = max(0, upperIndex - 1)
        let lower = themeStops[lowerIndex]
        let upper = themeStops[upperIndex]
        let span = max(upper.speed - lower.speed, Double.leastNonzeroMagnitude)
        let ratio = clamp((speed - lower.speed) / span)
        if ratio == 0 { return rgb(lower.hex) }
        if ratio == 1 { return rgb(upper.hex) }
        let start = rgbToOKLCH(rgb(lower.hex))
        let end = rgbToOKLCH(rgb(upper.hex))
        var hueDelta = end.hue - start.hue
        if hueDelta > 180 { hueDelta -= 360 }
        if hueDelta < -180 { hueDelta += 360 }
        return oklchToRGB(OKLCH(
            lightness: start.lightness + (end.lightness - start.lightness) * ratio,
            chroma: start.chroma + (end.chroma - start.chroma) * ratio,
            hue: (start.hue + hueDelta * ratio + 360).truncatingRemainder(dividingBy: 360)
        ))
    }

    private static func rgbToOKLCH(_ rgb: RGB) -> OKLCH {
        let red = srgbToLinear(rgb.red)
        let green = srgbToLinear(rgb.green)
        let blue = srgbToLinear(rgb.blue)
        let lRoot = pow(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue, 1.0 / 3.0)
        let mRoot = pow(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue, 1.0 / 3.0)
        let sRoot = pow(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue, 1.0 / 3.0)
        let lightness = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot
        let a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot
        let b = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot
        let rawHue = atan2(b, a) * 180 / Double.pi
        return OKLCH(lightness: lightness, chroma: hypot(a, b), hue: rawHue < 0 ? rawHue + 360 : rawHue)
    }

    private static func oklchToRGB(_ color: OKLCH) -> RGB {
        let radians = color.hue * Double.pi / 180
        let a = color.chroma * cos(radians)
        let b = color.chroma * sin(radians)
        let lRoot = color.lightness + 0.3963377774 * a + 0.2158037573 * b
        let mRoot = color.lightness - 0.1055613458 * a - 0.0638541728 * b
        let sRoot = color.lightness - 0.0894841775 * a - 1.291485548 * b
        let l = pow(lRoot, 3)
        let m = pow(mRoot, 3)
        let s = pow(sRoot, 3)
        return RGB(
            red: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            green: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            blue: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
        )
    }

    private static func srgbToLinear(_ value: Double) -> Double {
        value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
    }

    private static func linearToSrgb(_ value: Double) -> Double {
        let value = clamp(value)
        return value <= 0.0031308 ? value * 12.92 : 1.055 * pow(value, 1 / 2.4) - 0.055
    }

    private static func rgb(_ hex: String) -> RGB {
        let value = Int(hex.dropFirst(), radix: 16) ?? 0
        return RGB(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }

    private static func color(_ rgb: RGB) -> UIColor {
        UIColor(red: CGFloat(rgb.red), green: CGFloat(rgb.green), blue: CGFloat(rgb.blue), alpha: 1)
    }

    private static func hexColor(_ hex: String) -> UIColor { color(rgb(hex)) }

    private static func clamp(_ value: Double) -> Double { min(max(value, 0), 1) }
}
