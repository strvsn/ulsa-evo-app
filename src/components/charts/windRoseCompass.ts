import {
  clamp,
  normalizeDegrees,
  projectWindRosePoint,
  type WindRoseProjectedPoint,
  type WindRoseGeometry,
} from './windRoseGaugeMath';

interface HeadingAccuracyLabel {
  point: WindRoseProjectedPoint;
  text: string;
  fontSize: number;
}

export interface TrueHeadingDirectionLabel {
  japanese: string;
  english: string;
}

const CARDINAL_LABEL_RADIUS_RATIO = 0.505;
const ACCURACY_LABEL_RADIUS_RATIO = 0.66;
const ACCURACY_FAN_OUTER_RADIUS_RATIO = 0.685;
const ACCURACY_FAN_FIT_ITERATIONS = 12;

const TRUE_HEADING_DIRECTIONS: readonly TrueHeadingDirectionLabel[] = [
  { japanese: '北', english: 'N' },
  { japanese: '北北東', english: 'NNE' },
  { japanese: '北東', english: 'NE' },
  { japanese: '東北東', english: 'ENE' },
  { japanese: '東', english: 'E' },
  { japanese: '東南東', english: 'ESE' },
  { japanese: '南東', english: 'SE' },
  { japanese: '南南東', english: 'SSE' },
  { japanese: '南', english: 'S' },
  { japanese: '南南西', english: 'SSW' },
  { japanese: '南西', english: 'SW' },
  { japanese: '西南西', english: 'WSW' },
  { japanese: '西', english: 'W' },
  { japanese: '西北西', english: 'WNW' },
  { japanese: '北西', english: 'NW' },
  { japanese: '北北西', english: 'NNW' },
];

/** Maps the iPhone screen-forward true heading to one of the 16 compass points. */
export const getTrueHeadingDirectionLabel = (trueHeading: number): TrueHeadingDirectionLabel => {
  const index = Math.round(normalizeDegrees(trueHeading) / 22.5) % TRUE_HEADING_DIRECTIONS.length;
  return TRUE_HEADING_DIRECTIONS[index];
};

const fitFanOuterRadiusToCanvas = (
  centerX: number,
  centerY: number,
  canvasWidth: number,
  canvasHeight: number,
  minimumRadius: number,
  desiredRadius: number,
  angle: number,
  size: number,
  isTilted: boolean,
  tiltDegrees: number,
): number => {
  const safeInset = Math.max(10, size * 0.045);
  const pointFits = (radius: number) => {
    const point = projectWindRosePoint({
      centerX,
      centerY,
      radius,
      angle,
      size,
      isTilted,
      tiltDegrees,
    });
    return point.x >= safeInset
      && point.x <= canvasWidth - safeInset
      && point.y >= safeInset
      && point.y <= canvasHeight - safeInset;
  };

  if (pointFits(desiredRadius)) return desiredRadius;
  if (!pointFits(minimumRadius)) return minimumRadius;

  let lower = minimumRadius;
  let upper = desiredRadius;
  for (let iteration = 0; iteration < ACCURACY_FAN_FIT_ITERATIONS; iteration += 1) {
    const candidate = (lower + upper) / 2;
    if (pointFits(candidate)) lower = candidate;
    else upper = candidate;
  }
  return lower;
};

const movePointTowards = (
  from: WindRoseProjectedPoint,
  to: WindRoseProjectedPoint,
  distance: number,
): WindRoseProjectedPoint => {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length <= 0.0001) return from;
  const ratio = Math.min(1, distance / length);
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
    scale: from.scale + (to.scale - from.scale) * ratio,
  };
};

const traceRoundedFanBand = (
  context: CanvasRenderingContext2D,
  halfAngle: number,
  innerRadius: number,
  desiredOuterRadius: number,
  cornerRadius: number,
  pointAt: (radius: number, angle: number) => WindRoseProjectedPoint,
  outerPointAt: (radius: number, angle: number) => WindRoseProjectedPoint,
): void => {
  const angularTrim = Math.min(halfAngle * 0.45, 2.25);
  const arcStart = -halfAngle + angularTrim;
  const arcEnd = halfAngle - angularTrim;
  let arcSteps = Math.max(4, Math.ceil((arcEnd - arcStart) / 1.5));
  if (arcSteps % 2 !== 0) arcSteps += 1;
  const outerArc = Array.from({ length: arcSteps + 1 }, (_, index) => (
    outerPointAt(desiredOuterRadius, arcStart + ((arcEnd - arcStart) * index) / arcSteps)
  ));
  const innerArc = Array.from({ length: arcSteps + 1 }, (_, index) => (
    pointAt(innerRadius, arcStart + ((arcEnd - arcStart) * index) / arcSteps)
  ));
  const outerStartCorner = outerPointAt(desiredOuterRadius, -halfAngle);
  const outerEndCorner = outerPointAt(desiredOuterRadius, halfAngle);
  const innerStartCorner = pointAt(innerRadius, -halfAngle);
  const innerEndCorner = pointAt(innerRadius, halfAngle);
  const startSideLength = Math.hypot(
    outerStartCorner.x - innerStartCorner.x,
    outerStartCorner.y - innerStartCorner.y,
  );
  const endSideLength = Math.hypot(
    outerEndCorner.x - innerEndCorner.x,
    outerEndCorner.y - innerEndCorner.y,
  );
  const startTrim = Math.min(cornerRadius, startSideLength * 0.22);
  const endTrim = Math.min(cornerRadius, endSideLength * 0.22);

  context.beginPath();
  context.moveTo(outerArc[0].x, outerArc[0].y);
  outerArc.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  const outerEndSide = movePointTowards(outerEndCorner, innerEndCorner, endTrim);
  context.quadraticCurveTo(
    outerEndCorner.x,
    outerEndCorner.y,
    outerEndSide.x,
    outerEndSide.y,
  );
  const innerEndSide = movePointTowards(innerEndCorner, outerEndCorner, endTrim);
  context.lineTo(innerEndSide.x, innerEndSide.y);
  const innerArcEnd = innerArc[innerArc.length - 1];
  context.quadraticCurveTo(
    innerEndCorner.x,
    innerEndCorner.y,
    innerArcEnd.x,
    innerArcEnd.y,
  );
  innerArc.slice(0, -1).reverse().forEach((point) => context.lineTo(point.x, point.y));
  const innerStartSide = movePointTowards(innerStartCorner, outerStartCorner, startTrim);
  context.quadraticCurveTo(
    innerStartCorner.x,
    innerStartCorner.y,
    innerStartSide.x,
    innerStartSide.y,
  );
  const outerStartSide = movePointTowards(outerStartCorner, innerStartCorner, startTrim);
  context.lineTo(outerStartSide.x, outerStartSide.y);
  context.quadraticCurveTo(
    outerStartCorner.x,
    outerStartCorner.y,
    outerArc[0].x,
    outerArc[0].y,
  );
  context.closePath();
};

const drawHeadingAccuracyFan = (
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  centerX: number,
  centerY: number,
  geometry: WindRoseGeometry,
  headingAccuracy: number,
  size: number,
  isTilted: boolean,
  tiltDegrees: number,
  isLightTheme: boolean,
): HeadingAccuracyLabel => {
  // Core Location reports a radial uncertainty. Preserve the actual value up
  // to ±180° instead of visually understating poor heading accuracy.
  const halfAngle = clamp(headingAccuracy, 1.5, 179.5);
  // Keep the complete uncertainty band outside the 120 baseline rays. The
  // accuracy value sits beyond the fixed cardinal-label orbit, and the fan's
  // north-side outer edge extends beyond the value. For very wide uncertainty
  // sectors, only the side/rear edge is fitted inward to keep its glow inside
  // the existing card without changing the NEWS orbit.
  const innerRadius = geometry.outerRadius + size * 0.018;
  const pointAt = (radius: number, angle: number) => projectWindRosePoint({
    centerX,
    centerY,
    radius,
    angle,
    size,
    isTilted,
    tiltDegrees,
  });
  // Each successive rounded band is inset and more opaque. The outermost,
  // lowest-alpha layer remains the exact reported ±accuracy; inner layers fade
  // inward so the visual boundary never overstates the Core Location error.
  // This stays compatible with iOS WebView without Canvas 2D `filter`.
  const angularFeather = Math.min(3, halfAngle * 0.42);
  const layers = [
    {
      insetProgress: 0,
      cornerRatio: 0.018,
      fill: isLightTheme ? 'rgba(246, 20, 61, 0.030)' : 'rgba(255, 48, 78, 0.038)',
      shadow: isLightTheme ? 'rgba(255, 30, 68, 0.42)' : 'rgba(255, 58, 88, 0.50)',
      blurRatio: 0.045,
    },
    {
      insetProgress: 0.5,
      cornerRatio: 0.016,
      fill: isLightTheme ? 'rgba(238, 18, 57, 0.055)' : 'rgba(255, 48, 78, 0.065)',
      shadow: isLightTheme ? 'rgba(255, 30, 68, 0.28)' : 'rgba(255, 58, 88, 0.34)',
      blurRatio: 0.032,
    },
    {
      insetProgress: 1,
      cornerRatio: 0.014,
      fill: isLightTheme ? 'rgba(230, 16, 53, 0.080)' : 'rgba(255, 47, 77, 0.090)',
      shadow: isLightTheme ? 'rgba(255, 30, 68, 0.16)' : 'rgba(255, 58, 88, 0.20)',
      blurRatio: 0.022,
    },
  ] as const;
  layers.forEach((layer) => {
    const layerHalfAngle = Math.max(0.55, halfAngle - angularFeather * layer.insetProgress);
    const radialInset = size * 0.012 * layer.insetProgress;
    const layerInnerRadius = innerRadius + radialInset;
    const layerOuterRadius = size * ACCURACY_FAN_OUTER_RADIUS_RATIO - radialInset;
    const layerOuterPointAt = (desiredOuterRadius: number, angle: number) => pointAt(
      fitFanOuterRadiusToCanvas(
        centerX,
        centerY,
        canvasWidth,
        canvasHeight,
        layerInnerRadius,
        desiredOuterRadius,
        angle,
        size,
        isTilted,
        tiltDegrees,
      ),
      angle,
    );
    context.save();
    traceRoundedFanBand(
      context,
      layerHalfAngle,
      layerInnerRadius,
      layerOuterRadius,
      size * layer.cornerRatio,
      pointAt,
      layerOuterPointAt,
    );
    context.fillStyle = layer.fill;
    context.shadowColor = layer.shadow;
    context.shadowBlur = Math.max(6, size * layer.blurRatio);
    context.fill();
    context.restore();
  });

  return {
    point: pointAt(size * ACCURACY_LABEL_RADIUS_RATIO, 0),
    text: `±${Math.round(headingAccuracy)}°`,
    fontSize: Math.max(8, size * 0.022),
  };
};

/** Draws true-north cardinals around the gauge and the fixed screen-forward reference. */
export const drawWindRoseCompassReference = (
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  centerX: number,
  centerY: number,
  geometry: WindRoseGeometry,
  trueHeading: number,
  headingAccuracy: number | null,
  size: number,
  isTilted: boolean,
  tiltDegrees: number,
  isLightTheme: boolean,
) => {
  const tickInnerRadius = geometry.outerRadius + size * 0.012;
  const tickOuterRadius = geometry.outerRadius + size * 0.042;
  const labelRadius = size * CARDINAL_LABEL_RADIUS_RATIO;
  const markerColor = isLightTheme ? 'rgba(30, 69, 82, 0.76)' : 'rgba(216, 237, 241, 0.74)';
  const labelColor = isLightTheme ? '#244550' : '#dbeff2';
  const screenForwardDirection = getTrueHeadingDirectionLabel(trueHeading);

  const validAccuracy = headingAccuracy !== null
    && Number.isFinite(headingAccuracy)
    && headingAccuracy >= 0
    ? headingAccuracy
    : null;
  const accuracyLabel = validAccuracy !== null
    ? drawHeadingAccuracyFan(
      context,
      canvasWidth,
      canvasHeight,
      centerX,
      centerY,
      geometry,
      validAccuracy,
      size,
      isTilted,
      tiltDegrees,
      isLightTheme,
    )
    : null;

  context.save();
  context.lineCap = 'round';
  context.strokeStyle = markerColor;
  context.fillStyle = labelColor;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const cardinalFontSize = Math.max(12, size * 0.044);
  context.font = `780 ${cardinalFontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;
  ([
    { bearing: 0, label: 'N' },
    { bearing: 90, label: 'E' },
    { bearing: 180, label: 'S' },
    { bearing: 270, label: 'W' },
  ] as const).forEach(({ bearing, label }) => {
    const screenAngle = normalizeDegrees(bearing - trueHeading);
    const inner = projectWindRosePoint({
      centerX,
      centerY,
      radius: tickInnerRadius,
      angle: screenAngle,
      size,
      isTilted,
      tiltDegrees,
    });
    const outer = projectWindRosePoint({
      centerX,
      centerY,
      radius: tickOuterRadius,
      angle: screenAngle,
      size,
      isTilted,
      tiltDegrees,
    });
    const labelPoint = projectWindRosePoint({
      centerX,
      centerY,
      radius: labelRadius,
      angle: screenAngle,
      size,
      isTilted,
      tiltDegrees,
    });
    context.lineWidth = Math.max(1.2, size * 0.004) * ((inner.scale + outer.scale) / 2);
    context.beginPath();
    context.moveTo(inner.x, inner.y);
    context.lineTo(outer.x, outer.y);
    context.stroke();
    context.fillStyle = label === 'N'
      ? (isLightTheme ? '#c5162e' : '#ff5668')
      : labelColor;
    context.fillText(label, labelPoint.x, labelPoint.y);
  });
  context.restore();

  // The top of the display is the iPhone's forward direction. Give it a
  // stable, human-readable true-north label independently of the rotating
  // NEWS orbit: Japanese on the first line, international abbreviation below.
  context.save();
  context.fillStyle = labelColor;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const japaneseFontSize = Math.max(11, size * 0.035);
  const englishFontSize = Math.max(9, size * 0.026);
  const lineGap = Math.max(1, size * 0.006);
  const safeTop = Math.max(10, size * 0.045);
  const japaneseY = safeTop + japaneseFontSize * 0.62;
  const englishY = japaneseY + japaneseFontSize * 0.62 + lineGap + englishFontSize * 0.62;
  context.font = `780 ${japaneseFontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;
  context.fillText(screenForwardDirection.japanese, centerX, japaneseY);
  context.font = `720 ${englishFontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;
  context.fillText(screenForwardDirection.english, centerX, englishY);
  context.restore();

  if (accuracyLabel !== null) {
    context.save();
    context.shadowBlur = Math.max(2, size * 0.008);
    context.shadowColor = isLightTheme ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 32, 66, 0.52)';
    context.fillStyle = isLightTheme ? '#760019' : '#fff7f8';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `800 ${accuracyLabel.fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;
    context.fillText(
      accuracyLabel.text,
      accuracyLabel.point.x,
      accuracyLabel.point.y,
    );
    context.restore();
  }

  context.save();
  context.strokeStyle = isLightTheme ? '#d9243d' : '#ff5668';
  context.shadowColor = isLightTheme ? 'rgba(217, 36, 61, 0.24)' : 'rgba(255, 86, 104, 0.42)';
  context.shadowBlur = Math.max(3, size * 0.018);
  context.lineCap = 'round';
  context.lineWidth = Math.max(1.5, size * 0.006);
  if (validAccuracy === null) {
    context.beginPath();
    context.moveTo(centerX, centerY - tickOuterRadius - size * 0.008);
    context.lineTo(centerX, centerY - tickOuterRadius - size * 0.056);
    context.stroke();
  }
  context.restore();
};
