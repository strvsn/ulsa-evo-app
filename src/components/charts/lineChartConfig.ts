export const CHART_CONFIGS = {
    windSpeed: { color: '#0A84FF', name: '風速', unit: ' m/s', fixedMin: 0, fixedMax: 25 },
    windDirection: { color: '#FFD60A', name: '風向', unit: '°', fixedMin: 0, fixedMax: 360 },
    temperature: { color: '#FF6B6B', name: '音仮温度', unit: '°C', fixedMin: -10, fixedMax: 70 },
    soundSpeed: { color: '#32D74B', name: '音速', unit: ' m/s', fixedMin: 300, fixedMax: 380 },
} as const;
export const TIME_SCALE_MS = {
    '10s': 10 * 1000,
    '1m': 60 * 1000,
    '10m': 10 * 60 * 1000,
} as const;
export const BASE_GRID_OPTION = {
    top: '3%',
    right: '2%',
    left: '2%',
    containLabel: true,
} as const;
export const formatYAxisLabel = (value: number, minimum = 0, maximum = Math.abs(value), splitNumber = 5) => {
    if (!Number.isFinite(value))
        return '';
    const interval = Math.abs(maximum - minimum) / Math.max(splitNumber, 1);
    const decimals = interval > 0 && interval < 1
        ? Math.min(3, Math.max(1, Math.ceil(-Math.log10(interval))))
        : value >= 100 || interval >= 1
            ? 0
            : 1;
    return value.toFixed(decimals);
};
export const formatYAxisTitle = (label: string, unit: string) => `${label} (${unit.trim()})`;
export type ScheduledChartFrame = {
    kind: 'raf' | 'timeout';
    id: number;
};
export const requestChartFrame = (callback: () => void): ScheduledChartFrame => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return { kind: 'raf', id: window.requestAnimationFrame(callback) };
    }
    return { kind: 'timeout', id: window.setTimeout(callback, 16) };
};
export const cancelChartFrame = (frame: ScheduledChartFrame): void => {
    if (frame.kind === 'raf' && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(frame.id);
        return;
    }
    window.clearTimeout(frame.id);
};
