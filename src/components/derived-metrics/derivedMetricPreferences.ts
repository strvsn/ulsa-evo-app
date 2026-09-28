import { useCallback, useState } from 'react';

export const DERIVED_METRIC_PREFERENCES_STORAGE_KEY = 'ulsa-evo-derived-metric-cards-v1';

// Only statistics directly supported by received scalar speed samples are
// offered. Separate BLE direction notifications cannot prove frame pairing,
// and filtered output is not a certified turbulence measurement.
export const DERIVED_METRIC_IDS = [
  'windSpeedAverage10m',
  'observedMaxWindSpeed10m',
] as const;

export type DerivedMetricId = typeof DERIVED_METRIC_IDS[number];

export interface DerivedMetricOption {
  id: DerivedMetricId;
  label: string;
  description: string;
}

export const DERIVED_METRIC_OPTIONS: readonly DerivedMetricOption[] = [
  {
    id: 'windSpeedAverage10m',
    label: '10分平均風速',
    description: '端末で受信した直近10分の風速平均',
  },
  {
    id: 'observedMaxWindSpeed10m',
    label: '10分観測最大風速',
    description: '端末で受信した直近10分の最大値（突風ではありません）',
  },
] as const;

const DEFAULT_DERIVED_METRICS: DerivedMetricId[] = ['windSpeedAverage10m'];

const isDerivedMetricId = (value: unknown): value is DerivedMetricId => (
  typeof value === 'string' && DERIVED_METRIC_IDS.includes(value as DerivedMetricId)
);

const normalizeSelection = (ids: readonly DerivedMetricId[]): DerivedMetricId[] => (
  DERIVED_METRIC_IDS.filter((id) => ids.includes(id))
);

const readStoredSelection = (): DerivedMetricId[] => {
  if (typeof window === 'undefined') return DEFAULT_DERIVED_METRICS;

  try {
    const serialized = window.localStorage.getItem(DERIVED_METRIC_PREFERENCES_STORAGE_KEY);
    if (serialized === null) return DEFAULT_DERIVED_METRICS;
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed) ? normalizeSelection(parsed.filter(isDerivedMetricId)) : DEFAULT_DERIVED_METRICS;
  } catch {
    return DEFAULT_DERIVED_METRICS;
  }
};

const storeSelection = (ids: readonly DerivedMetricId[]): void => {
  try {
    window.localStorage.setItem(DERIVED_METRIC_PREFERENCES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private browsing or a storage policy may disable persistence. The visible state still works for this session.
  }
};

export const useDerivedMetricPreferences = () => {
  const [selectedMetricIds, setSelectedMetricIds] = useState<DerivedMetricId[]>(readStoredSelection);

  const updateSelection = useCallback((nextIds: readonly DerivedMetricId[]) => {
    const normalizedIds = normalizeSelection(nextIds);
    setSelectedMetricIds(normalizedIds);
    storeSelection(normalizedIds);
  }, []);

  const addMetric = useCallback((id: DerivedMetricId) => {
    setSelectedMetricIds((previousIds) => {
      const nextIds = normalizeSelection([...previousIds, id]);
      storeSelection(nextIds);
      return nextIds;
    });
  }, []);

  const removeMetric = useCallback((id: DerivedMetricId) => {
    setSelectedMetricIds((previousIds) => {
      const nextIds = previousIds.filter((currentId) => currentId !== id);
      storeSelection(nextIds);
      return nextIds;
    });
  }, []);

  return { selectedMetricIds, addMetric, removeMetric, updateSelection };
};
