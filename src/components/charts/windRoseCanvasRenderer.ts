import { convertWindSpeed, type WindSpeedUnit } from '../../utils/windSpeedConverter';
import { drawWindRoseCompassReference } from './windRoseCompass';
import {
  createWindRoseGeometry,
  normalizeDegrees,
  projectWindRosePoint,
  type WindRoseBarGeometry,
} from './windRoseGaugeMath';
import {
  WIND_ROSE_BAR_STEP_DEGREES,
  type WindRoseMotionFrame,
} from './windRoseMotionModel';
import {
  getWindRosePeakHoldPalette,
  getWindRosePaletteForSpeed,
  getWindRoseSurfacePalette,
  type WindRosePeakHoldBankIndex,
  type WindRoseThemeVariant,
} from './windRoseTheme';

export interface WindRoseCanvasRenderInput {
  width: number;
  height: number;
  frame: WindRoseMotionFrame;
  unit: WindSpeedUnit;
  hasCurrentWindData: boolean;
  hasCurrentWindDirection?: boolean;
  isTilted: boolean;
  tiltDegrees: number;
  theme: WindRoseThemeVariant;
  trueHeading: number | null;
  headingAccuracy: number | null;
  /** GNSS mode can replace the upper direction metric with platform ground speed. */
  centerPrimaryMetric?: WindRoseCenterPrimaryMetric;
  /** Raw iOS GNSS ground speed. This is display-only and does not affect wind math. */
  groundSpeedMps?: number | null;
  directionReference?: WindRoseDirectionReference;
  peakHolds?: readonly WindRosePeakHoldSnapshot[];
  /** Pre-rendered baseline/ring layer at the current size, DPR, theme, and tilt. */
  staticLayer?: CanvasImageSource | null;
}

export interface WindRoseStaticLayerRenderInput {
  width: number;
  height: number;
  isTilted: boolean;
  tiltDegrees: number;
  theme: WindRoseThemeVariant;
}

export type WindRoseDirectionReference =
  | 'ulsa'
  | 'trueNorth'
  | 'trueWind'
  | 'gnssPending';

export type WindRoseCenterPrimaryMetric = 'windDirection' | 'groundSpeed';

export interface WindRoseCapturedFrameSnapshot {
  /** Activity captured on the same 120-ray lattice as the live gauge. */
  rayActivity: Float32Array;
  speedMps: number;
  displayDirectionDegrees: number;
  /** Reserved for backwards-compatible snapshots; live captures use screen-relative 0°. */
  displayRotationDegrees: number;
  /** Reference frame fixed at capture time; true north remains meaningful even at heading 0°. */
  directionReference: WindRoseDirectionReference;
}

export interface WindRosePeakHoldSnapshot extends WindRoseCapturedFrameSnapshot {
  /** Stable bank identity; it must not depend on the filtered render-array index. */
  bankIndex: WindRosePeakHoldBankIndex;
}

// Retain the maximum-extension guide implementation for a possible future UI
// option, but keep the product display uncluttered by default.
const SHOW_MAXIMUM_EXTENSION_RING_BY_DEFAULT = false;

const drawBar = (
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  bar: WindRoseBarGeometry,
  innerRadius: number,
  size: number,
  isTilted: boolean,
  tiltDegrees: number,
  lineWidth: number,
) => {
  const outer = projectWindRosePoint({
    centerX,
    centerY,
    radius: bar.outerRadius,
    angle: bar.angle,
    size,
    isTilted,
    tiltDegrees,
  });
  const inner = projectWindRosePoint({
    centerX,
    centerY,
    radius: innerRadius,
    angle: bar.angle,
    size,
    isTilted,
    tiltDegrees,
  });
  context.lineWidth = lineWidth * ((outer.scale + inner.scale) / 2);
  context.beginPath();
  context.moveTo(outer.x, outer.y);
  context.lineTo(inner.x, inner.y);
  context.stroke();
};

interface WindRoseActiveRay {
  bar: WindRoseBarGeometry;
  innerRadius: number;
  alpha: number;
}

const drawActiveRayLayer = (
  context: CanvasRenderingContext2D,
  rays: readonly WindRoseActiveRay[],
  centerX: number,
  centerY: number,
  size: number,
  isTilted: boolean,
  tiltDegrees: number,
  strokeStyle: string,
  lineWidth: number,
  opacity: number,
  shadowColor = 'rgba(0, 0, 0, 0)',
  shadowBlur = 0,
): void => {
  context.save();
  context.lineCap = 'round';
  context.strokeStyle = strokeStyle;
  context.shadowColor = shadowColor;
  context.shadowBlur = shadowBlur;
  rays.forEach((ray) => {
    context.globalAlpha = Math.min(1, ray.alpha * opacity);
    drawBar(
      context,
      centerX,
      centerY,
      ray.bar,
      ray.innerRadius,
      size,
      isTilted,
      tiltDegrees,
      lineWidth,
    );
  });
  context.restore();
};

const drawMaximumExtensionRing = (
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  size: number,
  isTilted: boolean,
  tiltDegrees: number,
) => {
  const step = 3;
  const first = projectWindRosePoint({
    centerX,
    centerY,
    radius,
    angle: 0,
    size,
    isTilted,
    tiltDegrees,
  });
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (let angle = step; angle <= 360; angle += step) {
    const point = projectWindRosePoint({
      centerX,
      centerY,
      radius,
      angle,
      size,
      isTilted,
      tiltDegrees,
    });
    context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.stroke();
};

const formatWindSpeed = (windSpeed: number, unit: WindSpeedUnit): string => {
  const converted = convertWindSpeed(windSpeed, unit);
  if (unit === 'cm/s') return Math.round(converted).toString();
  return converted.toFixed(unit === 'km/h' ? 1 : 2);
};

const CENTER_VALUE_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif';
const TABULAR_DIGIT_ADVANCE_CACHE = new WeakMap<
  CanvasRenderingContext2D,
  { font: string; advance: number }
>();

const setCenterValueFont = (
  context: CanvasRenderingContext2D,
  size: number,
): void => {
  // Match the conventional ECharts gauge: SF Pro/system display face,
  // weight 700, and 50px at the 400px reference size.
  const valueFontSize = Math.max(28, size * 0.125);
  context.font = `700 ${valueFontSize}px ${CENTER_VALUE_FONT_FAMILY}`;
};

const drawCenteredUnit = (
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  size: number,
  unit: string,
  color: string,
): void => {
  const unitFontSize = Math.max(13, size * 0.0475);
  context.font = `700 ${unitFontSize}px ${CENTER_VALUE_FONT_FAMILY}`;
  context.textAlign = 'center';
  context.fillStyle = color;
  context.fillText(unit, centerX, centerY);
};

/**
 * Draw the GNSS ground-speed unit beside the upper metric without ever moving
 * that metric away from the exact canvas center. Its anchor reserves the
 * largest normal representation for the selected unit, so it also does not
 * jitter as the current speed gains or loses digits.
 */
const drawGroundSpeedInlineUnit = (
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  size: number,
  unit: WindSpeedUnit,
  color: string,
): void => {
  const representativeValue = unit === 'm/s'
    ? '99.99'
    : unit === 'km/h'
      ? '999.9'
      : '9999';
  setCenterValueFont(context, size);
  const reservedValueWidth = getTabularValueWidth(context, representativeValue);
  context.font = `700 ${Math.max(12, size * 0.041)}px ${CENTER_VALUE_FONT_FAMILY}`;
  context.textAlign = 'left';
  context.fillStyle = color;
  context.fillText(unit, centerX + reservedValueWidth / 2 + Math.max(3, size * 0.012), centerY);
};

const getTabularGlyphAdvance = (
  context: CanvasRenderingContext2D,
  glyph: string,
  digitAdvance: number,
): number => {
  if (/\d/.test(glyph)) return digitAdvance;
  if (glyph === '.') return Math.max(context.measureText(glyph).width, digitAdvance * 0.34);
  if (glyph === '-' || glyph === '+') {
    return Math.max(context.measureText(glyph).width, digitAdvance * 0.68);
  }
  return Math.max(context.measureText(glyph).width, digitAdvance * 0.5);
};

const getTabularDigitAdvance = (context: CanvasRenderingContext2D): number => {
  const cached = TABULAR_DIGIT_ADVANCE_CACHE.get(context);
  if (cached?.font === context.font) return cached.advance;
  const advance = Math.max(
    1,
    ...Array.from({ length: 10 }, (_, digit) => context.measureText(String(digit)).width),
  );
  TABULAR_DIGIT_ADVANCE_CACHE.set(context, { font: context.font, advance });
  return advance;
};

const getTabularValueWidth = (
  context: CanvasRenderingContext2D,
  value: string,
): number => {
  const digitAdvance = getTabularDigitAdvance(context);
  return Array.from(value).reduce(
    (width, glyph) => width + getTabularGlyphAdvance(context, glyph, digitAdvance),
    0,
  );
};

/**
 * Draw an SF Pro numeric value on fixed-width digit cells.
 *
 * Canvas 2D does not expose CSS `font-variant-numeric: tabular-nums`, so a
 * normal centered `fillText()` can still appear to wobble as proportional
 * digits change. Laying the glyphs out on the widest digit advance keeps the
 * numeric center on `centerX` and prevents same-length values from changing
 * their visual width while retaining the same font as the conventional gauge.
 */
const drawCenteredTabularValue = (
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  size: number,
  value: string,
  color: string,
): number => {
  setCenterValueFont(context, size);
  context.fillStyle = color;
  context.textAlign = 'center';
  const digitAdvance = getTabularDigitAdvance(context);
  const glyphs = Array.from(value);
  const advances = glyphs.map((glyph) => getTabularGlyphAdvance(context, glyph, digitAdvance));
  const totalWidth = getTabularValueWidth(context, value);
  let cursorX = centerX - totalWidth / 2;
  glyphs.forEach((glyph, index) => {
    const advance = advances[index];
    context.fillText(glyph, cursorX + advance / 2, centerY);
    cursorX += advance;
  });
  return totalWidth;
};

export const drawWindRoseStaticLayer = (
  context: CanvasRenderingContext2D,
  input: WindRoseStaticLayerRenderInput,
): void => {
  const {
    width,
    height,
    isTilted,
    tiltDegrees,
    theme,
  } = input;
  const size = Math.min(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const geometry = createWindRoseGeometry({ size });
  const surface = getWindRoseSurfacePalette(theme);
  const lineWidth = Math.max(1.3, size * 0.007);
  const rayWidth = lineWidth;
  if (SHOW_MAXIMUM_EXTENSION_RING_BY_DEFAULT) {
    context.save();
    context.lineWidth = Math.max(1, size * 0.0032);
    context.lineCap = 'round';
    context.setLineDash([Math.max(2, size * 0.012), Math.max(3, size * 0.017)]);
    context.strokeStyle = surface.maximumExtensionRing;
    drawMaximumExtensionRing(
      context,
      centerX,
      centerY,
      geometry.maximumActiveInnerRadius,
      size,
      isTilted,
      tiltDegrees,
    );
    context.restore();
  }

  context.save();
  context.lineCap = 'round';
  context.strokeStyle = surface.baseline;
  geometry.bars.forEach((bar) => {
    drawBar(context, centerX, centerY, bar, bar.baselineInnerRadius, size, isTilted, tiltDegrees, rayWidth);
  });
  context.restore();
};

export const drawWindRoseCanvas = (
  context: CanvasRenderingContext2D,
  input: WindRoseCanvasRenderInput,
): void => {
  const {
    width,
    height,
    frame,
    unit,
    hasCurrentWindData,
    hasCurrentWindDirection = hasCurrentWindData,
    isTilted,
    tiltDegrees,
    theme,
    trueHeading,
    headingAccuracy,
    centerPrimaryMetric = 'windDirection',
    groundSpeedMps = null,
    directionReference = trueHeading === null ? 'ulsa' : 'trueNorth',
    peakHolds = [],
    staticLayer = null,
  } = input;
  const size = Math.min(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const displayRotation = trueHeading ?? 0;
  const rawDisplayDirection = normalizeDegrees(frame.peakDirectionDegrees + displayRotation);
  const geometry = createWindRoseGeometry({ size });
  const palette = getWindRosePaletteForSpeed(hasCurrentWindData ? frame.speedMps : null, theme);
  const surface = getWindRoseSurfacePalette(theme);
  const lineWidth = Math.max(1.3, size * 0.007);
  const rayWidth = lineWidth;
  const maximumLength = geometry.outerRadius - geometry.maximumActiveInnerRadius;

  context.clearRect(0, 0, width, height);
  if (staticLayer) {
    context.drawImage(staticLayer, 0, 0, width, height);
  } else {
    drawWindRoseStaticLayer(context, { width, height, isTilted, tiltDegrees, theme });
  }

  if (peakHolds.length > 0) {
    const templateBar = geometry.bars[0];
    const minimumActiveLength = Math.max(0.65, geometry.outerRadius * 0.005);
    context.save();
    context.lineCap = 'round';
    peakHolds.forEach((hold) => {
      const holdPalette = getWindRosePeakHoldPalette(theme, hold.bankIndex);
      context.strokeStyle = holdPalette.stroke;
      context.shadowColor = holdPalette.glow;
      context.shadowBlur = Math.max(2, size * 0.009);
      const displayBinOffset = Math.round(
        hold.displayRotationDegrees / WIND_ROSE_BAR_STEP_DEGREES,
      );
      hold.rayActivity.forEach((activity, index) => {
        if (activity < 0.003) return;
        const displayIndex = (index + displayBinOffset + hold.rayActivity.length)
          % hold.rayActivity.length;
        const heldBar = {
          ...templateBar,
          angle: displayIndex * WIND_ROSE_BAR_STEP_DEGREES,
        };
        const heldLength = minimumActiveLength
          + (maximumLength - minimumActiveLength) * activity;
        context.globalAlpha = Math.min(0.92, 0.52 + Math.pow(activity, 0.58) * 0.4);
        drawBar(
          context,
          centerX,
          centerY,
          heldBar,
          geometry.outerRadius - heldLength,
          size,
          isTilted,
          tiltDegrees,
          rayWidth,
        );
      });
    });
    context.restore();
  }

  if (hasCurrentWindData && hasCurrentWindDirection) {
    const templateBar = geometry.bars[0];
    const minimumActiveLength = Math.max(0.65, geometry.outerRadius * 0.005);
    const activeRays: WindRoseActiveRay[] = [];
    frame.rayActivity.forEach((activity, index) => {
      if (activity < 0.003) return;
      // The sensor axis is fixed to the iPhone screen. Heading rotates the
      // geographic NEWS overlay and numeric bearing, never the sensed rays.
      const activeAngle = index * WIND_ROSE_BAR_STEP_DEGREES;
      const activeLength = minimumActiveLength
        + (maximumLength - minimumActiveLength) * activity;
      const activeBar = {
        ...templateBar,
        angle: activeAngle,
      };
      const activeAlpha = Math.min(
        1,
        palette.minimumStrokeAlpha
          + Math.pow(activity, 0.52) * (1 - palette.minimumStrokeAlpha),
      );
      activeRays.push({
        bar: activeBar,
        innerRadius: geometry.outerRadius - activeLength,
        alpha: activeAlpha,
      });
    });

    // Preserve one semantic 120-bin field while rendering it through fixed
    // neon layers. The outer/body pass retains the previous geometry, the
    // tighter bloom adds luminous density, and the narrow highlight restores
    // a crisp core without widening or rearranging the three-degree rays.
    const paintGlowLayer = (opacity: number, blur: number) => {
      drawActiveRayLayer(
        context, activeRays, centerX, centerY, size, isTilted, tiltDegrees,
        palette.primary, rayWidth, opacity,
        palette.glow, blur,
      );
    };
    paintGlowLayer(1, Math.max(6, size * palette.glowBlurRatio));
    paintGlowLayer(palette.innerGlowOpacity, Math.max(2, size * palette.innerGlowBlurRatio));
    drawActiveRayLayer(
      context, activeRays, centerX, centerY, size, isTilted, tiltDegrees,
      palette.highlight, rayWidth * palette.coreWidthRatio, palette.coreOpacity,
    );
  }

  if (trueHeading !== null) {
    drawWindRoseCompassReference(
      context,
      width,
      height,
      centerX,
      centerY,
      geometry,
      trueHeading,
      headingAccuracy,
      size,
      isTilted,
      tiltDegrees,
      theme === 'light',
    );
  }

  context.save();
  context.textBaseline = 'middle';
  // Direction and speed occupy two rows symmetrically around the exact gauge
  // center. Units are satellites and never participate in the numeric center.
  const metricRowSeparation = Math.max(39, size * 0.14);
  const valueColor = hasCurrentWindData ? surface.value : surface.emptyValue;
  const unitColor = hasCurrentWindData ? palette.highlight : surface.emptyUnit;
  const showGroundSpeed = centerPrimaryMetric === 'groundSpeed';
  const hasGroundSpeed = groundSpeedMps !== null
    && Number.isFinite(groundSpeedMps)
    && groundSpeedMps >= 0;
  const primaryText = showGroundSpeed
    ? hasGroundSpeed ? formatWindSpeed(groundSpeedMps, unit) : '--'
    : hasCurrentWindData && hasCurrentWindDirection
      ? `${Math.round(rawDisplayDirection)}`
      : '--';
  const primaryValueColor = showGroundSpeed && hasGroundSpeed ? surface.value : valueColor;
  const directionY = centerY - metricRowSeparation / 2;
  drawCenteredTabularValue(
    context,
    centerX,
    directionY,
    size,
    primaryText,
    primaryValueColor,
  );
  if (showGroundSpeed) {
    // A location update may briefly be unavailable after the user switches
    // from bearing to ground speed. That state is still a speed metric (`--`),
    // never a bearing, so a stale degree suffix must not be drawn.
    if (hasGroundSpeed) {
      drawGroundSpeedInlineUnit(
        context,
        centerX,
        directionY,
        size,
        unit,
        palette.highlight,
      );
    }
  } else if (hasCurrentWindData && hasCurrentWindDirection) {
    setCenterValueFont(context, size);
    const directionReservedWidth = getTabularDigitAdvance(context) * 3;
    context.textAlign = 'left';
    context.fillStyle = valueColor;
    context.fillText('°', centerX + directionReservedWidth / 2 + Math.max(2, size * 0.008), directionY);
  }
  const speedY = centerY + metricRowSeparation / 2;
  drawCenteredTabularValue(
    context,
    centerX,
    speedY,
    size,
    hasCurrentWindData ? formatWindSpeed(frame.speedMps, unit) : '--',
    valueColor,
  );
  // Keep the unit on its own centered row below the speed. The direction and
  // speed values remain symmetric around the gauge center, while the unit
  // stays fixed when the formatted value changes digit count.
  // Leave a deliberate visual gap below the speed value. This prevents the
  // unit glyphs from touching tall digits while keeping their common center
  // coordinate independent of the formatted value width.
  const speedUnitY = speedY + Math.max(19, size * 0.06) + 20;
  drawCenteredUnit(
    context,
    centerX,
    speedUnitY,
    size,
    unit,
    unitColor,
  );
  const referenceLabel = directionReference === 'trueWind'
    ? '真風・参考'
    : directionReference === 'gnssPending'
      ? 'GNSS待機'
      : directionReference === 'trueNorth'
        ? '真北基準'
        : null;
  if (referenceLabel !== null) {
    context.textAlign = 'center';
    context.fillStyle = unitColor;
    context.font = `760 ${Math.max(9, size * 0.027)}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;
    context.fillText(referenceLabel, centerX, directionY - Math.max(23, size * 0.076));
  }
  context.restore();
};
