import type { NumericRingBuffer, RingBuffer } from '../../utils/RingBuffer';
import { formatXAxisTimestampMs } from './lineChartAxis';
import { WIND_SPEED_SERIES, type WindSpeedSeriesKey, type WindSpeedSeriesVisibility, } from './windSpeedSeries';
import { TEMPERATURE_SERIES, type TemperatureSeriesKey, type TemperatureSeriesVisibility, } from './temperatureSeries';
export interface TooltipParam {
    dataIndex: number;
    value: number | [
        number,
        number
    ];
    seriesName: string;
}
export interface WindowedChartData {
    data: Array<[
        number,
        number
    ]>;
    timestamps: string[];
    min: number;
    max: number;
    xAxisMin: number;
    xAxisMax: number;
}
export const getTooltipValue = (value: TooltipParam['value']): number => (Array.isArray(value) ? value[1] : value);
export const getWindowedChartData = (valueBuffer: NumericRingBuffer, timestampBuffer: RingBuffer<string>, timestampMsBuffer: RingBuffer<number>, timeWindowMs: number): WindowedChartData => {
    const alignedCount = Math.min(valueBuffer.length, timestampBuffer.length, timestampMsBuffer.length);
    const latestTimestampMs = alignedCount > 0
        ? timestampMsBuffer.get(alignedCount - 1) ?? Date.now()
        : Date.now();
    const xAxisMax = latestTimestampMs;
    const xAxisMin = xAxisMax - timeWindowMs;
    const reversedData: Array<[
        number,
        number
    ]> = [];
    const reversedTimestamps: string[] = [];
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let index = alignedCount - 1; index >= 0; index--) {
        const timestampMs = timestampMsBuffer.get(index);
        if (timestampMs === undefined || timestampMs > xAxisMax) {
            continue;
        }
        if (timestampMs < xAxisMin) {
            break;
        }
        const value = valueBuffer.get(index);
        if (value === undefined || !Number.isFinite(value)) {
            continue;
        }
        reversedData.push([timestampMs, value]);
        reversedTimestamps.push(timestampBuffer.get(index) ?? formatXAxisTimestampMs(timestampMs));
        if (value < min)
            min = value;
        if (value > max)
            max = value;
    }
    return {
        data: reversedData.reverse(),
        timestamps: reversedTimestamps.reverse(),
        min,
        max,
        xAxisMin,
        xAxisMax,
    };
};
export const getWindowedDataBounds = (windows: WindowedChartData[]): Pick<WindowedChartData, 'min' | 'max'> | null => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let hasData = false;
    windows.forEach((windowed) => {
        if (windowed.data.length === 0)
            return;
        if (windowed.min < min)
            min = windowed.min;
        if (windowed.max > max)
            max = windowed.max;
        hasData = true;
    });
    return hasData ? { min, max } : null;
};
export const getWindSpeedWindowedSeries = ({ baseWindowedData, color, timeWindowMs, timestampBuffer, timestampMsBuffer, visibility, windSpeedBuffer, windSpeedABuffer, windSpeedBBuffer, }: {
    baseWindowedData: WindowedChartData;
    color: string;
    timeWindowMs: number;
    timestampBuffer: RingBuffer<string>;
    timestampMsBuffer: RingBuffer<number>;
    visibility: WindSpeedSeriesVisibility;
    windSpeedBuffer: NumericRingBuffer;
    windSpeedABuffer: NumericRingBuffer;
    windSpeedBBuffer: NumericRingBuffer;
}) => {
    const buffers: Record<WindSpeedSeriesKey, NumericRingBuffer> = {
        windSpeed: windSpeedBuffer,
        windSpeedA: windSpeedABuffer,
        windSpeedB: windSpeedBBuffer,
    };
    return WIND_SPEED_SERIES.map((series) => {
        const windowedData = series.key === 'windSpeed'
            ? baseWindowedData
            : getWindowedChartData(buffers[series.key], timestampBuffer, timestampMsBuffer, timeWindowMs);
        return {
            ...series,
            color: series.key === 'windSpeed' ? color : series.color,
            visible: visibility[series.key],
            windowedData,
        };
    });
};
export const getTemperatureWindowedSeries = ({ baseWindowedData, color, timeWindowMs, timestampBuffer, timestampMsBuffer, visibility, temperatureBuffer, }: {
    baseWindowedData: WindowedChartData;
    color: string;
    timeWindowMs: number;
    timestampBuffer: RingBuffer<string>;
    timestampMsBuffer: RingBuffer<number>;
    visibility: TemperatureSeriesVisibility;
    temperatureBuffer: NumericRingBuffer;
}) => {
    const buffers: Record<TemperatureSeriesKey, NumericRingBuffer> = {
        temperature: temperatureBuffer,
    };
    return TEMPERATURE_SERIES.map((series) => ({
        ...series,
        color: series.key === 'temperature' ? color : series.color,
        visible: visibility[series.key],
        windowedData: series.key === 'temperature'
            ? baseWindowedData
            : getWindowedChartData(buffers[series.key], timestampBuffer, timestampMsBuffer, timeWindowMs),
    }));
};
