import { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GaugeChart, { type GaugeChartRef } from './GaugeChart';
import LineChart, { type LineChartRef } from './LineChart';
import { formatCompactXAxisTimestampMs, formatXAxisTimestamp, formatXAxisTimestampMs, getXAxisLabelLayout, } from './lineChartAxis';
import { NumericRingBuffer, RingBuffer } from '../../utils/RingBuffer';
import { DEFAULT_ULSA_THEME_INDEX } from '../../constants/themes';
import { formatYAxisLabel } from './lineChartConfig';
const chartMock = vi.hoisted(() => {
    const instance = {
        clear: vi.fn(),
        dispose: vi.fn(),
        isDisposed: vi.fn(() => false),
        resize: vi.fn(),
        setOption: vi.fn(),
    };
    return { instance, renderProps: [] as Array<{
            option?: unknown;
        }> };
});
let frameCallbacks = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;
const flushAnimationFrames = () => {
    const callbacks = Array.from(frameCallbacks.values());
    frameCallbacks.clear();
    callbacks.forEach((callback) => callback(performance.now()));
};
vi.mock('echarts-for-react', async () => {
    const React = await import('react');
    return {
        default: React.forwardRef((props: {
            option?: unknown;
        }, ref) => {
            chartMock.renderProps.push(props);
            React.useImperativeHandle(ref, () => ({
                getEchartsInstance: () => chartMock.instance,
            }));
            return <div data-testid="echarts-chart"/>;
        }),
    };
});
interface LineChartSample {
    windSpeed: number;
    windSpeedA?: number;
    windSpeedB?: number;
    windDirection: number;
    temperature: number;
    soundSpeed: number;
    timestamp: string;
    timestampMs?: number;
}
const toLocalTimestampMs = (timestamp: string): number => {
    const [hour = '0', minute = '0', second = '0'] = timestamp.split(':');
    return new Date(2026, 0, 1, Number.parseInt(hour, 10) || 0, Number.parseInt(minute, 10) || 0, Number.parseInt(second, 10) || 0).getTime();
};
const getSeriesValues = (data: Array<[
    number,
    number
]>): number[] => data.map((point) => point[1]);
const getPrimaryYAxis = <T,>(yAxis: T | T[]): T => Array.isArray(yAxis) ? yAxis[0] : yAxis;
const formatTimestampLabel = (timestampMs: number): string => {
    const date = new Date(timestampMs);
    return [
        date.getHours().toString().padStart(2, '0'),
        date.getMinutes().toString().padStart(2, '0'),
        date.getSeconds().toString().padStart(2, '0')
    ].join(':');
};
const createLineChartProps = (options: {
    capacity?: number;
    samples?: LineChartSample[];
} = {}) => {
    const capacity = options.capacity ?? 10;
    const samples = options.samples ?? [{
            windSpeed: 1.2,
            windDirection: 42,
            temperature: 24.5,
            soundSpeed: 344.2,
            timestamp: '12:34:56',
        }];
    const windSpeedBuffer = new NumericRingBuffer(capacity);
    const windSpeedABuffer = new NumericRingBuffer(capacity);
    const windSpeedBBuffer = new NumericRingBuffer(capacity);
    const windDirectionBuffer = new NumericRingBuffer(capacity);
    const temperatureBuffer = new NumericRingBuffer(capacity);
    const soundSpeedBuffer = new NumericRingBuffer(capacity);
    const timestampBuffer = new RingBuffer<string>(capacity);
    const timestampMsBuffer = new RingBuffer<number>(capacity);
    samples.forEach((sample) => {
        windSpeedBuffer.push(sample.windSpeed);
        windSpeedABuffer.push(sample.windSpeedA ?? Number.NaN);
        windSpeedBBuffer.push(sample.windSpeedB ?? Number.NaN);
        windDirectionBuffer.push(sample.windDirection);
        temperatureBuffer.push(sample.temperature);
        soundSpeedBuffer.push(sample.soundSpeed);
        timestampBuffer.push(sample.timestamp);
        timestampMsBuffer.push(sample.timestampMs ?? toLocalTimestampMs(sample.timestamp));
    });
    return {
        selectedChart: 'windSpeed' as const,
        timeScale: '10s' as const,
        chartScaleMode: 'fixed' as const,
        windSpeedBufferRef: { current: windSpeedBuffer },
        windSpeedABufferRef: { current: windSpeedABuffer },
        windSpeedBBufferRef: { current: windSpeedBBuffer },
        windDirectionBufferRef: { current: windDirectionBuffer },
        temperatureBufferRef: { current: temperatureBuffer },
        soundSpeedBufferRef: { current: soundSpeedBuffer },
        timestampBufferRef: { current: timestampBuffer },
        timestampMsBufferRef: { current: timestampMsBuffer },
        lastDebugLogTime: { current: 0 },
        themeIndex: DEFAULT_ULSA_THEME_INDEX,
    };
};
describe('chart lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        chartMock.renderProps.length = 0;
        chartMock.instance.isDisposed.mockReturnValue(false);
        frameCallbacks = new Map<number, FrameRequestCallback>();
        nextFrameId = 1;
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            const frameId = nextFrameId++;
            frameCallbacks.set(frameId, callback);
            return frameId;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn((frameId: number) => {
            frameCallbacks.delete(frameId);
        }));
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });
    it('resizes and disposes GaugeChart through its own lifecycle', () => {
        const ref = createRef<GaugeChartRef>();
        const { unmount } = render(<GaugeChart ref={ref} selectedGauge="windSpeed" windSpeed={null} windSpeedUnit="m/s" temperature={null} soundSpeed={null} containerSize={400} themeIndex={DEFAULT_ULSA_THEME_INDEX}/>);
        act(() => {
            ref.current?.resize();
        });
        expect(chartMock.instance.resize).toHaveBeenCalledTimes(1);
        unmount();
        expect(chartMock.instance.dispose).toHaveBeenCalledTimes(1);
    });
    it('ignores GaugeChart resizes after imperative dispose', () => {
        const ref = createRef<GaugeChartRef>();
        const { unmount } = render(<GaugeChart ref={ref} selectedGauge="windSpeed" windSpeed={1.23} windSpeedUnit="m/s" temperature={24.5} soundSpeed={344.2} containerSize={400} themeIndex={DEFAULT_ULSA_THEME_INDEX}/>);
        act(() => {
            ref.current?.dispose();
            ref.current?.resize();
            ref.current?.dispose();
        });
        expect(chartMock.instance.dispose).toHaveBeenCalledTimes(1);
        expect(chartMock.instance.resize).not.toHaveBeenCalled();
        unmount();
        expect(chartMock.instance.dispose).toHaveBeenCalledTimes(1);
    });
    it('updates, resizes, clears, and disposes LineChart through its own lifecycle', () => {
        const ref = createRef<LineChartRef>();
        const { unmount } = render(<LineChart ref={ref} {...createLineChartProps()}/>);
        act(() => {
            ref.current?.updateData();
        });
        expect(chartMock.instance.setOption).not.toHaveBeenCalled();
        act(() => {
            flushAnimationFrames();
        });
        expect(chartMock.instance.setOption).toHaveBeenCalledTimes(1);
        act(() => {
            ref.current?.resize();
            ref.current?.dispose();
        });
        expect(chartMock.instance.resize).toHaveBeenCalledTimes(1);
        expect(chartMock.instance.clear).toHaveBeenCalledTimes(1);
        expect(chartMock.instance.dispose).toHaveBeenCalledTimes(1);
        unmount();
        expect(chartMock.instance.clear).toHaveBeenCalledTimes(1);
        expect(chartMock.instance.dispose).toHaveBeenCalledTimes(1);
    });
    it('ignores LineChart updates and resizes after imperative dispose', () => {
        const ref = createRef<LineChartRef>();
        render(<LineChart ref={ref} {...createLineChartProps()}/>);
        act(() => {
            ref.current?.dispose();
            ref.current?.resize();
            ref.current?.updateData();
            flushAnimationFrames();
        });
        expect(chartMock.instance.clear).toHaveBeenCalledTimes(1);
        expect(chartMock.instance.dispose).toHaveBeenCalledTimes(1);
        expect(chartMock.instance.resize).not.toHaveBeenCalled();
        expect(chartMock.instance.setOption).not.toHaveBeenCalled();
    });
    it('coalesces multiple LineChart updates into one animation frame', () => {
        const ref = createRef<LineChartRef>();
        render(<LineChart ref={ref} {...createLineChartProps()}/>);
        act(() => {
            ref.current?.updateData();
            ref.current?.updateData();
            ref.current?.updateData();
        });
        expect(chartMock.instance.setOption).not.toHaveBeenCalled();
        act(() => {
            flushAnimationFrames();
        });
        expect(chartMock.instance.setOption).toHaveBeenCalledTimes(1);
    });
    it('coalesces characteristic-like LineChart bursts while preserving every buffered point', () => {
        const ref = createRef<LineChartRef>();
        const props = createLineChartProps({ capacity: 150, samples: [] });
        render(<LineChart ref={ref} {...props}/>);
        act(() => {
            for (let index = 0; index < 120; index++) {
                props.windSpeedBufferRef.current.push(index / 10);
                props.timestampBufferRef.current.push(`12:${Math.floor(index / 60)}:${index % 60}`);
                props.timestampMsBufferRef.current.push(toLocalTimestampMs(`12:${Math.floor(index / 60)}:${index % 60}`));
                ref.current?.updateData();
            }
        });
        expect(props.windSpeedBufferRef.current.length).toBe(120);
        expect(props.timestampBufferRef.current.length).toBe(120);
        expect(chartMock.instance.setOption).not.toHaveBeenCalled();
        act(() => {
            flushAnimationFrames();
        });
        expect(chartMock.instance.setOption).toHaveBeenCalledTimes(1);
        const option = chartMock.instance.setOption.mock.calls[0][0] as {
            xAxis: {
                min: number;
                max: number;
            };
            series: Array<{
                data: Array<[
                    number,
                    number
                ]>;
            }>;
        };
        expect(option.xAxis.max - option.xAxis.min).toBe(10000);
        expect(option.series[0].data).toHaveLength(11);
        expect(getSeriesValues(option.series[0].data)).toEqual([10.9, 11, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9]);
    });
    it('flushes LineChart x-axis labels and series data in the same setOption call', () => {
        const ref = createRef<LineChartRef>();
        const props = createLineChartProps();
        render(<LineChart ref={ref} {...props}/>);
        act(() => {
            props.windSpeedBufferRef.current.push(2.34);
            props.timestampBufferRef.current.push('12:34:57');
            props.timestampMsBufferRef.current.push(toLocalTimestampMs('12:34:57'));
            ref.current?.updateData();
            flushAnimationFrames();
        });
        expect(chartMock.instance.setOption).toHaveBeenCalledTimes(1);
        const [option, setOptionOptions] = chartMock.instance.setOption.mock.calls[0] as unknown as [
            {
                xAxis: {
                    min: number;
                    max: number;
                    axisLabel: {
                        formatter: (value: number) => string;
                    };
                };
                series: Array<{
                    data: Array<[
                        number,
                        number
                    ]>;
                }>;
            },
            {
                notMerge: boolean;
                replaceMerge: string[];
            }
        ];
        expect(option.xAxis.max - option.xAxis.min).toBe(10000);
        expect(option.xAxis.axisLabel.formatter(option.series[0].data[0][0])).toBe('34:56');
        expect(option.xAxis.axisLabel.formatter(option.series[0].data[1][0])).toBe('34:57');
        expect(getSeriesValues(option.series[0].data)).toEqual([1.2, 2.34]);
        expect(setOptionOptions).toEqual({
            notMerge: false,
        });
    });
    it('shows the axis tooltip only while the chart is hovered or touched', () => {
        render(<LineChart {...createLineChartProps()}/>);
        const option = chartMock.renderProps.at(-1)?.option as {
            tooltip: {
                alwaysShowContent: boolean;
                hideDelay: number;
                triggerOn: string;
            };
        };
        expect(option.tooltip).toMatchObject({
            alwaysShowContent: false,
            hideDelay: 0,
            triggerOn: 'mousemove|click',
        });
    });
    it('reuses static LineChart option fragments across live data updates', () => {
        const ref = createRef<LineChartRef>();
        const props = createLineChartProps();
        render(<LineChart ref={ref} {...props}/>);
        act(() => {
            ref.current?.updateData();
            flushAnimationFrames();
        });
        act(() => {
            props.windSpeedBufferRef.current.push(3.45);
            props.timestampBufferRef.current.push('12:34:57');
            props.timestampMsBufferRef.current.push(toLocalTimestampMs('12:34:57'));
            ref.current?.updateData();
            flushAnimationFrames();
        });
        expect(chartMock.instance.setOption).toHaveBeenCalledTimes(2);
        const firstOption = chartMock.instance.setOption.mock.calls[0][0] as {
            xAxis: {
                axisLine: object;
            };
            yAxis: {
                axisLine: object;
                splitLine: object;
            };
            series: Array<{
                data: Array<[
                    number,
                    number
                ]>;
                lineStyle: object;
                areaStyle: object;
            }>;
        };
        const secondOption = chartMock.instance.setOption.mock.calls[1][0] as {
            xAxis: {
                axisLine: object;
            };
            yAxis: {
                axisLine: object;
                splitLine: object;
            };
            series: Array<{
                data: Array<[
                    number,
                    number
                ]>;
                lineStyle: object;
                areaStyle: object;
            }>;
        };
        expect(secondOption.xAxis.axisLine).toBe(firstOption.xAxis.axisLine);
        expect(secondOption.yAxis.axisLine).toBe(firstOption.yAxis.axisLine);
        expect(secondOption.yAxis.splitLine).toBe(firstOption.yAxis.splitLine);
        expect(secondOption.series[0].lineStyle).toBe(firstOption.series[0].lineStyle);
        expect(secondOption.series[0].areaStyle).toBe(firstOption.series[0].areaStyle);
        expect(getSeriesValues(secondOption.series[0].data)).toEqual([1.2, 3.45]);
    });
    it('updates selected chart data and fixed scale after a chart type change', () => {
        const ref = createRef<LineChartRef>();
        const props = createLineChartProps({
            samples: [
                { windSpeed: 1.2, windDirection: 42, temperature: 24.5, soundSpeed: 344.2, timestamp: '12:34:56' },
                { windSpeed: 2.4, windDirection: 315, temperature: 25.1, soundSpeed: 344.8, timestamp: '12:34:57' }
            ],
        });
        const { rerender } = render(<LineChart ref={ref} {...props}/>);
        rerender(<LineChart ref={ref} {...props} selectedChart="windDirection"/>);
        act(() => {
            ref.current?.updateData();
            flushAnimationFrames();
        });
        const option = chartMock.instance.setOption.mock.calls[0][0] as {
            yAxis: {
                min: number;
                max: number;
            };
            series: Array<{
                name: string;
                data: Array<[
                    number,
                    number
                ]>;
            }>;
        };
        expect(option.series[0].name).toBe('風向');
        expect(getSeriesValues(option.series[0].data)).toEqual([42, 315]);
        expect(option.yAxis.min).toBe(0);
        expect(option.yAxis.max).toBe(360);
    });
    it.each([
        ['windSpeed', '風速 (m/s)'],
        ['windDirection', '風向 (°)'],
        ['temperature', '音仮温度 (°C)'],
        ['soundSpeed', '音速 (m/s)']
    ] as const)('adds a compact vertical y-axis title for %s', (selectedChart, expectedTitle) => {
        const ref = createRef<LineChartRef>();
        render(<LineChart ref={ref} {...createLineChartProps()} selectedChart={selectedChart}/>);
        act(() => {
            ref.current?.updateData();
            flushAnimationFrames();
        });
        const option = chartMock.instance.setOption.mock.calls[0][0] as {
            yAxis: {
                name: string;
                nameLocation: string;
                nameRotate: number;
                nameGap: number;
                nameTextStyle: {
                    fontSize: number;
                };
            } | Array<{
                name: string;
                nameLocation: string;
                nameRotate: number;
                nameGap: number;
                nameTextStyle: {
                    fontSize: number;
                };
            }>;
        };
        const primaryYAxis = getPrimaryYAxis(option.yAxis);
        expect(primaryYAxis).toMatchObject({
            name: expectedTitle,
            nameLocation: 'middle',
            nameRotate: 90,
            nameTextStyle: { fontSize: 14 },
        });
        expect(primaryYAxis.nameGap).toBeGreaterThan(0);
    });
    it('limits live data to the selected time scale window', () => {
        const ref = createRef<LineChartRef>();
        const samples = Array.from({ length: 120 }, (_, index) => {
            void _;
            return ({
                windSpeed: index,
                windDirection: index % 360,
                temperature: 20 + index / 10,
                soundSpeed: 340 + index / 10,
                timestamp: `12:${Math.floor(index / 60)}:${index % 60}`,
            });
        });
        const props = createLineChartProps({ capacity: 150, samples });
        render(<LineChart ref={ref} {...props} timeScale="10s"/>);
        act(() => {
            ref.current?.updateData();
            flushAnimationFrames();
        });
        const option = chartMock.instance.setOption.mock.calls[0][0] as {
            xAxis: {
                min: number;
                max: number;
            };
            series: Array<{
                data: Array<[
                    number,
                    number
                ]>;
            }>;
        };
        expect(option.xAxis.max - option.xAxis.min).toBe(10000);
        expect(option.series[0].data).toHaveLength(11);
        expect(getSeriesValues(option.series[0].data)[0]).toBe(109);
        expect(getSeriesValues(option.series[0].data).at(-1)).toBe(119);
    });
    it('keeps the x-axis at the full selected time window when data has not filled it yet', () => {
        const ref = createRef<LineChartRef>();
        const props = createLineChartProps({
            samples: [
                { windSpeed: 1.2, windDirection: 42, temperature: 24.5, soundSpeed: 344.2, timestamp: '12:34:56' },
                { windSpeed: 2.4, windDirection: 315, temperature: 25.1, soundSpeed: 344.8, timestamp: '12:34:57' }
            ],
        });
        render(<LineChart ref={ref} {...props} timeScale="10s"/>);
        act(() => {
            ref.current?.updateData();
            flushAnimationFrames();
        });
        const option = chartMock.instance.setOption.mock.calls[0][0] as {
            xAxis: {
                min: number;
                max: number;
                axisLabel: {
                    formatter: (value: number) => string;
                };
            };
            series: Array<{
                data: Array<[
                    number,
                    number
                ]>;
            }>;
        };
        expect(option.xAxis.max - option.xAxis.min).toBe(10000);
        expect(option.xAxis.max).toBe(toLocalTimestampMs('12:34:57'));
        expect(option.xAxis.axisLabel.formatter(option.xAxis.min)).toBe('34:47');
        expect(option.xAxis.axisLabel.formatter(option.xAxis.max)).toBe('34:57');
        expect(getSeriesValues(option.series[0].data)).toEqual([1.2, 2.4]);
    });
    it('fills the whole 10s plot with all samples in the time window even above 10Hz', () => {
        const ref = createRef<LineChartRef>();
        const startMs = toLocalTimestampMs('12:35:00');
        const samples = Array.from({ length: 501 }, (_, index) => {
            void _;
            const timestampMs = startMs + index * 20;
            return {
                windSpeed: index,
                windDirection: index % 360,
                temperature: 20 + index / 100,
                soundSpeed: 340 + index / 100,
                timestamp: formatTimestampLabel(timestampMs),
                timestampMs,
            };
        });
        const props = createLineChartProps({ capacity: 600, samples });
        render(<LineChart ref={ref} {...props} timeScale="10s"/>);
        act(() => {
            ref.current?.updateData();
            flushAnimationFrames();
        });
        const option = chartMock.instance.setOption.mock.calls[0][0] as {
            xAxis: {
                min: number;
                max: number;
            };
            series: Array<{
                data: Array<[
                    number,
                    number
                ]>;
            }>;
        };
        expect(option.xAxis.max - option.xAxis.min).toBe(10000);
        expect(option.series[0].data).toHaveLength(501);
        expect(option.series[0].data[0][0]).toBe(option.xAxis.min);
        expect(option.series[0].data.at(-1)?.[0]).toBe(option.xAxis.max);
        expect(getSeriesValues(option.series[0].data)[0]).toBe(0);
        expect(getSeriesValues(option.series[0].data).at(-1)).toBe(500);
    });
    it('renders A/B direction wind speed series on the wind speed chart', () => {
        const ref = createRef<LineChartRef>();
        const props = createLineChartProps({
            samples: [
                {
                    windSpeed: 2.4,
                    windSpeedA: 1.1,
                    windSpeedB: 2.13,
                    windDirection: 42,
                    temperature: 24.5,
                    soundSpeed: 344.2,
                    timestamp: '12:34:56',
                },
                {
                    windSpeed: 3.2,
                    windSpeedA: -0.5,
                    windSpeedB: 3.16,
                    windDirection: 315,
                    temperature: 25.1,
                    soundSpeed: 344.8,
                    timestamp: '12:34:57',
                }
            ],
        });
        render(<LineChart ref={ref} {...props}/>);
        act(() => {
            ref.current?.updateData();
            flushAnimationFrames();
        });
        const option = chartMock.instance.setOption.mock.calls[0][0] as {
            series: Array<{
                name: string;
                data: Array<[
                    number,
                    number
                ]>;
            }>;
        };
        expect(option.series.map((series) => series.name).slice(0, 3)).toEqual(['風速', 'A方向', 'B方向']);
        expect(getSeriesValues(option.series[1].data)).toEqual([1.1, -0.5]);
        expect(getSeriesValues(option.series[2].data)).toEqual([2.13, 3.16]);
    });
    it.each([
        ['10s', 10000, 101],
        ['1m', 60000, 601],
        ['10m', 600000, 6001]
    ] as const)('applies the 10Hz time-window contract to the %s axis', (timeScale, windowMs, expectedPoints) => {
        const ref = createRef<LineChartRef>();
        const startMs = toLocalTimestampMs('12:40:00');
        const samples = Array.from({ length: expectedPoints }, (_, index) => {
            void _;
            const timestampMs = startMs + index * 100;
            return {
                windSpeed: index,
                windDirection: index % 360,
                temperature: 20 + index / 100,
                soundSpeed: 340 + index / 100,
                timestamp: formatTimestampLabel(timestampMs),
                timestampMs,
            };
        });
        const props = createLineChartProps({ capacity: expectedPoints, samples });
        render(<LineChart ref={ref} {...props} timeScale={timeScale}/>);
        act(() => {
            ref.current?.updateData();
            flushAnimationFrames();
        });
        const option = chartMock.instance.setOption.mock.calls[0][0] as {
            xAxis: {
                min: number;
                max: number;
            };
            series: Array<{
                data: Array<[
                    number,
                    number
                ]>;
            }>;
        };
        expect(option.xAxis.max - option.xAxis.min).toBe(windowMs);
        expect(option.series[0].data).toHaveLength(expectedPoints);
        expect(option.series[0].data[0][0]).toBe(option.xAxis.min);
        expect(option.series[0].data.at(-1)?.[0]).toBe(option.xAxis.max);
    });
    it('recomputes product automatic scale from live wind speed without a secondary axis', () => {
        const ref = createRef<LineChartRef>();
        const props = createLineChartProps({ samples: [
                { windSpeed: 1, windDirection: 42, temperature: 24.5, soundSpeed: 344.2, timestamp: '12:34:56' },
                { windSpeed: 5, windDirection: 45, temperature: 25.1, soundSpeed: 344.8, timestamp: '12:34:57' }
            ] });
        render(<LineChart ref={ref} {...props} chartScaleMode="auto"/>);
        act(() => { ref.current?.updateData(); flushAnimationFrames(); });
        const option = chartMock.instance.setOption.mock.calls[0][0] as {
            yAxis: {
                min: number;
                max: number;
            } | Array<{
                min: number;
                max: number;
            }>;
        };
        expect(Array.isArray(option.yAxis) ? option.yAxis.length : 1).toBe(1);
        expect(getPrimaryYAxis(option.yAxis)).toMatchObject({ min: 0.6, max: 5.4 });
    });
    it('builds automatic scale from the selected time window without latest-point truncation', () => {
        const ref = createRef<LineChartRef>();
        const samples = Array.from({ length: 120 }, (_, index) => {
            void _;
            return ({
                windSpeed: index - 60,
                windDirection: index % 360,
                temperature: 20 + index / 10,
                soundSpeed: 340 + index / 10,
                timestamp: `12:${Math.floor(index / 60)}:${index % 60}`,
            });
        });
        const props = createLineChartProps({ capacity: 150, samples });
        const getLatestSpy = vi.spyOn(props.windSpeedBufferRef.current, 'getLatest');
        const getLatestWithStatsSpy = vi.spyOn(props.windSpeedBufferRef.current, 'getLatestWithStats');
        render(<LineChart ref={ref} {...props} chartScaleMode="auto" timeScale="10s"/>);
        act(() => {
            ref.current?.updateData();
            flushAnimationFrames();
        });
        expect(getLatestSpy).not.toHaveBeenCalled();
        expect(getLatestWithStatsSpy).not.toHaveBeenCalled();
        const option = chartMock.instance.setOption.mock.calls[0][0] as {
            yAxis: Array<{
                min: number;
                max: number;
            }>;
            series: Array<{
                data: Array<[
                    number,
                    number
                ]>;
            }>;
        };
        const primaryYAxis = getPrimaryYAxis(option.yAxis);
        expect(option.series[0].data).toHaveLength(11);
        expect(getSeriesValues(option.series[0].data)[0]).toBe(49);
        expect(getSeriesValues(option.series[0].data).at(-1)).toBe(59);
        expect(primaryYAxis.min).toBe(48);
        expect(primaryYAxis.max).toBe(60);
    });
    it('updates chart colors and axis text when the theme changes', () => {
        const ref = createRef<LineChartRef>();
        const props = createLineChartProps();
        const { rerender } = render(<LineChart ref={ref} {...props} themeIndex={DEFAULT_ULSA_THEME_INDEX}/>);
        rerender(<LineChart ref={ref} {...props} themeIndex={7}/>);
        act(() => {
            ref.current?.updateData();
            flushAnimationFrames();
        });
        const option = chartMock.instance.setOption.mock.calls[0][0] as {
            xAxis: {
                axisLabel: {
                    color: string;
                };
                axisLine: {
                    lineStyle: {
                        color: string;
                    };
                };
                splitLine: {
                    lineStyle: {
                        color: string;
                    };
                };
            };
            yAxis: Array<{
                axisLine: {
                    lineStyle: {
                        color: string;
                    };
                };
                splitLine: {
                    lineStyle: {
                        color: string;
                    };
                };
                nameTextStyle: {
                    color: string;
                };
            }>;
            series: Array<{
                lineStyle: {
                    color: string;
                };
            }>;
            tooltip: {
                backgroundColor: string;
                textStyle: {
                    color: string;
                };
            };
        };
        const primaryYAxis = getPrimaryYAxis(option.yAxis);
        expect(option.series[0].lineStyle.color).toBe('#3B82F6');
        expect(option.xAxis.axisLabel.color).toBe('rgba(28, 56, 68, 0.68)');
        expect(option.xAxis.axisLine.lineStyle.color).toBe('rgba(38, 69, 81, 0.16)');
        expect(option.xAxis.splitLine.lineStyle.color).toBe('rgba(38, 69, 81, 0.07)');
        expect(primaryYAxis.axisLine.lineStyle.color).toBe('rgba(38, 69, 81, 0.16)');
        expect(primaryYAxis.splitLine.lineStyle.color).toBe('rgba(38, 69, 81, 0.07)');
        expect(primaryYAxis.nameTextStyle.color).toBe('rgba(28, 56, 68, 0.68)');
        expect(option.tooltip.backgroundColor).toBe('rgba(255, 255, 255, 0.96)');
        expect(option.tooltip.textStyle.color).toBe('rgba(18, 38, 48, 0.88)');
    });
    it('reserves a stable left gutter for the y-axis title at phone widths', () => {
        vi.stubGlobal('innerWidth', 390);
        const ref = createRef<LineChartRef>();
        render(<LineChart ref={ref} {...createLineChartProps()}/>);
        act(() => {
            ref.current?.updateData();
            flushAnimationFrames();
        });
        const option = chartMock.instance.setOption.mock.calls[0][0] as {
            grid: {
                left: number;
                containLabel: boolean;
            };
            yAxis: Array<{
                name: string;
                nameRotate: number;
                nameGap: number;
                axisLabel: {
                    color: string;
                };
            }>;
        };
        const primaryYAxis = getPrimaryYAxis(option.yAxis);
        expect(option.grid.left).toBe(34);
        expect(option.grid.containLabel).toBe(true);
        expect(primaryYAxis).toMatchObject({
            name: '風速 (m/s)',
            nameRotate: 90,
            nameGap: 40,
            axisLabel: { color: 'rgba(28, 56, 68, 0.68)' },
        });
    });
    it('defers LineChart updates while inactive and flushes once when active', () => {
        const ref = createRef<LineChartRef>();
        const { rerender } = render(<LineChart ref={ref} {...createLineChartProps()} isActive={false}/>);
        act(() => {
            ref.current?.updateData();
            flushAnimationFrames();
        });
        expect(chartMock.instance.setOption).not.toHaveBeenCalled();
        rerender(<LineChart ref={ref} {...createLineChartProps()} isActive/>);
        act(() => {
            flushAnimationFrames();
        });
        expect(chartMock.instance.setOption).toHaveBeenCalledTimes(1);
    });
    it('formats x-axis timestamps as hh:mm:ss', () => {
        expect(formatXAxisTimestamp('12:34:56')).toBe('12:34:56');
        expect(formatXAxisTimestamp('1:02:03')).toBe('01:02:03');
        expect(formatXAxisTimestamp('34:56')).toBe('00:34:56');
        expect(formatXAxisTimestamp('')).toBe('00:00:00');
        expect(formatXAxisTimestampMs(toLocalTimestampMs('1:02:03'))).toBe('01:02:03');
        expect(formatCompactXAxisTimestampMs(toLocalTimestampMs('1:02:03'))).toBe('02:03');
    });
    it('keeps sub-unit y-axis tick labels distinct at a 0.3 upper bound', () => {
        expect([0, 0.1, 0.2, 0.3].map((value) => (formatYAxisLabel(value, 0, 0.3, 3)))).toEqual(['0.0', '0.1', '0.2', '0.3']);
    });
    it('uses full time on wide charts and compact time on narrow charts', () => {
        const wideLayout = getXAxisLabelLayout(8, 900, 14);
        expect(wideLayout.rotate).toBe(0);
        expect(wideLayout.align).toBe('center');
        expect(wideLayout.gridBottom).toBe('8px');
        expect(wideLayout.timeLabelFormat).toBe('full');
        const narrowLayout = getXAxisLabelLayout(8, 320, 14);
        expect(narrowLayout.rotate).toBe(0);
        expect(narrowLayout.align).toBe('center');
        expect(narrowLayout.gridBottom).toBe('8px');
        expect(narrowLayout.splitNumber).toBeLessThanOrEqual(5);
        expect(narrowLayout.timeLabelFormat).toBe('compact');
    });
    it('keeps compact mm:ss x-axis labels horizontal at every chart width', () => {
        vi.stubGlobal('innerWidth', 1200);
        render(<LineChart {...createLineChartProps()} timeScale="10s"/>);
        const option = chartMock.renderProps.at(-1)?.option as {
            xAxis: {
                splitNumber: number;
                axisLabel: {
                    rotate: number;
                    formatter: (value: number) => string;
                };
            };
        };
        expect(option.xAxis.axisLabel.rotate).toBe(0);
        expect(option.xAxis.splitNumber).toBeLessThanOrEqual(5);
        expect(option.xAxis.axisLabel.formatter(toLocalTimestampMs('12:34:56'))).toBe('34:56');
    });
    it('preserves full hh:mm:ss labels for wider non-10s windows', () => {
        vi.stubGlobal('innerWidth', 1200);
        render(<LineChart {...createLineChartProps()} timeScale="1m"/>);
        const option = chartMock.renderProps.at(-1)?.option as {
            xAxis: {
                axisLabel: {
                    formatter: (value: number) => string;
                };
            };
        };
        expect(option.xAxis.axisLabel.formatter(toLocalTimestampMs('12:34:56'))).toBe('12:34:56');
    });
});
