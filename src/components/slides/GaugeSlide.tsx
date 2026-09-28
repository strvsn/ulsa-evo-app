/**
 * ゲージ表示スライドコンポーネント
 * 風速・音仮温度・音速のゲージ表示と風向インジケーターを担当
 */

import { lazy, memo, Suspense, useRef, useState, useEffect } from 'react';
import { IonCard, IonCardContent, IonSegment, IonLabel, IonToast } from '@ionic/react';
import type { GaugeType, GaugeChartRef } from '../charts';
import { convertWindSpeed, type WindSpeedUnit } from '../../utils/windSpeedConverter';
import { themes } from '../../constants/themes';
import { recordPerfEvent } from '../../utils/renderPerfDiagnostics';
import type { DisplaySampleListener } from '../../hooks/ble/types';
import { useLongPressSlideImageShare } from '../../hooks/useLongPressSlideImageShare';
import { IonicControlSegmentButton, NativeControlButton } from '../controls';

const GaugeChart = lazy(() => import('../charts/GaugeChart'));

interface GaugeSlideProps {
  isActive?: boolean;
  selectedGauge: GaugeType;
  onGaugeChange: (gauge: GaugeType) => void;
  windSpeed: number | null;
  windSpeedUnit: WindSpeedUnit;
  temperature: number | null;
  soundSpeed: number | null;
  windDirectionContinuous: number;
  onUnitCycle: () => void;
  gaugeChartRef: React.RefObject<GaugeChartRef | null>;
  themeIndex: number;
  windSpeedMax: number;
  temperatureMax: number;
  soundSpeedMax: number;
  onMaxChange: (gauge: GaugeType, value: number) => void;
  subscribeDisplaySamples?: (listener: DisplaySampleListener) => () => void;
}

interface GaugeLayoutState {
  containerSize: number;
  isChartReady: boolean;
}

const INITIAL_GAUGE_LAYOUT_STATE: GaugeLayoutState = {
  containerSize: 400,
  isChartReady: false,
};

/**
 * ゲージ表示スライド
 * 風速/音仮温度/音速のゲージと風向インジケーターを表示
 */
const GaugeSlide: React.FC<GaugeSlideProps> = ({
  isActive = true,
  selectedGauge,
  onGaugeChange,
  windSpeed,
  windSpeedUnit,
  temperature,
  soundSpeed,
  windDirectionContinuous,
  onUnitCycle,
  gaugeChartRef,
  themeIndex,
  windSpeedMax,
  temperatureMax,
  soundSpeedMax,
  onMaxChange,
  subscribeDisplaySamples,
}) => {
  recordPerfEvent('GaugeSlide.render');
  const imageShare = useLongPressSlideImageShare(isActive);

  const gaugeContainerRef = useRef<HTMLDivElement>(null);
  const windDirectionIndicatorRef = useRef<HTMLDivElement>(null);
  const liveDirectionContinuousRef = useRef(windDirectionContinuous);
  const lastLiveDirectionRef = useRef(windDirectionContinuous);
  const lastLiveSpeedRef = useRef(windSpeed);
  const gaugeLayoutRef = useRef<GaugeLayoutState>(INITIAL_GAUGE_LAYOUT_STATE);
  const [gaugeLayout, setGaugeLayout] = useState<GaugeLayoutState>(() => INITIAL_GAUGE_LAYOUT_STATE);

  // テーマごとの風向ドットの色
  const windDotColor = themes[themeIndex]?.gaugeColors.windDirection || '#FFD60A';

  // 各ゲージの最大値選択肢
  const maxOptions: Record<GaugeType, number[]> = {
    windSpeed: [0.3, 5, 10, 25],
    temperature: [35, 45, 60],
    soundSpeed: [360, 380, 400]
  };

  // 最大値サイクル: 現在の値の次の選択肢に切り替え
  const cycleMax = () => {
    const options = maxOptions[selectedGauge];
    const currentMax = selectedGauge === 'windSpeed' ? windSpeedMax
      : selectedGauge === 'temperature' ? temperatureMax : soundSpeedMax;
    const idx = options.indexOf(currentMax);
    const next = options[(idx + 1) % options.length];
    onMaxChange(selectedGauge, next);
  };

  // 現在の最大値を表示用にフォーマット
  const getMaxDisplayValue = (): string => {
    switch (selectedGauge) {
      case 'windSpeed': {
        const converted = convertWindSpeed(windSpeedMax, windSpeedUnit);
        return converted % 1 === 0 ? converted.toFixed(0) : converted.toFixed(1);
      }
      case 'temperature':
        return temperatureMax.toString();
      case 'soundSpeed':
        return soundSpeedMax.toString();
    }
  };

  const rangeUnit = selectedGauge === 'temperature'
    ? '°C'
    : selectedGauge === 'soundSpeed'
      ? 'm/s'
      : windSpeedUnit;

  // ResizeObserverでコンテナサイズを監視
  useEffect(() => {
    if (!isActive) return;

    const container = gaugeContainerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const nextIsChartReady = rect.width >= 100 && rect.height >= 100;
      const previous = gaugeLayoutRef.current;
      const nextContainerSize = nextIsChartReady ? rect.width : previous.containerSize;

      if (
        previous.isChartReady === nextIsChartReady &&
        Object.is(previous.containerSize, nextContainerSize)
      ) {
        return;
      }

      const nextLayout = {
        containerSize: nextContainerSize,
        isChartReady: nextIsChartReady,
      };
      gaugeLayoutRef.current = nextLayout;
      setGaugeLayout(nextLayout);
    };

    updateSize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [isActive]);

  useEffect(() => {
    if (!subscribeDisplaySamples) return undefined;
    return subscribeDisplaySamples(({ latestSample }) => {
      const indicator = windDirectionIndicatorRef.current;
      if (!indicator) return;
      if (!Object.is(lastLiveDirectionRef.current, latestSample.windDirection)) {
        lastLiveDirectionRef.current = latestSample.windDirection;
        const currentDisplay = ((liveDirectionContinuousRef.current % 360) + 360) % 360;
        let delta = latestSample.windDirection - currentDisplay;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        liveDirectionContinuousRef.current += delta;
        indicator.style.transform = `translate(-50%, -50%) rotate(${liveDirectionContinuousRef.current}deg)`;
      }
      if (!Object.is(lastLiveSpeedRef.current, latestSample.windSpeed)) {
        lastLiveSpeedRef.current = latestSample.windSpeed;
        indicator.style.opacity = latestSample.windSpeed >= 0.5 ? '1' : '0';
      }
    });
  }, [subscribeDisplaySamples]);

  return (
    <div className="slide-content">
      <IonCard className="gauge-card-main" data-slide-image-card>
        <IonCardContent className="gauge-content">
          <IonSegment 
            value={selectedGauge} 
            onIonChange={e => onGaugeChange(e.detail.value as GaugeType)}
            className="gauge-segment"
          >
            <IonicControlSegmentButton controlSize="M44" selectionState={selectedGauge === 'windSpeed' ? 'on' : 'off'} tone="accent" value="windSpeed">
              <IonLabel>風速</IonLabel>
            </IonicControlSegmentButton>
            <IonicControlSegmentButton controlSize="M44" selectionState={selectedGauge === 'temperature' ? 'on' : 'off'} tone="accent" value="temperature">
              <IonLabel>音仮温度</IonLabel>
            </IonicControlSegmentButton>
            <IonicControlSegmentButton controlSize="M44" selectionState={selectedGauge === 'soundSpeed' ? 'on' : 'off'} tone="accent" value="soundSpeed">
              <IonLabel>音速</IonLabel>
            </IonicControlSegmentButton>
          </IonSegment>
          <div 
            ref={gaugeContainerRef}
            className="gauge-container-main slide-image-share-target"
            style={{ position: 'relative' }}
            {...imageShare.handlers}
          >
            {isActive && gaugeLayout.isChartReady && (
              <Suspense fallback={<div className="chart-loading-placeholder">ゲージを準備中...</div>}>
                <GaugeChart
                  ref={gaugeChartRef}
                  selectedGauge={selectedGauge}
                  windSpeed={windSpeed}
                  windSpeedUnit={windSpeedUnit}
                  temperature={temperature}
                  soundSpeed={soundSpeed}
                  containerSize={gaugeLayout.containerSize}
                  themeIndex={themeIndex}
                  windSpeedMax={windSpeedMax}
                  temperatureMax={temperatureMax}
                  soundSpeedMax={soundSpeedMax}
                  subscribeDisplaySamples={subscribeDisplaySamples}
                />
              </Suspense>
            )}
            {selectedGauge === 'windSpeed' && (
              <>
                {/* 風向インジケーター: 風速0.5m/s以下では非表示 */}
                <div 
                  ref={windDirectionIndicatorRef}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: '100%',
                    height: '100%',
                    transform: `translate(-50%, -50%) rotate(${windDirectionContinuous}deg)`,
                    transition: 'transform 0.08s linear',
                    willChange: 'transform',
                    pointerEvents: 'none',
                    opacity: windSpeed !== null && windSpeed >= 0.5 ? 1 : 0
                  }}
                >
                  <div 
                    style={{
                      position: 'absolute',
                      top: '0%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: `${Math.max(Math.round(28 * gaugeLayout.containerSize / 400), 14)}px`,
                      height: `${Math.max(Math.round(28 * gaugeLayout.containerSize / 400), 14)}px`,
                      borderRadius: '50%',
                      backgroundColor: windDotColor,
                      boxShadow: `0 0 20px ${windDotColor}80`
                    }}
                  />
                </div>
              </>
            )}
          </div>
          <div className={`gauge-control-bar ${selectedGauge === 'windSpeed' ? '' : 'single'}`}>
            {selectedGauge === 'windSpeed' && (
              <NativeControlButton
                controlSize="M44"
                controlVariant="secondary"
                className="gauge-control-button unit-switch-button"
                onClick={onUnitCycle}
                aria-label={`単位を変更。現在 ${windSpeedUnit}`}
              >
                <span>単位</span>
                <strong>{windSpeedUnit}</strong>
              </NativeControlButton>
            )}
            <NativeControlButton
              controlSize="M44"
              controlVariant="secondary"
              className="gauge-control-button max-value-button"
              onClick={cycleMax}
              aria-label={`表示範囲を変更。現在 0 から ${getMaxDisplayValue()} ${rangeUnit}`}
            >
              <span>表示範囲</span>
              <strong>0–{getMaxDisplayValue()} {rangeUnit}</strong>
            </NativeControlButton>
          </div>
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

const areGaugeSlidePropsEqual = (previous: GaugeSlideProps, next: GaugeSlideProps): boolean => {
  const previousActive = previous.isActive ?? true;
  const nextActive = next.isActive ?? true;

  const controlPropsAreEqual =
    previousActive === nextActive &&
    previous.selectedGauge === next.selectedGauge &&
    previous.windSpeedUnit === next.windSpeedUnit &&
    previous.onGaugeChange === next.onGaugeChange &&
    previous.onUnitCycle === next.onUnitCycle &&
    previous.gaugeChartRef === next.gaugeChartRef &&
    previous.themeIndex === next.themeIndex &&
    previous.windSpeedMax === next.windSpeedMax &&
    previous.temperatureMax === next.temperatureMax &&
    previous.soundSpeedMax === next.soundSpeedMax &&
    previous.onMaxChange === next.onMaxChange;

  if (!controlPropsAreEqual) return false;

  if (!previousActive && !nextActive) {
    return true;
  }

  const liveSubscriptionIsStable = previous.subscribeDisplaySamples !== undefined &&
    previous.subscribeDisplaySamples === next.subscribeDisplaySamples;

  return (
    (liveSubscriptionIsStable || Object.is(previous.windSpeed, next.windSpeed)) &&
    (liveSubscriptionIsStable || Object.is(previous.temperature, next.temperature)) &&
    (liveSubscriptionIsStable || Object.is(previous.soundSpeed, next.soundSpeed)) &&
    (liveSubscriptionIsStable || Object.is(previous.windDirectionContinuous, next.windDirectionContinuous))
  );
};

export default memo(GaugeSlide, areGaugeSlidePropsEqual);
