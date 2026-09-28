import { useRef, forwardRef, useImperativeHandle, useCallback, useMemo, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import type { NumericRingBuffer, RingBuffer } from '../../utils/RingBuffer';
import { DEFAULT_ULSA_THEME_INDEX, themes } from '../../constants/themes';
import { formatCompactXAxisTimestampMs, formatXAxisTimestampMs, getXAxisLabelLayout, } from './lineChartAxis';
import { measurePerfEvent, recordPerfEvent } from '../../utils/renderPerfDiagnostics';
import { getWindowedChartData, getWindowedDataBounds, getTemperatureWindowedSeries, getWindSpeedWindowedSeries, } from './lineChartData';
import { DEFAULT_WIND_SPEED_SERIES_VISIBILITY, type WindSpeedSeriesVisibility, } from './windSpeedSeries';
import { DEFAULT_TEMPERATURE_SERIES_VISIBILITY, type TemperatureSeriesVisibility, } from './temperatureSeries';
import { buildTemperatureChartSeries, buildWindSpeedChartSeries } from './lineChartSeriesOptions';
import { BASE_GRID_OPTION, cancelChartFrame, CHART_CONFIGS, formatYAxisLabel, formatYAxisTitle, requestChartFrame, TIME_SCALE_MS, type ScheduledChartFrame, } from './lineChartConfig';
import { buildLineChartAccessibilitySummary, buildLineChartTooltipHtml } from './lineChartAccessibility';
export type ChartType = 'windSpeed' | 'windDirection' | 'temperature' | 'soundSpeed';
export type TimeScale = '10s' | '1m' | '10m';
export type ChartScaleMode = 'auto' | 'fixed' | number;
interface LineChartProps {
    isActive?: boolean;
    selectedChart: ChartType;
    timeScale: TimeScale;
    chartScaleMode: ChartScaleMode;
    windSpeedSeriesVisibility?: WindSpeedSeriesVisibility;
    temperatureSeriesVisibility?: TemperatureSeriesVisibility;
    windSpeedBufferRef: React.MutableRefObject<NumericRingBuffer>;
    windSpeedABufferRef: React.MutableRefObject<NumericRingBuffer>;
    windSpeedBBufferRef: React.MutableRefObject<NumericRingBuffer>;
    windDirectionBufferRef: React.MutableRefObject<NumericRingBuffer>;
    temperatureBufferRef: React.MutableRefObject<NumericRingBuffer>;
    soundSpeedBufferRef: React.MutableRefObject<NumericRingBuffer>;
    timestampBufferRef: React.MutableRefObject<RingBuffer<string>>;
    timestampMsBufferRef: React.MutableRefObject<RingBuffer<number>>;
    lastDebugLogTime: React.MutableRefObject<number>;
    themeIndex?: number;
}
export interface LineChartRef {
    resize: (size?: {
        width: number;
        height: number;
    }) => void;
    dispose: () => void;
    updateData: () => void;
}
const CHART_DEBUG = import.meta.env.DEV && import.meta.env.VITE_CHART_DEBUG === '1';
const LineChart = forwardRef<LineChartRef, LineChartProps>(({ isActive = true, selectedChart, timeScale, chartScaleMode, windSpeedSeriesVisibility = DEFAULT_WIND_SPEED_SERIES_VISIBILITY, temperatureSeriesVisibility = DEFAULT_TEMPERATURE_SERIES_VISIBILITY, windSpeedBufferRef, windSpeedABufferRef, windSpeedBBufferRef, windDirectionBufferRef, temperatureBufferRef, soundSpeedBufferRef, timestampBufferRef, timestampMsBufferRef, lastDebugLogTime, themeIndex = DEFAULT_ULSA_THEME_INDEX }, ref) => {
    recordPerfEvent('LineChart.render');
    const chartRef = useRef<ReactECharts | null>(null);
    const isActiveRef = useRef(isActive);
    const disposedRef = useRef(false);
    const pendingFrameRef = useRef<ScheduledChartFrame | null>(null);
    const hasPendingDataRef = useRef(false);
    const currentTheme = themes[themeIndex] || themes[DEFAULT_ULSA_THEME_INDEX];
    const textColor = currentTheme.isLight ? 'rgba(18, 38, 48, 0.88)' : 'rgba(242, 248, 249, 0.94)';
    const axisTextColor = currentTheme.isLight
        ? 'rgba(28, 56, 68, 0.68)'
        : 'rgba(224, 237, 241, 0.68)';
    const axisLineColor = currentTheme.isLight
        ? 'rgba(38, 69, 81, 0.16)'
        : 'rgba(219, 235, 239, 0.20)';
    const splitLineColor = currentTheme.isLight
        ? 'rgba(38, 69, 81, 0.07)'
        : 'rgba(219, 235, 239, 0.09)';
    const chartConfig = CHART_CONFIGS[selectedChart];
    const { name, unit, fixedMin, fixedMax } = chartConfig;
    const color = useMemo(() => {
        const themeChartColors: Record<ChartType, string> = {
            windSpeed: currentTheme.gaugeColors.windSpeed.color,
            windDirection: currentTheme.gaugeColors.windDirection,
            temperature: currentTheme.gaugeColors.temperature.color,
            soundSpeed: currentTheme.gaugeColors.soundSpeed.color,
        };
        return themeChartColors[selectedChart];
    }, [currentTheme, selectedChart]);
    const baseXAxisOption = useMemo(() => ({
        type: 'value',
        boundaryGap: false,
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
    }), [axisLineColor, splitLineColor]);
    const baseXAxisLabelOption = useMemo(() => ({
        color: axisTextColor,
        hideOverlap: true,
    }), [axisTextColor]);
    const baseYAxisOption = useMemo(() => ({
        type: 'value',
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
        splitNumber: 5,
    }), [axisLineColor, splitLineColor]);
    const baseYAxisLabelOption = useMemo(() => ({
        color: axisTextColor,
    }), [axisTextColor]);
    const displayTimestampsRef = useRef<string[]>([]);
    const currentUnitRef = useRef<string>('');
    const lastDisplayDataRef = useRef<Array<[
        number,
        number
    ]>>([]);
    const baseSeriesOption = useMemo(() => ({
        name,
        type: 'line',
        smooth: true,
        symbol: 'none',
        sampling: 'lttb',
        lineStyle: { color, width: 2 },
        areaStyle: {
            color: {
                type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                    { offset: 0, color: color + '80' },
                    { offset: 1, color: color + '10' }
                ]
            }
        }
    }), [color, name]);
    const baseTooltipTextStyle = useMemo(() => ({
        color: textColor,
    }), [textColor]);
    const baseTooltipOption = useMemo(() => ({
        trigger: 'axis',
        backgroundColor: currentTheme.isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(4, 14, 21, 0.96)',
        borderColor: color,
        borderWidth: 2,
        axisPointer: {
            type: 'line',
            lineStyle: { color, width: 2, type: 'solid' },
            label: { backgroundColor: color }
        },
        formatter: (params: import('./lineChartData').TooltipParam[]) => buildLineChartTooltipHtml({
            params,
            selectedChart,
            timestamps: displayTimestampsRef.current,
            unit: currentUnitRef.current,
        }),
        confine: true,
        triggerOn: 'mousemove|click',
        alwaysShowContent: false,
        showDelay: 0,
        hideDelay: 0,
        enterable: false,
        transitionDuration: 0
    }), [color, currentTheme.isLight, selectedChart]);
    const getCurrentBuffer = useCallback(() => {
        switch (selectedChart) {
            case 'windSpeed': return windSpeedBufferRef.current;
            case 'windDirection': return windDirectionBufferRef.current;
            case 'temperature': return temperatureBufferRef.current;
            case 'soundSpeed': return soundSpeedBufferRef.current;
        }
    }, [selectedChart, windSpeedBufferRef, windDirectionBufferRef, temperatureBufferRef, soundSpeedBufferRef]);
    const getChartOption = useCallback(() => {
        const currentBuffer = getCurrentBuffer();
        const timestampBuffer = timestampBufferRef.current;
        const timestampMsBuffer = timestampMsBufferRef.current;
        const timeWindowMs = TIME_SCALE_MS[timeScale];
        const windowedData = getWindowedChartData(currentBuffer, timestampBuffer, timestampMsBuffer, timeWindowMs);
        const windSpeedWindowedSeries = selectedChart === 'windSpeed'
            ? getWindSpeedWindowedSeries({
                baseWindowedData: windowedData,
                color,
                timeWindowMs,
                timestampBuffer,
                timestampMsBuffer,
                visibility: windSpeedSeriesVisibility,
                windSpeedBuffer: windSpeedBufferRef.current,
                windSpeedABuffer: windSpeedABufferRef.current,
                windSpeedBBuffer: windSpeedBBufferRef.current,
            })
            : [];
        const temperatureWindowedSeries = selectedChart === 'temperature'
            ? getTemperatureWindowedSeries({
                baseWindowedData: windowedData,
                color,
                timeWindowMs,
                timestampBuffer,
                timestampMsBuffer,
                visibility: temperatureSeriesVisibility,
                temperatureBuffer: temperatureBufferRef.current,
            })
            : [];
        lastDisplayDataRef.current = windowedData.data;
        displayTimestampsRef.current = windowedData.timestamps;
        currentUnitRef.current = unit;
        const now = Date.now();
        if (CHART_DEBUG && now - lastDebugLogTime.current > 3000) {
            lastDebugLogTime.current = now;
            console.log('=== Chart Debug ===', timeScale, 'points:', windowedData.data.length, 'windowMs:', timeWindowMs);
        }
        let yMin: number;
        let yMax: number;
        const visibleBounds = selectedChart === 'windSpeed'
            ? getWindowedDataBounds(windSpeedWindowedSeries
                .filter((series) => series.visible)
                .map((series) => series.windowedData))
            : selectedChart === 'temperature'
                ? getWindowedDataBounds(temperatureWindowedSeries
                    .filter((series) => series.visible)
                    .map((series) => series.windowedData))
                : (windowedData.data.length > 0 ? { min: windowedData.min, max: windowedData.max } : null);
        if (chartScaleMode === 'auto' && visibleBounds) {
            const range = visibleBounds.max - visibleBounds.min;
            const margin = range === 0 ? 1 : range * 0.1;
            yMin = Math.floor((visibleBounds.min - margin) * 10) / 10;
            yMax = Math.ceil((visibleBounds.max + margin) * 10) / 10;
        }
        else if (typeof chartScaleMode === 'number') {
            yMin = fixedMin;
            yMax = chartScaleMode;
        }
        else {
            yMin = fixedMin;
            yMax = fixedMax;
        }
        const isSmallScreen = window.innerWidth < 480;
        const axisFontSize = isSmallScreen ? 11 : 14;
        const yAxisNameGap = isSmallScreen ? 40 : 50;
        const chartWidth = chartRef.current?.getEchartsInstance()?.getWidth?.() ?? window.innerWidth;
        const gridLeft = Math.max(34, Math.round(chartWidth * 0.02) + 24);
        const estimatedLabelCount = Math.min(8, Math.max(2, Math.ceil(timeWindowMs / 1000) + 1));
        const xAxisLabelLayout = getXAxisLabelLayout(estimatedLabelCount, chartWidth, axisFontSize);
        const xAxisTimeLabelFormat = timeScale === '10s'
            ? 'compact'
            : xAxisLabelLayout.timeLabelFormat;
        const xAxisSplitNumber = timeScale === '10s'
            ? Math.min(xAxisLabelLayout.splitNumber, 5)
            : xAxisLabelLayout.splitNumber;
        const yAxisSplitNumber = yMin === 0 && yMax === 0.3 ? 3 : 5;
        const primaryYAxisName = formatYAxisTitle(name, unit);
        const primaryYAxisTitleOption = {
            name: primaryYAxisName,
            nameLocation: 'middle' as const,
            nameRotate: 90,
            nameGap: yAxisNameGap,
            nameTextStyle: {
                color: axisTextColor,
                fontSize: axisFontSize,
                fontWeight: 600,
                align: 'center' as const,
            },
        };
        const windSpeedSeries = buildWindSpeedChartSeries(windSpeedWindowedSeries, baseSeriesOption);
        const temperatureSeries = buildTemperatureChartSeries(temperatureWindowedSeries, baseSeriesOption);
        const primarySeries = selectedChart === 'windSpeed'
            ? windSpeedSeries
            : selectedChart === 'temperature'
                ? temperatureSeries
                : [{
                        ...baseSeriesOption,
                        yAxisIndex: 0,
                        data: lastDisplayDataRef.current,
                    }];
        return {
            backgroundColor: 'transparent',
            aria: {
                enabled: true,
                decal: { show: false },
                label: {
                    enabled: true,
                    description: buildLineChartAccessibilitySummary({
                        name,
                        unit,
                        timeScale,
                        data: windowedData.data,
                    }),
                },
            },
            grid: {
                ...BASE_GRID_OPTION,
                left: gridLeft,
                right: BASE_GRID_OPTION.right,
                bottom: xAxisLabelLayout.gridBottom,
            },
            xAxis: {
                ...baseXAxisOption,
                min: windowedData.xAxisMin,
                max: windowedData.xAxisMax,
                splitNumber: xAxisSplitNumber,
                axisLabel: {
                    ...baseXAxisLabelOption,
                    fontSize: axisFontSize,
                    rotate: xAxisLabelLayout.rotate,
                    margin: xAxisLabelLayout.margin,
                    align: xAxisLabelLayout.align,
                    verticalAlign: xAxisLabelLayout.verticalAlign,
                    formatter: (value: number) => xAxisTimeLabelFormat === 'full'
                        ? formatXAxisTimestampMs(value)
                        : formatCompactXAxisTimestampMs(value),
                }
            },
            yAxis: {
                ...baseYAxisOption,
                ...primaryYAxisTitleOption,
                min: yMin,
                max: yMax,
                splitNumber: yAxisSplitNumber,
                axisLabel: {
                    ...baseYAxisLabelOption,
                    fontSize: axisFontSize,
                    formatter: (value: number) => formatYAxisLabel(value, yMin, yMax, yAxisSplitNumber),
                },
            },
            series: [
                ...primarySeries
            ],
            tooltip: {
                ...baseTooltipOption,
                textStyle: { ...baseTooltipTextStyle, fontSize: axisFontSize },
            },
            animation: false
        };
    }, [
        baseSeriesOption,
        baseTooltipOption,
        baseTooltipTextStyle,
        baseXAxisLabelOption,
        baseXAxisOption,
        baseYAxisLabelOption,
        baseYAxisOption,
        axisTextColor,
        chartScaleMode,
        color,
        fixedMax,
        fixedMin,
        getCurrentBuffer,
        lastDebugLogTime,
        name,
        temperatureBufferRef,
        temperatureSeriesVisibility,
        windSpeedSeriesVisibility,
        windSpeedABufferRef,
        windSpeedBBufferRef,
        windSpeedBufferRef,
        selectedChart,
        timeScale,
        timestampMsBufferRef,
        timestampBufferRef,
        unit
    ]);
    const clearPendingFrame = useCallback(() => {
        if (!pendingFrameRef.current)
            return;
        cancelChartFrame(pendingFrameRef.current);
        pendingFrameRef.current = null;
    }, []);
    const disposeChartInstance = useCallback((chart: ReactECharts | null = chartRef.current) => {
        clearPendingFrame();
        hasPendingDataRef.current = false;
        if (disposedRef.current) {
            return;
        }
        disposedRef.current = true;
        try {
            const instance = chart?.getEchartsInstance();
            if (instance && !instance.isDisposed()) {
                instance.clear();
                instance.dispose();
            }
        }
        catch { /* Optional cleanup may already have completed. */ }
    }, [clearPendingFrame]);
    const applyChartUpdate = useCallback(() => {
        pendingFrameRef.current = null;
        if (!isActiveRef.current || disposedRef.current) {
            hasPendingDataRef.current = true;
            return;
        }
        const instance = chartRef.current?.getEchartsInstance();
        if (!instance || instance.isDisposed()) {
            hasPendingDataRef.current = true;
            return;
        }
        try {
            const option = measurePerfEvent('LineChart.getChartOption', getChartOption);
            measurePerfEvent('LineChart.setOption', () => {
                instance.setOption(option, {
                    notMerge: false,
                });
            });
            hasPendingDataRef.current = false;
        }
        catch (e) {
            console.warn('Chart update skipped:', e);
        }
    }, [getChartOption]);
    const scheduleChartUpdate = useCallback(() => {
        recordPerfEvent('LineChart.updateData');
        hasPendingDataRef.current = true;
        if (!isActiveRef.current || disposedRef.current || pendingFrameRef.current) {
            return;
        }
        pendingFrameRef.current = requestChartFrame(applyChartUpdate);
    }, [applyChartUpdate]);
    useEffect(() => {
        isActiveRef.current = isActive;
        if (isActive && hasPendingDataRef.current && !pendingFrameRef.current) {
            pendingFrameRef.current = requestChartFrame(applyChartUpdate);
        }
    }, [applyChartUpdate, isActive]);
    useImperativeHandle(ref, () => ({
        resize: (size) => {
            if (disposedRef.current)
                return;
            chartRef.current?.getEchartsInstance()?.resize(size);
        },
        dispose: () => {
            disposeChartInstance();
        },
        updateData: () => {
            scheduleChartUpdate();
        }
    }), [disposeChartInstance, scheduleChartUpdate]);
    useEffect(() => {
        disposedRef.current = false;
        const chart = chartRef.current;
        return () => {
            disposeChartInstance(chart);
        };
    }, [disposeChartInstance]);
    const initialChartOption = useMemo(() => measurePerfEvent('LineChart.getChartOption.initial', getChartOption), [getChartOption]);
    return (<ReactECharts ref={chartRef} className="line-chart-surface" option={initialChartOption} style={{ height: '100%', width: '100%', flex: '1 1 auto', minHeight: 0 }} notMerge={true} lazyUpdate={false} opts={{ renderer: 'canvas' }}/>);
});
export default LineChart;
