export type WindSpeedSeriesKey = 'windSpeed' | 'windSpeedA' | 'windSpeedB';
export type WindSpeedSeriesVisibility = Record<WindSpeedSeriesKey, boolean>;

export const WIND_SPEED_SERIES: Array<{
  key: WindSpeedSeriesKey;
  name: string;
  color: string;
}> = [
  { key: 'windSpeed', name: '風速', color: '#0A84FF' },
  { key: 'windSpeedA', name: 'A方向', color: '#FF9F0A' },
  { key: 'windSpeedB', name: 'B方向', color: '#64D2FF' },
];

export const DEFAULT_WIND_SPEED_SERIES_VISIBILITY: WindSpeedSeriesVisibility = {
  windSpeed: true,
  windSpeedA: true,
  windSpeedB: true,
};
