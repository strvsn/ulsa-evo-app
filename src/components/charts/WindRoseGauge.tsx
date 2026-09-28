import { memo, useEffect, useRef } from 'react';
import { convertWindSpeed, type WindSpeedUnit } from '../../utils/windSpeedConverter';
import {
  drawWindRoseCanvas,
  drawWindRoseStaticLayer,
  type WindRoseCapturedFrameSnapshot,
  type WindRosePeakHoldSnapshot,
} from './windRoseCanvasRenderer';
import { normalizeDegrees } from './windRoseGaugeMath';
import { WindRoseMotionModel } from './windRoseMotionModel';
import { WindRoseRenderCadence } from './windRoseRenderCadence';
import type { WindRoseThemeVariant } from './windRoseTheme';
import { createWindRoseStaticLayerCacheKey } from './windRoseStaticLayerCache';

interface WindRoseGaugeProps {
  isActive?: boolean;
  /** False when no live ULSA connection is available. Compass drawing remains independent. */
  hasWindData?: boolean;
  /** False when speed is valid but direction is physically undefined. */
  hasWindDirection?: boolean;
  windSpeed: number | null;
  windSpeedUnit: WindSpeedUnit;
  /** Uncorrected ULSA-relative direction. Compass rotation is applied only while drawing. */
  windDirectionContinuous: number;
  /** Wall-clock timestamp of the BLE sample; distinct from the render clock. */
  sampleTimestampMs?: number | null;
  isTilted?: boolean;
  tiltDegrees?: number;
  themeVariant?: WindRoseThemeVariant;
  /** iOS true heading, in degrees clockwise from geographic north. */
  trueHeading?: number | null;
  /** iOS heading uncertainty in degrees. Drawn as a red north-side sector. */
  headingAccuracy?: number | null;
  /** GNSS mode can show platform ground speed in the upper center metric. */
  centerPrimaryMetric?: import('./windRoseCanvasRenderer').WindRoseCenterPrimaryMetric;
  /** Raw GNSS ground speed for the display-only upper center metric. */
  groundSpeedMps?: number | null;
  directionReference?: import('./windRoseCanvasRenderer').WindRoseDirectionReference;
  peakHolds?: readonly WindRosePeakHoldSnapshot[];
  onPeakHoldFrameChange?: (snapshot: WindRoseCapturedFrameSnapshot | null) => void;
}

interface GaugeCanvasSize {
  width: number;
  height: number;
  pixelRatio: number;
}

const EMPTY_CANVAS_SIZE: GaugeCanvasSize = { width: 0, height: 0, pixelRatio: 1 };

const WindRoseGauge = ({
  isActive = true,
  hasWindData = true,
  hasWindDirection = hasWindData,
  windSpeed,
  windSpeedUnit,
  windDirectionContinuous,
  sampleTimestampMs = null,
  isTilted = true,
  tiltDegrees = 50,
  themeVariant = 'graphite',
  trueHeading = null,
  headingAccuracy = null,
  centerPrimaryMetric = 'windDirection',
  groundSpeedMps = null,
  directionReference = trueHeading === null ? 'ulsa' : 'trueNorth',
  peakHolds = [],
  onPeakHoldFrameChange,
}: WindRoseGaugeProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasSizeRef = useRef<GaugeCanvasSize>(EMPTY_CANVAS_SIZE);
  const staticLayerRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const motionModelRef = useRef(new WindRoseMotionModel());
  const renderCadenceRef = useRef(new WindRoseRenderCadence());
  const directionReferenceRef = useRef(directionReference);
  const animationFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const documentVisibleRef = useRef(true);
  const renderOptionsRef = useRef({
    isActive,
    hasWindData,
    hasWindDirection,
    windSpeedUnit,
    isTilted,
    tiltDegrees,
    themeVariant,
    trueHeading,
    headingAccuracy,
    centerPrimaryMetric,
    groundSpeedMps,
    directionReference,
    peakHolds,
    onPeakHoldFrameChange,
  });

  renderOptionsRef.current = {
    isActive,
    hasWindData,
    hasWindDirection,
    windSpeedUnit,
    isTilted,
    tiltDegrees,
    themeVariant,
    trueHeading,
    headingAccuracy,
    centerPrimaryMetric,
    groundSpeedMps,
    directionReference,
    peakHolds,
    onPeakHoldFrameChange,
  };

  const requestDrawRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    mountedRef.current = true;
    documentVisibleRef.current = document.visibilityState !== 'hidden';

    const draw = (timestamp: number) => {
      animationFrameRef.current = null;
      const options = renderOptionsRef.current;
      if (!mountedRef.current || !options.isActive || !documentVisibleRef.current) return;
      if (!renderCadenceRef.current.shouldRender(timestamp)) {
        requestDrawRef.current();
        return;
      }
      const { width, height, pixelRatio } = canvasSizeRef.current;
      if (width <= 0 || height <= 0) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      const frame = motionModelRef.current.advance(timestamp);
      const staticLayerKey = createWindRoseStaticLayerCacheKey({
        width,
        height,
        pixelRatio,
        isTilted: options.isTilted,
        tiltDegrees: options.tiltDegrees,
        theme: options.themeVariant,
      });
      if (staticLayerRef.current?.key !== staticLayerKey) {
        const staticCanvas = document.createElement('canvas');
        staticCanvas.width = Math.max(1, Math.round(width * pixelRatio));
        staticCanvas.height = Math.max(1, Math.round(height * pixelRatio));
        const staticContext = staticCanvas.getContext('2d');
        if (staticContext) {
          staticContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
          drawWindRoseStaticLayer(staticContext, {
            width,
            height,
            isTilted: options.isTilted,
            tiltDegrees: options.tiltDegrees,
            theme: options.themeVariant,
          });
          staticLayerRef.current = { key: staticLayerKey, canvas: staticCanvas };
        }
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      drawWindRoseCanvas(context, {
        width,
        height,
        frame,
        unit: options.windSpeedUnit,
        hasCurrentWindData: options.hasWindData,
        hasCurrentWindDirection: options.hasWindDirection,
        isTilted: options.isTilted,
        tiltDegrees: options.tiltDegrees,
        theme: options.themeVariant,
        trueHeading: options.trueHeading,
        headingAccuracy: options.headingAccuracy,
        centerPrimaryMetric: options.centerPrimaryMetric,
        groundSpeedMps: options.groundSpeedMps,
        directionReference: options.directionReference,
        peakHolds: options.peakHolds,
        staticLayer: staticLayerRef.current?.canvas ?? null,
      });
      options.onPeakHoldFrameChange?.(options.hasWindData && options.hasWindDirection ? {
        rayActivity: frame.rayActivity,
        speedMps: frame.speedMps,
        displayDirectionDegrees: normalizeDegrees(
          frame.peakDirectionDegrees + (options.trueHeading ?? 0),
        ),
        displayRotationDegrees: 0,
        directionReference: options.directionReference,
      } : null);
      if (frame.needsAnimation) requestDrawRef.current();
    };

    requestDrawRef.current = () => {
      if (
        animationFrameRef.current === null &&
        mountedRef.current &&
        documentVisibleRef.current &&
        renderOptionsRef.current.isActive
      ) {
        animationFrameRef.current = window.requestAnimationFrame(draw);
      }
    };

    const handleVisibilityChange = () => {
      documentVisibleRef.current = document.visibilityState !== 'hidden';
      if (!documentVisibleRef.current) {
        if (animationFrameRef.current !== null) {
          window.cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        return;
      }
      renderCadenceRef.current.reset();
      requestDrawRef.current();
    };

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
      const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      canvasSizeRef.current = { width, height, pixelRatio };
      requestDrawRef.current();
    };

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    resizeCanvas();
    return () => {
      mountedRef.current = false;
      staticLayerRef.current = null;
      requestDrawRef.current = () => undefined;
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const now = performance.now();
    const crossesTrueWindBoundary = (
      directionReferenceRef.current === 'trueWind'
    ) !== (directionReference === 'trueWind');
    if (crossesTrueWindBoundary) {
      motionModelRef.current.reset(windDirectionContinuous);
    }
    directionReferenceRef.current = directionReference;
    const hasCurrentWindData = isActive
      && hasWindData
      && windSpeed !== null
      && Number.isFinite(windSpeed)
      && Number.isFinite(windDirectionContinuous);
    motionModelRef.current.setTarget(
      hasCurrentWindData ? windSpeed : null,
      windDirectionContinuous,
      hasCurrentWindData,
      now,
      sampleTimestampMs ?? now,
    );
    if (isActive) requestDrawRef.current();
  }, [
    directionReference,
    hasWindData,
    isActive,
    sampleTimestampMs,
    windDirectionContinuous,
    windSpeed,
  ]);

  useEffect(() => {
    if (isActive) requestDrawRef.current();
  }, [
    directionReference,
    hasWindDirection,
    centerPrimaryMetric,
    groundSpeedMps,
    headingAccuracy,
    isActive,
    isTilted,
    onPeakHoldFrameChange,
    peakHolds,
    themeVariant,
    tiltDegrees,
    trueHeading,
    windSpeedUnit,
  ]);

  const displayDirection = normalizeDegrees(windDirectionContinuous + (trueHeading ?? 0));
  const convertedSpeed = hasWindData && windSpeed !== null
    ? convertWindSpeed(windSpeed, windSpeedUnit)
    : null;
  const speedLabel = convertedSpeed === null
    ? '--'
    : `${windSpeedUnit === 'cm/s'
      ? Math.round(convertedSpeed)
      : convertedSpeed.toFixed(windSpeedUnit === 'km/h' ? 1 : 2)} ${windSpeedUnit}`;
  const directionLabel = hasWindData && hasWindDirection && windSpeed !== null
    ? `${Math.round(displayDirection)} 度`
    : hasWindData ? '風向未定' : 'データ待ち';
  const groundSpeedLabel = groundSpeedMps !== null && Number.isFinite(groundSpeedMps) && groundSpeedMps >= 0
    ? `${windSpeedUnit === 'cm/s'
      ? Math.round(convertWindSpeed(groundSpeedMps, windSpeedUnit))
      : convertWindSpeed(groundSpeedMps, windSpeedUnit).toFixed(windSpeedUnit === 'km/h' ? 1 : 2)} ${windSpeedUnit}`
    : 'データ待ち';
  const centerPrimaryLabel = centerPrimaryMetric === 'groundSpeed'
    ? `移動速度 ${groundSpeedLabel}`
    : `風向 ${directionLabel}`;
  const compassLabel = trueHeading === null
    ? ''
    : ` 真北基準。端末方位 ${Math.round(trueHeading)} 度。コンパス精度 ${headingAccuracy !== null
      && Number.isFinite(headingAccuracy)
      && headingAccuracy >= 0
      ? `プラスマイナス ${Math.round(headingAccuracy)} 度`
      : '不明'}。`;

  return (
    <canvas
      ref={canvasRef}
      className="wind-rose-canvas"
      data-testid="wind-rose-gauge"
      role="img"
      aria-label={`放射状風向風速ゲージ。中央上段 ${centerPrimaryLabel}。風速 ${speedLabel}。${compassLabel}`}
    />
  );
};

const areWindRoseGaugePropsEqual = (previous: WindRoseGaugeProps, next: WindRoseGaugeProps): boolean => {
  const previousActive = previous.isActive ?? true;
  const nextActive = next.isActive ?? true;
  if (!previousActive && !nextActive) return true;
  return previousActive === nextActive
    && previous.hasWindData === next.hasWindData
    && previous.hasWindDirection === next.hasWindDirection
    && Object.is(previous.windSpeed, next.windSpeed)
    && previous.windSpeedUnit === next.windSpeedUnit
    && Object.is(previous.windDirectionContinuous, next.windDirectionContinuous)
    && Object.is(previous.sampleTimestampMs, next.sampleTimestampMs)
    && previous.isTilted === next.isTilted
    && previous.tiltDegrees === next.tiltDegrees
    && previous.themeVariant === next.themeVariant
    && previous.trueHeading === next.trueHeading
    && previous.headingAccuracy === next.headingAccuracy
    && previous.centerPrimaryMetric === next.centerPrimaryMetric
    && Object.is(previous.groundSpeedMps, next.groundSpeedMps)
    && previous.directionReference === next.directionReference
    && previous.peakHolds === next.peakHolds
    && previous.onPeakHoldFrameChange === next.onPeakHoldFrameChange;
};

export type {
  WindRoseCapturedFrameSnapshot,
  WindRoseGaugeProps,
  WindRosePeakHoldSnapshot,
};
export default memo(WindRoseGauge, areWindRoseGaugePropsEqual);
