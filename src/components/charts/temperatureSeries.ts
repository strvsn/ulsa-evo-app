export type TemperatureSeriesKey = 'temperature';
export type TemperatureSeriesVisibility = Record<TemperatureSeriesKey, boolean>;
export const TEMPERATURE_SERIES: Array<{
    key: TemperatureSeriesKey;
    name: string;
    color: string;
}> = [
    { key: 'temperature', name: '音仮温度', color: '#FF6B6B' }
];
export const DEFAULT_TEMPERATURE_SERIES_VISIBILITY: TemperatureSeriesVisibility = {
    temperature: true,
};
