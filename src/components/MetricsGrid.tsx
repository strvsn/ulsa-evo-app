/**
 * 計測値グリッドコンポーネント
 * 風速・風向・音仮温度・音速の4つの計測値を表示
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import MetricCard from './MetricCard';
import { DerivedMetricAddCard, DerivedMetricPicker } from './derived-metrics/DerivedMetricControls';
import {
  type DerivedMetricId,
  useDerivedMetricPreferences,
} from './derived-metrics/derivedMetricPreferences';
import { convertWindSpeed, type WindSpeedUnit } from '../utils/windSpeedConverter';
import { recordPerfEvent } from '../utils/renderPerfDiagnostics';
import type { SensorBufferRefs, SensorValues } from '../types/sensor';
import './derived-metrics/derivedMetricCards.css';

type DerivedMetricBufferRefs = Pick<SensorBufferRefs, 'referenceWindSpeedWindowRef'>;

interface MetricsGridProps {
  windSpeed: number | null;
  windSpeedAverage10m: number | null;
  windSpeedUnit: WindSpeedUnit;
  windDirection: number | null;
  headingSpeed: number | null;
  temperature: number | null;
  soundSpeed: number | null;
  bufferRefs?: DerivedMetricBufferRefs;
  getPresentationValues?: () => SensorValues;
  subscribePresentationValues?: (listener: (values: SensorValues) => void) => () => void;
}

type LiveMetricId = 'windSpeed' | 'windDirection' | 'headingSpeed' | 'temperature' | 'soundSpeed' | 'windSpeedAverage10m';

interface LiveMetricDisplay {
  value: number | null;
  unit: string;
  decimals: number;
  showPositiveSign?: boolean;
}

const writeLiveMetric = (
  root: HTMLElement,
  metricId: LiveMetricId,
  display: LiveMetricDisplay,
): void => {
  const card = root.querySelector<HTMLElement>(`[data-metric-id="${metricId}"]`);
  const number = card?.querySelector<HTMLElement>('.metric-number');
  const unit = card?.querySelector<HTMLElement>('.metric-unit');
  if (!number || !unit) return;

  const hasValue = display.value !== null && Number.isFinite(display.value);
  number.textContent = hasValue
    ? `${display.showPositiveSign && display.value! > 0 ? '+' : ''}${display.value!.toFixed(display.decimals)}`
    : '--';
  number.classList.toggle('metric-empty', !hasValue);
  unit.textContent = display.unit;
  unit.hidden = !hasValue;
};

/**
 * 計測値グリッド
 * 4つのセンサー値をカード形式で表示
 */
const MetricsGrid: React.FC<MetricsGridProps> = ({
  windSpeed,
  windSpeedAverage10m,
  windSpeedUnit,
  windDirection,
  headingSpeed,
  temperature,
  soundSpeed,
  bufferRefs,
  getPresentationValues,
  subscribePresentationValues,
}) => {
  recordPerfEvent('MetricsGrid.render');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [referenceMetricsNowMs, setReferenceMetricsNowMs] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);
  const lastPresentedValuesRef = useRef<SensorValues | null>(null);
  const { selectedMetricIds, addMetric, removeMetric } = useDerivedMetricPreferences();
  const referenceWindow = bufferRefs?.referenceWindSpeedWindowRef?.current;
  const currentPresentation = getPresentationValues?.() ?? {
    windSpeed,
    windSpeedAverage10m,
    windDirection,
    windDirectionContinuous: windDirection ?? 0,
    headingSpeed,
    temperature,
    soundSpeed,
  };

  useEffect(() => {
    if (!subscribePresentationValues) return undefined;

    const updateCards = (values: SensorValues) => {
      const root = rootRef.current;
      if (!root) return;
      const windSpeedDecimals = windSpeedUnit === 'cm/s' ? 0 : 2;
      const previous = lastPresentedValuesRef.current;
      if (!previous || !Object.is(previous.windSpeed, values.windSpeed)) {
        writeLiveMetric(root, 'windSpeed', {
          value: values.windSpeed === null ? null : convertWindSpeed(values.windSpeed, windSpeedUnit),
          unit: windSpeedUnit,
          decimals: windSpeedDecimals,
        });
      }
      if (!previous || !Object.is(previous.windDirection, values.windDirection)) {
        writeLiveMetric(root, 'windDirection', { value: values.windDirection, unit: '°', decimals: 0 });
      }
      if (!previous || !Object.is(previous.headingSpeed, values.headingSpeed)) {
        writeLiveMetric(root, 'headingSpeed', {
          value: values.headingSpeed === null ? null : convertWindSpeed(values.headingSpeed, windSpeedUnit),
          unit: windSpeedUnit,
          decimals: windSpeedDecimals,
          showPositiveSign: true,
        });
      }
      if (!previous || !Object.is(previous.temperature, values.temperature)) {
        writeLiveMetric(root, 'temperature', { value: values.temperature, unit: '°C', decimals: 1 });
      }
      if (!previous || !Object.is(previous.soundSpeed, values.soundSpeed)) {
        writeLiveMetric(root, 'soundSpeed', { value: values.soundSpeed, unit: 'm/s', decimals: 1 });
      }
      if (!previous || !Object.is(previous.windSpeedAverage10m, values.windSpeedAverage10m)) {
        writeLiveMetric(root, 'windSpeedAverage10m', {
          value: values.windSpeedAverage10m === null
            ? null
            : convertWindSpeed(values.windSpeedAverage10m, windSpeedUnit),
          unit: windSpeedUnit,
          decimals: windSpeedDecimals,
        });
      }
      lastPresentedValuesRef.current = values;
    };

    lastPresentedValuesRef.current = null;
    return subscribePresentationValues(updateCards);
  }, [subscribePresentationValues, windSpeedUnit]);

  useEffect(() => {
    if (!referenceWindow || selectedMetricIds.length === 0) return undefined;
    const refresh = () => {
      if (document.visibilityState !== 'hidden') setReferenceMetricsNowMs(Date.now());
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [referenceWindow, selectedMetricIds.length]);

  const fallbackAverage = referenceWindow ? null : currentPresentation.windSpeedAverage10m;
  const referenceMetrics = useMemo(() => {
    if (!referenceWindow) return { average: fallbackAverage, observedMax: null };
    return {
      average: referenceWindow.getAverage(referenceMetricsNowMs),
      observedMax: selectedMetricIds.includes('observedMaxWindSpeed10m')
        ? referenceWindow.getObservedMax(referenceMetricsNowMs) : null,
    };
  }, [referenceWindow, referenceMetricsNowMs, fallbackAverage, selectedMetricIds]);

  const windSpeedDecimals = windSpeedUnit === 'cm/s' ? 0 : 2;
  const derivedMetricCards: Record<DerivedMetricId, {
    label: string;
    value: number | null;
    unit: string;
    decimals: number;
  }> = {
    windSpeedAverage10m: {
      label: '10分平均風速',
      value: currentPresentation.windSpeed === null || referenceMetrics.average === null
        ? null
        : convertWindSpeed(referenceMetrics.average, windSpeedUnit),
      unit: windSpeedUnit,
      decimals: windSpeedDecimals,
    },
    observedMaxWindSpeed10m: {
      label: '10分観測最大風速',
      value: currentPresentation.windSpeed === null || referenceMetrics.observedMax === null
        ? null
        : convertWindSpeed(referenceMetrics.observedMax, windSpeedUnit),
      unit: windSpeedUnit,
      decimals: windSpeedDecimals,
    },
  };

  return (
    <div className="metrics-fixed" ref={rootRef}>
      <div className="metrics-grid">
        <MetricCard
          metricId="windSpeed"
          label="風速"
          value={currentPresentation.windSpeed === null ? null : convertWindSpeed(currentPresentation.windSpeed, windSpeedUnit)}
          unit={windSpeedUnit}
          className="wind-speed-card metric-card-primary"
          decimals={windSpeedUnit === 'cm/s' ? 0 : 2}
        />
        <MetricCard
          metricId="windDirection"
          label="風向"
          value={currentPresentation.windDirection}
          unit="°"
          className="wind-direction-card metric-card-primary"
          decimals={0}
        />
        <MetricCard
          metricId="headingSpeed"
          label="正面風速成分"
          value={currentPresentation.headingSpeed === null ? null : convertWindSpeed(currentPresentation.headingSpeed, windSpeedUnit)}
          unit={windSpeedUnit}
          className="heading-speed-card metric-card-primary"
          decimals={windSpeedDecimals}
          detail="＋ 向かい風 · − 追い風"
          showPositiveSign
        />
        <MetricCard
          metricId="temperature"
          label="音仮温度"
          value={currentPresentation.temperature}
          unit="°C"
          className="temperature-card"
        />
        <MetricCard
          metricId="soundSpeed"
          label="音速"
          value={currentPresentation.soundSpeed}
          unit="m/s"
          className="sound-speed-card"
        />
        {selectedMetricIds.map((id) => {
          const metric = derivedMetricCards[id];
          return (
            <MetricCard
              key={id}
              metricId={id}
              label={metric.label}
              value={metric.value}
              unit={metric.unit}
              className={`derived-metric-card metric-card-secondary derived-metric-${id} ${id === 'windSpeedAverage10m' ? 'wind-speed-average-card' : ''}`}
              decimals={metric.decimals}
              onRemove={() => removeMetric(id)}
            />
          );
        })}
        <DerivedMetricAddCard
          isPickerOpen={isPickerOpen}
          onToggle={() => setIsPickerOpen((isOpen) => !isOpen)}
        />
      </div>
      {isPickerOpen && (
        <DerivedMetricPicker
          selectedMetricIds={selectedMetricIds}
          onAdd={(id) => {
            addMetric(id);
            setIsPickerOpen(false);
          }}
          onClose={() => setIsPickerOpen(false)}
        />
      )}
    </div>
  );
};

export default memo(MetricsGrid);
