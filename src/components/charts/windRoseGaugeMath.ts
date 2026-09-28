/**
 * 放射状風向風速ゲージの幾何計算。
 *
 * 描画層から分離しておくことで、中心の数値表示をバーが侵食しないことと、
 * 風向の角度処理をCanvas / テストで同じ契約にできる。
 */

// Visual response knee: make a measurable breeze immediately legible while
// retaining logarithmic headroom through the ULSA EVO 25 m/s upper limit.
const LOW_SPEED_RESPONSE_KNEE_MPS = 0.02;
const AUTO_SCALE_REFERENCE_MPS = 25;

export interface WindRoseBarGeometry {
  angle: number;
  outerRadius: number;
  baselineInnerRadius: number;
}

export interface WindRoseGeometry {
  outerRadius: number;
  centerSafeRadius: number;
  maximumActiveInnerRadius: number;
  bars: WindRoseBarGeometry[];
}

export interface WindRoseGeometryInput {
  size: number;
}

export interface WindRoseProjectionInput {
  centerX: number;
  centerY: number;
  radius: number;
  angle: number;
  size: number;
  isTilted: boolean;
  /** 奥行き表示の傾斜角。未指定時は標準の50度。 */
  tiltDegrees?: number;
}

export interface WindRoseProjectedPoint {
  x: number;
  y: number;
  scale: number;
}

const BAR_STEP_DEGREES = 3;
/* The maximum-extension ring is intentionally permitted inside the value zone.
 * Its position follows the gauge diameter, so it remains visually consistent
 * across card sizes. The value text is drawn last, above every gauge layer. */
const MAXIMUM_EXTENSION_RING_RADIUS_RATIO = 0.5;
export const DEFAULT_WIND_ROSE_TILT_DEGREES = 50;

export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

export const normalizeDegrees = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

/** Snap a rendered wind direction to the same 3 degree lattice as the 120 baseline rays. */
export const snapWindRoseDirection = (value: number): number =>
  normalizeDegrees(Math.round(normalizeDegrees(value) / BAR_STEP_DEGREES) * BAR_STEP_DEGREES);

/**
 * Converts the ULSA-relative wind angle to a bearing from geographic north.
 * The contract assumes ULSA 0° is physically aligned with the iPhone's top.
 */
export const applyTrueHeading = (ulsaDirection: number, trueHeading: number): number =>
  normalizeDegrees(ulsaDirection + trueHeading);

export const shortestAngularDistance = (first: number, second: number): number => {
  const difference = Math.abs(normalizeDegrees(first) - normalizeDegrees(second));
  return Math.min(difference, 360 - difference);
};

export const shortestSignedAngularDistance = (from: number, to: number): number => {
  const normalized = (normalizeDegrees(to) - normalizeDegrees(from) + 540) % 360 - 180;
  return normalized === -180 ? 180 : normalized;
};

/**
 * 北側を奥、南側を手前にした円盤の透視投影。
 * 平面モードでは既存の円形座標をそのまま返す。
 */
export const projectWindRosePoint = ({
  centerX,
  centerY,
  radius,
  angle,
  size,
  isTilted,
  tiltDegrees = DEFAULT_WIND_ROSE_TILT_DEGREES,
}: WindRoseProjectionInput): WindRoseProjectedPoint => {
  const radians = (angle - 90) * (Math.PI / 180);
  const localX = Math.cos(radians) * radius;
  const localY = Math.sin(radians) * radius;
  if (!isTilted) return { x: centerX + localX, y: centerY + localY, scale: 1 };

  const tiltRadians = clamp(tiltDegrees, 0, 70) * (Math.PI / 180);
  const depth = -localY * Math.sin(tiltRadians);
  const focalDistance = Math.max(1, size * 2.35);
  const scale = focalDistance / (focalDistance + depth);
  return {
    x: centerX + localX * scale,
    y: centerY + localY * Math.cos(tiltRadians) * scale,
    scale,
  };
};

export const normalizeWindRoseSpeed = (windSpeed: number | null): number => {
  if (windSpeed === null || !Number.isFinite(windSpeed) || windSpeed <= 0) return 0;
  return clamp(
    Math.log1p(windSpeed / LOW_SPEED_RESPONSE_KNEE_MPS)
      / Math.log1p(AUTO_SCALE_REFERENCE_MPS / LOW_SPEED_RESPONSE_KNEE_MPS),
    0,
    1,
  );
};

/**
 * 120本の固定放射線と、最大伸長位置だけを返す。動的な風の形は
 * windRoseMotionModelが生成する単一activity fieldに集約する。
 */
export const createWindRoseGeometry = ({
  size,
}: WindRoseGeometryInput): WindRoseGeometry => {
  const usableSize = Math.max(0, size);
  const outerRadius = usableSize * 0.44;
  const centerSafeRadius = Math.min(
    outerRadius * 0.68,
    Math.max(50, usableSize * 0.255),
  );
  const baselineLength = Math.max(5, outerRadius * 0.095);
  const baselineInnerRadius = Math.max(centerSafeRadius, outerRadius - baselineLength);
  const minimumActiveInnerRadius = Math.min(
    outerRadius,
    Math.max(
      0,
      // Place the visual maximum ring at 50% of the radial circle's radius.
      // This is a relative position rather than a fixed CSS-pixel inset.
      outerRadius * MAXIMUM_EXTENSION_RING_RADIUS_RATIO,
    ),
  );
  const bars: WindRoseBarGeometry[] = [];

  for (let angle = 0; angle < 360; angle += BAR_STEP_DEGREES) {
    bars.push({
      angle,
      outerRadius,
      baselineInnerRadius,
    });
  }

  return {
    outerRadius,
    centerSafeRadius,
    maximumActiveInnerRadius: minimumActiveInnerRadius,
    bars,
  };
};
