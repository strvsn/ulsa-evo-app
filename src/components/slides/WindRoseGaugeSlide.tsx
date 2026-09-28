import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { IonCard, IonCardContent, IonToast } from '@ionic/react';
import { Compass, PictureInPicture2, Satellite, X } from 'lucide-react';
import { WindRoseGauge } from '../charts';
import type { WindRoseCapturedFrameSnapshot, WindRosePeakHoldSnapshot } from '../charts';
import { DEFAULT_WIND_ROSE_TILT_DEGREES } from '../charts/windRoseGaugeMath';
import {
  getWindRosePeakHoldPalette,
  type WindRosePeakHoldBankIndex,
  type WindRoseThemeVariant,
} from '../charts/windRoseTheme';
import {
  useWindReferenceNavigation,
  type WindReferenceMode,
} from '../../hooks/useWindReferenceNavigation';
import { useWindPip } from '../../hooks/useWindPip';
import { useLongPressSlideImageShare } from '../../hooks/useLongPressSlideImageShare';
import { isNativeTrueHeadingAvailable } from '../../services/nativeTrueHeading';
import type { WindPipDataState, WindPipLogState } from '../../services/nativeWindPip';
import type { WindSpeedUnit } from '../../utils/windSpeedConverter';
import { convertWindSpeed } from '../../utils/windSpeedConverter';
import { calculateTrueWind } from '../../utils/trueWind';
import { ControlIconButton, NativeControlButton } from '../controls';
import './WindRoseGaugeSlide.css';

interface WindRoseGaugeSlideProps {
  isActive?: boolean;
  isUlsaConnected?: boolean;
  windSpeed: number | null;
  windSpeedUnit: WindSpeedUnit;
  windDirectionContinuous: number;
  temperature: number | null;
  soundSpeed: number | null;
  headingSpeed: number | null;
  windSpeedAverage10m: number | null;
  cardLogState: WindPipLogState;
  cardLogDetail?: string;
  appLogState: WindPipLogState;
  appLogDetail?: string;
  sampleTimestampMs?: number | null;
  themeVariant?: WindRoseThemeVariant;
  dataState?: WindPipDataState;
  onUnitCycle: () => void;
  onRequestActivate?: () => void;
  onPipActivityChange?: (active: boolean) => void;
}

const TILT_OPTIONS = [
  { label: '浅', degrees: 45 },
  { label: '標準', degrees: DEFAULT_WIND_ROSE_TILT_DEGREES },
  { label: '深', degrees: 60 },
] as const;

// Keep the controls implemented for a future return, but hide them in the
// current product UI while the 50-degree depth view is the fixed default.
const SHOW_DEPTH_CONTROLS = false;
const PEAK_HOLD_SLOT_COUNT = 3;
const NAVIGATION_SAMPLE_ALIGNMENT_MS = 3_000;

const NEXT_WIND_REFERENCE_MODE: Record<WindReferenceMode, WindReferenceMode> = {
  off: 'compass',
  compass: 'gnss',
  gnss: 'off',
};

const getPeakHoldReferenceLabel = (
  reference: WindRosePeakHoldSnapshot['directionReference'],
): string => {
  if (reference === 'trueWind') return '真風・参考';
  if (reference === 'trueNorth') return '真北基準';
  return '';
};

const formatPeakHoldSpeed = (speedMps: number, unit: WindSpeedUnit): string => {
  const converted = convertWindSpeed(speedMps, unit);
  if (unit === 'cm/s') return Math.round(converted).toString();
  return converted.toFixed(unit === 'km/h' ? 1 : 2);
};

type PeakHoldStyle = CSSProperties & {
  '--wind-rose-peak-active-background': string;
  '--wind-rose-peak-active-border': string;
  '--wind-rose-peak-active-text': string;
  '--wind-rose-peak-muted-background': string;
  '--wind-rose-peak-muted-border': string;
  '--wind-rose-peak-muted-text': string;
};

const getPeakHoldStyle = (
  theme: WindRoseThemeVariant,
  bankIndex: WindRosePeakHoldBankIndex,
): PeakHoldStyle => {
  const palette = getWindRosePeakHoldPalette(theme, bankIndex);
  return {
    '--wind-rose-peak-active-background': palette.activeBackground,
    '--wind-rose-peak-active-border': palette.activeBorder,
    '--wind-rose-peak-active-text': palette.activeText,
    '--wind-rose-peak-muted-background': palette.mutedBackground,
    '--wind-rose-peak-muted-border': palette.mutedBorder,
    '--wind-rose-peak-muted-text': palette.mutedText,
  };
};

const WindRoseGaugeSlide: React.FC<WindRoseGaugeSlideProps> = ({
  isActive = true,
  isUlsaConnected = true,
  windSpeed,
  windSpeedUnit,
  windDirectionContinuous,
  temperature,
  soundSpeed,
  headingSpeed,
  windSpeedAverage10m,
  cardLogState,
  cardLogDetail,
  appLogState,
  appLogDetail,
  sampleTimestampMs = null,
  themeVariant = 'graphite',
  dataState = isUlsaConnected && windSpeed !== null ? 'live' : 'disconnected',
  onUnitCycle,
  onRequestActivate,
  onPipActivityChange,
}) => {
  const imageShare = useLongPressSlideImageShare(isActive);
  const [isTilted, setIsTilted] = useState(true);
  const [tiltDegrees, setTiltDegrees] = useState(DEFAULT_WIND_ROSE_TILT_DEGREES);
  const [windReferenceMode, setWindReferenceMode] = useState<WindReferenceMode>('off');
  const [gnssCenterMetric, setGnssCenterMetric] = useState<'groundSpeed' | 'windDirection'>('groundSpeed');
  const [peakHoldSlots, setPeakHoldSlots] = useState<Array<WindRosePeakHoldSnapshot | null>>(
    () => Array.from({ length: PEAK_HOLD_SLOT_COUNT }, () => null),
  );
  const latestPeakHoldFrameRef = useRef<WindRoseCapturedFrameSnapshot | null>(null);
  const isIosCompass = isNativeTrueHeadingAvailable();
  const navigation = useWindReferenceNavigation(
    isIosCompass ? windReferenceMode : 'off',
    isActive,
  );
  const hasCompassHeading = navigation.status === 'ready'
    || navigation.status === 'lowAccuracy';
  const trueHeading = windReferenceMode !== 'off' && hasCompassHeading
    ? navigation.trueHeading
    : null;
  const headingAccuracy = trueHeading === null ? null : navigation.headingAccuracy;
  const groundSpeedMps = windReferenceMode === 'gnss'
    && navigation.gnssSample.available
    && navigation.gnssSample.speedMps !== null
    && Number.isFinite(navigation.gnssSample.speedMps)
    ? Math.max(0, navigation.gnssSample.speedMps)
    : null;
  const hasWindData = isUlsaConnected
    && dataState === 'live'
    && windSpeed !== null
    && Number.isFinite(windSpeed);
  const navigationTimestampsAligned = sampleTimestampMs === null || (
    navigation.gnssSample.timestampMs !== null
    && navigation.headingTimestampMs !== null
    && Math.abs(navigation.gnssSample.timestampMs - sampleTimestampMs)
      <= NAVIGATION_SAMPLE_ALIGNMENT_MS
    && Math.abs(navigation.headingTimestampMs - sampleTimestampMs)
      <= NAVIGATION_SAMPLE_ALIGNMENT_MS
  );
  const trueWindSolution = useMemo(() => {
    if (
      windReferenceMode !== 'gnss'
      || !hasWindData
      || windSpeed === null
      // GNSS mode intentionally keeps producing a reference value when the
      // magnetic heading is imprecise. The displayed uncertainty sector is
      // the warning; only a missing/invalid heading blocks the transform.
      || !hasCompassHeading
      || navigation.trueHeading === null
      || !navigation.gnssAssessment.usable
      || !navigationTimestampsAligned
    ) {
      return null;
    }
    return calculateTrueWind({
      apparentSpeedMps: windSpeed,
      apparentDirectionFromDeviceDegrees: windDirectionContinuous,
      deviceTrueHeadingDegrees: navigation.trueHeading,
      platformSpeedMps: navigation.gnssAssessment.platformSpeedMps,
      platformCourseDegrees: navigation.gnssAssessment.platformCourseDegrees,
    });
  }, [
    hasWindData,
    navigation.gnssAssessment.platformCourseDegrees,
    navigation.gnssAssessment.platformSpeedMps,
    navigation.gnssAssessment.usable,
    navigation.trueHeading,
    navigationTimestampsAligned,
    hasCompassHeading,
    windDirectionContinuous,
    windReferenceMode,
    windSpeed,
  ]);
  const isTrueWindApplied = windReferenceMode === 'gnss' && trueWindSolution !== null;
  const displayWindSpeed = isTrueWindApplied ? trueWindSolution.speedMps : windSpeed;
  const displayWindDirection = isTrueWindApplied
    ? (trueWindSolution.directionFromDeviceDegrees ?? windDirectionContinuous)
    : windDirectionContinuous;
  const hasDisplayWindDirection = hasWindData && trueWindSolution?.isCalm !== true;
  const directionReference = isTrueWindApplied
    ? 'trueWind'
    : windReferenceMode === 'gnss'
      ? 'gnssPending'
      : trueHeading === null ? 'ulsa' : 'trueNorth';
  const canCapturePeakHold = hasWindData
    && hasDisplayWindDirection
    && (windReferenceMode !== 'gnss' || isTrueWindApplied);
  const gnssPendingReason = windReferenceMode !== 'gnss' || isTrueWindApplied
    ? null
    : !hasWindData
      ? 'ULSAデータを待っています'
      : !hasCompassHeading
          ? navigation.status === 'denied'
            ? '位置情報の使用が許可されていません'
            : navigation.status === 'restricted'
              ? '位置情報の使用が制限されています'
              : 'コンパス情報を待っています'
          : !navigation.gnssAssessment.usable
            ? navigation.gnssAssessment.reason ?? 'GNSS情報を待っています'
            : !navigationTimestampsAligned
              ? 'ULSAとGNSSの計測時刻を同期しています'
              : 'GNSS情報を待っています';
  const activePeakHolds = useMemo(
    () => peakHoldSlots.filter((hold): hold is WindRosePeakHoldSnapshot => hold !== null),
    [peakHoldSlots],
  );
  const handlePeakHoldFrameChange = useCallback((snapshot: WindRoseCapturedFrameSnapshot | null) => {
    latestPeakHoldFrameRef.current = snapshot;
  }, []);
  const capturePeakHold = useCallback((slotIndex: number) => {
    const latest = latestPeakHoldFrameRef.current;
    if (!canCapturePeakHold || latest === null) return;
    const captured: WindRosePeakHoldSnapshot = {
      ...latest,
      bankIndex: slotIndex as WindRosePeakHoldBankIndex,
      rayActivity: new Float32Array(latest.rayActivity),
    };
    setPeakHoldSlots((current) => current.map((hold, index) => (
      index === slotIndex ? captured : hold
    )));
  }, [canCapturePeakHold]);
  const clearPeakHold = useCallback((slotIndex: number) => {
    setPeakHoldSlots((current) => current.map((hold, index) => (
      index === slotIndex ? null : hold
    )));
  }, []);
  const windPip = useWindPip({
    isConnected: isUlsaConnected,
    dataState,
    windSpeed,
    // PiPはバックグラウンド位置情報に依存せず、常にULSA基準風向を使う。
    windDirection: windDirectionContinuous,
    temperature,
    soundSpeed,
    headingSpeed,
    windSpeedAverage10m,
    windSpeedUnit,
    cardLogState,
    cardLogDetail,
    appLogState,
    appLogDetail,
    themeVariant,
    sampleTimestampMs,
    onRestoreRequested: onRequestActivate,
  });
  const windPipActivity = windPip.active || windPip.busy;
  useEffect(() => {
    onPipActivityChange?.(windPipActivity);
  }, [onPipActivityChange, windPipActivity]);
  useEffect(() => () => {
    onPipActivityChange?.(false);
  }, [onPipActivityChange]);
  const windReferenceButtonLabel = windReferenceMode === 'off'
    ? 'コンパスをオンにする'
    : windReferenceMode === 'compass'
      ? 'コンパスからGNSS補正モードに切り替える'
      : `コンパスとGNSS補正をオフにする。現在${isTrueWindApplied
        ? 'GNSS補正中'
        : gnssPendingReason ?? 'GNSS待機中'}`;
  const windReferenceTone = windReferenceMode === 'off'
    ? 'neutral'
    : windReferenceMode === 'compass'
      ? 'accent'
      : isTrueWindApplied
        ? 'success'
        : ['denied', 'restricted', 'unavailable'].includes(navigation.status)
          ? 'danger'
          : 'warning';
  const handleWindReferenceModeCycle = useCallback(() => {
    setWindReferenceMode((current) => {
      const next = NEXT_WIND_REFERENCE_MODE[current];
      if (next === 'gnss') setGnssCenterMetric('groundSpeed');
      return next;
    });
  }, []);
  const centerPrimaryMetric = windReferenceMode === 'gnss'
    ? gnssCenterMetric
    : 'windDirection';
  return (
    <div className="slide-content">
      <IonCard className="gauge-card-main wind-rose-card" data-slide-image-card>
        <IonCardContent className="gauge-content wind-rose-content">
          {isIosCompass && (
            <ControlIconButton
              className={`wind-rose-corner-action wind-rose-corner-action-left wind-rose-compass-action${windReferenceMode !== 'off' ? ' active' : ''}${windReferenceMode === 'gnss' ? ' gnss' : ''}`}
              aria-pressed={windReferenceMode !== 'off'}
              aria-label={windReferenceButtonLabel}
              data-wind-reference-mode={windReferenceMode}
              data-gnss-status={windReferenceMode === 'gnss'
                ? navigation.gnssAssessment.status
                : undefined}
              onClick={handleWindReferenceModeCycle}
              selectionState={windReferenceMode === 'off' ? 'off' : 'on'}
              tone={windReferenceTone}
            >
              {windReferenceMode === 'gnss'
                ? <Satellite aria-hidden="true" size={21} strokeWidth={2.1} />
                : <Compass aria-hidden="true" size={21} strokeWidth={2.1} />}
            </ControlIconButton>
          )}
          {windPip.available && (
            <ControlIconButton
              className={`wind-rose-corner-action wind-rose-corner-action-right wind-rose-pip-action${windPip.active ? ' active' : ''}`}
              aria-pressed={windPip.active}
              aria-label={windPip.active ? 'ピクチャーインピクチャーを停止' : 'ピクチャーインピクチャーを開始'}
              operationalState={windPip.busy
                ? { kind: 'busy' }
                : (!windPip.active && !windPip.canStart)
                  ? { kind: 'disabled', reason: '新しい計測値を待機中' }
                  : { kind: 'idle' }}
              selectionState={windPip.active ? 'on' : 'off'}
              tone={windPip.active ? 'success' : 'neutral'}
              onClick={() => void windPip.toggle()}
            >
              <PictureInPicture2 aria-hidden="true" size={21} strokeWidth={2.1} />
            </ControlIconButton>
          )}
          {gnssPendingReason && (
            <div className="wind-rose-gnss-wait-reason" role="status">
              {gnssPendingReason}
            </div>
          )}
          <div className="wind-rose-stage slide-image-share-target" {...imageShare.handlers}>
            <WindRoseGauge
              isActive={isActive}
              hasWindData={hasWindData}
              hasWindDirection={hasDisplayWindDirection}
              windSpeed={displayWindSpeed}
              windSpeedUnit={windSpeedUnit}
              windDirectionContinuous={hasWindData ? displayWindDirection : 0}
              sampleTimestampMs={sampleTimestampMs}
              isTilted={isTilted}
              tiltDegrees={tiltDegrees}
              themeVariant={themeVariant}
              trueHeading={trueHeading}
              headingAccuracy={headingAccuracy}
              centerPrimaryMetric={centerPrimaryMetric}
              groundSpeedMps={groundSpeedMps}
              directionReference={directionReference}
              peakHolds={activePeakHolds}
              onPeakHoldFrameChange={handlePeakHoldFrameChange}
            />
            <NativeControlButton
              controlSize="M44"
              className="wind-rose-unit-hit-target swiper-no-swiping"
              aria-label={`風速単位を変更。現在 ${windSpeedUnit}`}
              data-current-unit={windSpeedUnit}
              onClick={onUnitCycle}
            />
            {windReferenceMode === 'gnss' && (
              <NativeControlButton
                controlSize="M44"
                className="wind-rose-primary-metric-hit-target swiper-no-swiping"
                aria-label={gnssCenterMetric === 'groundSpeed'
                  ? '移動速度から風向表示に切り替える'
                  : '風向から移動速度表示に切り替える'}
                data-gnss-center-metric={gnssCenterMetric}
                onClick={() => setGnssCenterMetric((current) => (
                  current === 'groundSpeed' ? 'windDirection' : 'groundSpeed'
                ))}
              />
            )}
          </div>
          <div className="wind-rose-peak-holds" role="group" aria-label="風向風速ピークホールド">
            {peakHoldSlots.map((hold, index) => {
              const slotNumber = index + 1;
              const bankIndex = index as WindRosePeakHoldBankIndex;
              return (
                <div
                  className={`wind-rose-peak-hold-slot${hold ? ' active' : ''}${hold && getPeakHoldReferenceLabel(hold.directionReference) ? ' has-reference' : ''}`}
                  data-peak-hold-bank={slotNumber}
                  key={slotNumber}
                  style={getPeakHoldStyle(themeVariant, bankIndex)}
                >
                  <NativeControlButton
                    controlSize="R56"
                    selectionState={hold ? 'on' : 'off'}
                    tone="accent"
                    className="wind-rose-peak-hold-capture"
                    aria-pressed={hold !== null}
                    disabled={!canCapturePeakHold}
                    aria-label={hold
                      ? `ピークホールド${slotNumber}。${getPeakHoldReferenceLabel(hold.directionReference)
                        ? `${getPeakHoldReferenceLabel(hold.directionReference)}、`
                        : ''}${Math.round(hold.displayDirectionDegrees)}度、${formatPeakHoldSpeed(hold.speedMps, windSpeedUnit)} ${windSpeedUnit}。現在の風向風速で更新`
                      : `ピークホールド${slotNumber}に現在の風向風速を保存`}
                    onClick={() => capturePeakHold(index)}
                  >
                    <span className="wind-rose-peak-hold-title">
                      HOLD {slotNumber}
                    </span>
                    {hold ? (
                      <span className="wind-rose-peak-hold-readout">
                        <span className="wind-rose-peak-hold-direction">
                          <span>{Math.round(hold.displayDirectionDegrees)}°</span>
                          {getPeakHoldReferenceLabel(hold.directionReference) && (
                            <span className="wind-rose-peak-hold-reference">
                              {getPeakHoldReferenceLabel(hold.directionReference)}
                            </span>
                          )}
                        </span>
                        <span className="wind-rose-peak-hold-speed">
                          <span>{formatPeakHoldSpeed(hold.speedMps, windSpeedUnit)}</span>
                          <span className="wind-rose-peak-hold-unit">{windSpeedUnit}</span>
                        </span>
                      </span>
                    ) : null}
                  </NativeControlButton>
                  {hold && (
                    <NativeControlButton
                      controlSize="I44"
                      controlVariant="destructive"
                      tone="danger"
                      className="wind-rose-peak-hold-clear"
                      aria-label={`ピークホールド${slotNumber}を解除`}
                      onClick={() => clearPeakHold(index)}
                    >
                      <X className="ulsa-icon" aria-hidden="true" size={13} strokeWidth={2.4} />
                    </NativeControlButton>
                  )}
                </div>
              );
            })}
          </div>
          {SHOW_DEPTH_CONTROLS && (
            <div className="wind-rose-primary-controls">
              <NativeControlButton
                controlSize="C36"
                selectionState={isTilted ? 'on' : 'off'}
                tone="accent"
                className={`wind-rose-mode-toggle${isTilted ? ' active' : ''}`}
                aria-pressed={isTilted}
                aria-label={`奥行き表示を${isTilted ? 'オフ' : 'オン'}にする`}
                onClick={() => setIsTilted((current) => !current)}
              >
                <span>奥行き表示</span>
                <strong>{isTilted ? 'ON' : 'OFF'}</strong>
              </NativeControlButton>
            </div>
          )}
          {windPip.error && <div className="wind-rose-pip-error" role="status">{windPip.error}</div>}
          {SHOW_DEPTH_CONTROLS && isTilted && (
            <div className="wind-rose-tilt-levels" role="group" aria-label="奥行きの傾斜角度">
              {TILT_OPTIONS.map(({ label, degrees }) => (
                <NativeControlButton
                  key={degrees}
                  controlSize="C36"
                  selectionState={tiltDegrees === degrees ? 'on' : 'off'}
                  tone="accent"
                  className={`wind-rose-tilt-level${tiltDegrees === degrees ? ' active' : ''}`}
                  aria-pressed={tiltDegrees === degrees}
                  aria-label={`奥行き角度 ${label} ${degrees}度`}
                  onClick={() => setTiltDegrees(degrees)}
                >
                  <span>{label}</span>
                  <strong>{degrees}°</strong>
                </NativeControlButton>
              ))}
            </div>
          )}
        </IonCardContent>
      </IonCard>
      <IonToast
        isOpen={imageShare.error !== null}
        message={imageShare.error ?? ''}
        duration={3000}
        onDidDismiss={imageShare.clearError}
      />
    </div>
  );
};

const areWindRoseGaugeSlidePropsEqual = (
  previous: WindRoseGaugeSlideProps,
  next: WindRoseGaugeSlideProps,
): boolean => {
  const previousActive = previous.isActive ?? true;
  const nextActive = next.isActive ?? true;

  return (
    previousActive === nextActive &&
    previous.isUlsaConnected === next.isUlsaConnected &&
    Object.is(previous.windSpeed, next.windSpeed) &&
    previous.windSpeedUnit === next.windSpeedUnit &&
    previous.windDirectionContinuous === next.windDirectionContinuous &&
    Object.is(previous.temperature, next.temperature) &&
    Object.is(previous.soundSpeed, next.soundSpeed) &&
    previous.cardLogState === next.cardLogState &&
    previous.cardLogDetail === next.cardLogDetail &&
    previous.appLogState === next.appLogState &&
    previous.appLogDetail === next.appLogDetail &&
    Object.is(previous.sampleTimestampMs, next.sampleTimestampMs) &&
    previous.themeVariant === next.themeVariant &&
    previous.dataState === next.dataState &&
    previous.onUnitCycle === next.onUnitCycle &&
    previous.onRequestActivate === next.onRequestActivate
    && previous.onPipActivityChange === next.onPipActivityChange
  );
};

export type { WindRoseGaugeSlideProps };
export default memo(WindRoseGaugeSlide, areWindRoseGaugeSlidePropsEqual);
