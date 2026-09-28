import { act, renderHook } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSensorData, type SensorDataSource } from './useSensorData';
import type { SensorData } from '../types/ble';
import type { LineChartRef } from '../components/charts';
import type { SensorDisplayUpdate } from './ble/types';
const toDisplayUpdate = (sample: SensorData): SensorDisplayUpdate => ({
    latestSample: sample,
    standardFieldReceivedAt: {
        windDirection: sample.timestamp,
        windSpeed: sample.timestamp,
        temperature: sample.timestamp,
    },
    lastStandardReceivedAt: sample.timestamp,
});
const createLineChartRef = () => ({
    current: {
        resize: vi.fn(),
        dispose: vi.fn(),
        updateData: vi.fn(),
    } satisfies LineChartRef,
});
type SensorHookProps = {
    dataSource: SensorDataSource;
    bleSensorData: SensorData | null;
    bleTimelineSensorData?: SensorData | null;
};
const renderSensorHook = (dataSource: SensorDataSource, bleSensorData: SensorData | null = null, bleTimelineSensorData: SensorData | null = bleSensorData) => {
    const lineChartRef = createLineChartRef();
    let latestDisplaySample = bleSensorData ? toDisplayUpdate(bleSensorData) : null;
    const displayListeners = new Set<(update: SensorDisplayUpdate) => void>();
    const timelineListeners = new Set<(sample: SensorData) => void>();
    const subscribeDisplaySamples = (listener: (update: SensorDisplayUpdate) => void) => {
        displayListeners.add(listener);
        if (latestDisplaySample)
            listener(latestDisplaySample);
        return () => displayListeners.delete(listener);
    };
    const subscribeTimelineSamples = (listener: (sample: SensorData) => void) => {
        timelineListeners.add(listener);
        return () => timelineListeners.delete(listener);
    };
    const hook = renderHook((props: SensorHookProps) => {
        const result = useSensorData({
            dataSource: props.dataSource,
            subscribeDisplaySamples,
            subscribeTimelineSamples,
            lineChartRef,
        });
        useLayoutEffect(() => {
            const timelineSample = props.bleTimelineSensorData === undefined
                ? props.bleSensorData
                : props.bleTimelineSensorData;
            if (timelineSample)
                timelineListeners.forEach((listener) => listener(timelineSample));
            latestDisplaySample = props.bleSensorData ? toDisplayUpdate(props.bleSensorData) : null;
            if (latestDisplaySample)
                displayListeners.forEach((listener) => listener(latestDisplaySample!));
        }, [props.bleSensorData, props.bleTimelineSensorData]);
        return result;
    }, { initialProps: { dataSource, bleSensorData, bleTimelineSensorData } as SensorHookProps });
    return { ...hook, lineChartRef };
};
const renderSensorHookWithRenderCount = (dataSource: SensorDataSource, bleSensorData: SensorData | null = null, bleTimelineSensorData: SensorData | null = bleSensorData) => {
    const lineChartRef = createLineChartRef();
    let latestDisplaySample = bleSensorData ? toDisplayUpdate(bleSensorData) : null;
    const displayListeners = new Set<(update: SensorDisplayUpdate) => void>();
    const timelineListeners = new Set<(sample: SensorData) => void>();
    const subscribeDisplaySamples = (listener: (update: SensorDisplayUpdate) => void) => {
        displayListeners.add(listener);
        if (latestDisplaySample)
            listener(latestDisplaySample);
        return () => displayListeners.delete(listener);
    };
    const subscribeTimelineSamples = (listener: (sample: SensorData) => void) => {
        timelineListeners.add(listener);
        return () => timelineListeners.delete(listener);
    };
    let renderCount = 0;
    const hook = renderHook((props: SensorHookProps) => {
        renderCount += 1;
        const result = useSensorData({
            dataSource: props.dataSource,
            subscribeDisplaySamples,
            subscribeTimelineSamples,
            lineChartRef,
        });
        useLayoutEffect(() => {
            const timelineSample = props.bleTimelineSensorData === undefined
                ? props.bleSensorData
                : props.bleTimelineSensorData;
            if (timelineSample)
                timelineListeners.forEach((listener) => listener(timelineSample));
            latestDisplaySample = props.bleSensorData ? toDisplayUpdate(props.bleSensorData) : null;
            if (latestDisplaySample)
                displayListeners.forEach((listener) => listener(latestDisplaySample!));
        }, [props.bleSensorData, props.bleTimelineSensorData]);
        return result;
    }, { initialProps: { dataSource, bleSensorData, bleTimelineSensorData } as SensorHookProps });
    return { ...hook, lineChartRef, getRenderCount: () => renderCount };
};
const createSample = (overrides: Partial<SensorData> = {}): SensorData => ({
    windSpeed: 1.23,
    windSpeedA: null,
    windSpeedB: null,
    windDirection: 42.1,
    temperature: 24.56,
    soundSpeed: 344.2,
    headingSpeed: 0,
    sensorStatus: 0,
    timestamp: Date.now(),
    ...overrides,
});
describe('useSensorData', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });
    it('keeps readings empty when there is no live data', () => {
        const { result, lineChartRef } = renderSensorHook('empty');
        expect(result.current.values.windSpeed).toBeNull();
        expect(result.current.values.windSpeedAverage10m).toBeNull();
        expect(result.current.values.windDirection).toBeNull();
        expect(result.current.values.headingSpeed).toBeNull();
        expect(result.current.values.temperature).toBeNull();
        expect(result.current.values.soundSpeed).toBeNull();
        const updateCount = lineChartRef.current.updateData.mock.calls.length;
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current.values.windSpeed).toBeNull();
        expect(lineChartRef.current.updateData).toHaveBeenCalledTimes(updateCount);
    });
    it('keeps already-empty resets from redrawing the chart', () => {
        const { result, lineChartRef } = renderSensorHook('empty');
        expect(result.current.values.windSpeed).toBeNull();
        expect(result.current.bufferRefs.windSpeedBufferRef.current.length).toBe(0);
        expect(result.current.bufferRefs.timestampBufferRef.current.length).toBe(0);
        expect(lineChartRef.current.updateData).not.toHaveBeenCalled();
    });
    it('updates readings only from BLE samples in live mode', () => {
        const { result, rerender } = renderSensorHook('empty');
        const sample = createSample();
        rerender({ dataSource: 'live', bleSensorData: sample, bleTimelineSensorData: sample });
        expect(result.current.values.windSpeed).toBe(1.23);
        expect(result.current.values.windSpeedAverage10m).toBe(1.23);
        expect(result.current.values.windDirection).toBe(42);
        expect(result.current.values.headingSpeed).toBe(0);
        expect(result.current.values.temperature).toBe(24.6);
        expect(result.current.values.soundSpeed).toBe(344.2);
    });
    it('updates latest values for an invalid sample but excludes it from derived metrics', () => {
        const valid = createSample({
            sensorStatus: 1,
            statusProtocolVersion: 2,
            statusFlags: 0xc0,
            activeCause: 0,
        });
        const { result, rerender } = renderSensorHook('live', valid, valid);
        expect(result.current.values.windSpeed).toBe(1.23);
        const invalid = createSample({
            sensorStatus: 0,
            statusProtocolVersion: 2,
            statusFlags: 0x98,
            activeCause: 3,
        });
        rerender({ dataSource: 'live', bleSensorData: invalid, bleTimelineSensorData: invalid });
        expect(result.current.values.windSpeed).toBe(1.23);
        expect(result.current.values.windDirection).toBe(42);
        expect(result.current.values.temperature).toBe(24.6);
        expect(result.current.values.windSpeedAverage10m).toBeNull();
        expect(result.current.bufferRefs.windSpeedBufferRef.current.get(1)).toBe(1.23);
    });
    it('keeps LOWTEMP v3 samples usable while exposing the warning metadata', () => {
        const lowTemperature = createSample({
            sensorStatus: 1,
            statusProtocolVersion: 3,
            statusFlags: 0xc0,
            activeCause: 2,
        });
        const { result } = renderSensorHook('live', lowTemperature, lowTemperature);
        expect(result.current.values.windSpeed).toBe(1.23);
        expect(result.current.values.windSpeedAverage10m).toBe(1.23);
    });
    it('updates cards for every field event but appends chart history only for timeline samples', () => {
        const initial = createSample({ windSpeed: 1, temperature: 20 });
        const { result, rerender } = renderSensorHook('live', initial, null);
        expect(result.current.values.temperature).toBe(20);
        expect(result.current.bufferRefs.windSpeedBufferRef.current.length).toBe(0);
        const temperatureUpdate = createSample({ windSpeed: 1, temperature: 21 });
        rerender({
            dataSource: 'live',
            bleSensorData: temperatureUpdate,
            bleTimelineSensorData: null,
        });
        expect(result.current.values.temperature).toBe(21);
        expect(result.current.bufferRefs.windSpeedBufferRef.current.length).toBe(0);
        const windSpeedUpdate = createSample({ windSpeed: 2, temperature: 21 });
        rerender({
            dataSource: 'live',
            bleSensorData: windSpeedUpdate,
            bleTimelineSensorData: windSpeedUpdate,
        });
        expect(result.current.values.windSpeed).toBe(2);
        expect(result.current.bufferRefs.windSpeedBufferRef.current.length).toBe(1);
    });
    it('appends exactly one chart point for each of ten wind-speed timeline events', () => {
        const initial = createSample({ windSpeed: 0, timestamp: 1000 });
        const { result, rerender } = renderSensorHook('live', initial, null);
        for (let index = 1; index <= 10; index += 1) {
            const windSpeedEvent = createSample({
                windSpeed: index,
                windDirection: index * 10,
                timestamp: 1000 + index * 100,
            });
            rerender({
                dataSource: 'live',
                bleSensorData: windSpeedEvent,
                bleTimelineSensorData: windSpeedEvent,
            });
        }
        expect(result.current.bufferRefs.windSpeedBufferRef.current.length).toBe(10);
        expect(result.current.bufferRefs.timestampBufferRef.current.length).toBe(10);
        const diagnosticOnlyEvent = createSample({
            windSpeed: 10,
            timestamp: 2100,
        });
        rerender({
            dataSource: 'live',
            bleSensorData: diagnosticOnlyEvent,
            bleTimelineSensorData: null,
        });
        expect(result.current.bufferRefs.windSpeedBufferRef.current.length).toBe(10);
        expect(result.current.bufferRefs.timestampBufferRef.current.length).toBe(10);
    });
    it('buffers hidden timeline samples and redraws once when the document becomes visible', () => {
        let visibilityState: DocumentVisibilityState = 'hidden';
        const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get')
            .mockImplementation(() => visibilityState);
        const initial = createSample({ windSpeed: 1, timestamp: 1000 });
        const { result, rerender, lineChartRef } = renderSensorHook('live', initial, null);
        lineChartRef.current.updateData.mockClear();
        const hiddenSample = createSample({ windSpeed: 2, timestamp: 1100 });
        rerender({
            dataSource: 'live',
            bleSensorData: null,
            bleTimelineSensorData: hiddenSample,
        });
        expect(result.current.bufferRefs.windSpeedBufferRef.current.getLatest()).toEqual([2]);
        expect(lineChartRef.current.updateData).not.toHaveBeenCalled();
        visibilityState = 'visible';
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(lineChartRef.current.updateData).toHaveBeenCalledOnce();
        visibilitySpy.mockRestore();
    });
    it('keeps fields that have not been received out of the UI and averages', () => {
        const { result } = renderSensorHook('live', createSample({
            windSpeed: Number.NaN,
            windDirection: Number.NaN,
            headingSpeed: Number.NaN,
            soundSpeed: Number.NaN,
        }));
        expect(result.current.values.windSpeed).toBeNull();
        expect(result.current.values.windSpeedAverage10m).toBeNull();
        expect(result.current.values.windDirection).toBeNull();
        expect(result.current.values.headingSpeed).toBeNull();
        expect(result.current.values.temperature).toBe(24.6);
        expect(result.current.values.soundSpeed).toBeNull();
        expect(Number.isNaN(result.current.bufferRefs.windSpeedBufferRef.current.getLatest()[0])).toBe(true);
        expect(Number.isNaN(result.current.bufferRefs.windDirectionBufferRef.current.getLatest()[0])).toBe(true);
        expect(Number.isNaN(result.current.bufferRefs.soundSpeedBufferRef.current.getLatest()[0])).toBe(true);
    });
    it('unwraps wind direction continuously across the 0/360 degree boundary', () => {
        const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime();
        const { result, rerender } = renderSensorHook('live', createSample({ windDirection: 350.2, timestamp: baseTime }));
        expect(result.current.values.windDirection).toBe(350);
        expect(result.current.values.windDirectionContinuous).toBeCloseTo(-9.8, 8);
        rerender({
            dataSource: 'live',
            bleSensorData: createSample({ windDirection: 10.2, timestamp: baseTime + 1000 }),
        });
        expect(result.current.values.windDirection).toBe(10);
        expect(result.current.values.windDirectionContinuous).toBeCloseTo(10.2, 8);
        expect(result.current.bufferRefs.windDirectionBufferRef.current.getLatest()).toEqual([350, 10]);
        rerender({
            dataSource: 'live',
            bleSensorData: createSample({ windDirection: 350.2, timestamp: baseTime + 2000 }),
        });
        expect(result.current.values.windDirection).toBe(350);
        expect(result.current.values.windDirectionContinuous).toBeCloseTo(-9.8, 8);
        expect(result.current.bufferRefs.windDirectionBufferRef.current.getLatest()).toEqual([350, 10, 350]);
    });
    it('keeps live sample application to one chart update and one display state commit', () => {
        const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime();
        const { rerender, lineChartRef, getRenderCount } = renderSensorHookWithRenderCount('live', createSample({ timestamp: baseTime }));
        const renderCountAfterInitialSample = getRenderCount();
        const chartUpdateCountAfterInitialSample = lineChartRef.current.updateData.mock.calls.length;
        rerender({
            dataSource: 'live',
            bleSensorData: createSample({
                windSpeed: 2.34,
                windDirection: 50.2,
                temperature: 25.4,
                soundSpeed: 345.6,
                timestamp: baseTime + 1000,
            }),
        });
        expect(lineChartRef.current.updateData).toHaveBeenCalledTimes(chartUpdateCountAfterInitialSample + 1);
        expect(getRenderCount() - renderCountAfterInitialSample).toBe(2);
    });
    it('keeps buffer ref containers stable across live samples', () => {
        const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime();
        const { result, rerender } = renderSensorHook('live', createSample({ timestamp: baseTime }));
        const bufferRefsRef = result.current.bufferRefs;
        rerender({
            dataSource: 'live',
            bleSensorData: createSample({
                windSpeed: 2.34,
                windDirection: 50.2,
                temperature: 25.4,
                soundSpeed: 345.6,
                timestamp: baseTime + 1000,
            }),
        });
        expect(result.current.bufferRefs).toBe(bufferRefsRef);
        expect(result.current.bufferRefs.windSpeedBufferRef).toBe(bufferRefsRef.windSpeedBufferRef);
        expect(result.current.bufferRefs.referenceWindSpeedWindowRef)
            .toBe(bufferRefsRef.referenceWindSpeedWindowRef);
        expect(result.current.bufferRefs.referenceWindSpeedWindowRef?.current.getAverage(baseTime + 1000))
            .toBe(1.79);
        expect(result.current.bufferRefs.timestampBufferRef.current.length).toBe(2);
    });
    it('keeps duplicate display samples out of display state commits while preserving buffers', () => {
        const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime();
        const { result, rerender, lineChartRef, getRenderCount } = renderSensorHookWithRenderCount('live', createSample({ timestamp: baseTime }));
        const renderCountAfterInitialSample = getRenderCount();
        const chartUpdateCountAfterInitialSample = lineChartRef.current.updateData.mock.calls.length;
        rerender({
            dataSource: 'live',
            bleSensorData: createSample({ timestamp: baseTime + 1000 }),
        });
        expect(lineChartRef.current.updateData).toHaveBeenCalledTimes(chartUpdateCountAfterInitialSample + 1);
        expect(getRenderCount() - renderCountAfterInitialSample).toBe(1);
        expect(result.current.values.windSpeed).toBe(1.23);
        expect(result.current.values.windSpeedAverage10m).toBe(1.23);
        expect(result.current.bufferRefs.windSpeedBufferRef.current.getLatest()).toEqual([1.23, 1.23]);
        expect(result.current.bufferRefs.timestampBufferRef.current.length).toBe(2);
    });
    it('does not apply new BLE samples while stale', () => {
        const firstSample = createSample();
        const staleSample = createSample({
            windSpeed: 7.89,
            windDirection: 180,
            temperature: 31,
            soundSpeed: 350,
            timestamp: Date.now() + 1000,
        });
        const { result, rerender } = renderSensorHook('live', firstSample);
        expect(result.current.values.windSpeed).toBe(1.23);
        rerender({ dataSource: 'stale', bleSensorData: staleSample });
        expect(result.current.values.windSpeed).toBe(1.23);
        expect(result.current.values.windSpeedAverage10m).toBe(1.23);
        expect(result.current.values.windDirection).toBe(42);
        expect(result.current.values.headingSpeed).toBe(0);
        expect(result.current.values.temperature).toBe(24.6);
        expect(result.current.values.soundSpeed).toBe(344.2);
    });
    it('keeps every real timeline sample even while presentation is marked stale', () => {
        const firstSample = createSample();
        const staleSample = createSample({
            windSpeed: 7.89,
            windDirection: 180,
            temperature: 31,
            soundSpeed: 350,
            timestamp: Date.now() + 1000,
        });
        const { result, rerender, lineChartRef } = renderSensorHook('live', firstSample);
        const updateCountAfterLive = lineChartRef.current.updateData.mock.calls.length;
        expect(result.current.bufferRefs.windSpeedBufferRef.current.getLatest()).toEqual([1.23]);
        expect(result.current.bufferRefs.timestampBufferRef.current.length).toBe(1);
        rerender({ dataSource: 'stale', bleSensorData: staleSample });
        expect(result.current.bufferRefs.windSpeedBufferRef.current.getLatest()).toEqual([1.23, 7.89]);
        expect(result.current.bufferRefs.windDirectionBufferRef.current.getLatest()).toEqual([42, 180]);
        expect(result.current.bufferRefs.temperatureBufferRef.current.getLatest()).toEqual([24.6, 31]);
        expect(result.current.bufferRefs.soundSpeedBufferRef.current.getLatest()).toEqual([344.2, 350]);
        expect(result.current.bufferRefs.timestampBufferRef.current.length).toBe(2);
        expect(lineChartRef.current.updateData).toHaveBeenCalledTimes(updateCountAfterLive + 1);
    });
    it('clears readings and chart buffers when data returns to empty', () => {
        const { result, rerender, lineChartRef } = renderSensorHook('live', createSample());
        expect(result.current.bufferRefs.windSpeedBufferRef.current.length).toBe(1);
        rerender({ dataSource: 'empty', bleSensorData: null });
        expect(result.current.values.windSpeed).toBeNull();
        expect(result.current.values.windSpeedAverage10m).toBeNull();
        expect(result.current.values.windDirection).toBeNull();
        expect(result.current.values.headingSpeed).toBeNull();
        expect(result.current.values.temperature).toBeNull();
        expect(result.current.values.soundSpeed).toBeNull();
        expect(result.current.bufferRefs.windSpeedBufferRef.current.length).toBe(0);
        expect(result.current.bufferRefs.referenceWindSpeedWindowRef?.current.length).toBe(0);
        expect(result.current.bufferRefs.windDirectionBufferRef.current.length).toBe(0);
        expect(result.current.bufferRefs.temperatureBufferRef.current.length).toBe(0);
        expect(result.current.bufferRefs.soundSpeedBufferRef.current.length).toBe(0);
        expect(result.current.bufferRefs.timestampBufferRef.current.length).toBe(0);
        expect(lineChartRef.current.updateData).toHaveBeenCalled();
    });
    it('presents the next live sample after retaining stale-period timeline data', () => {
        const firstSample = createSample();
        const staleSample = createSample({ windSpeed: 7.89, windDirection: 180, temperature: 31, soundSpeed: 350 });
        const recoverySample = createSample({ windSpeed: 2.5, windDirection: 45.4, temperature: 25.1, soundSpeed: 345.6 });
        const { result, rerender } = renderSensorHook('live', firstSample);
        rerender({ dataSource: 'stale', bleSensorData: staleSample });
        rerender({ dataSource: 'live', bleSensorData: recoverySample });
        expect(result.current.values.windSpeed).toBe(2.5);
        expect(result.current.values.windSpeedAverage10m).toBe(3.87);
        expect(result.current.values.windDirection).toBe(45);
        expect(result.current.values.temperature).toBe(25.1);
        expect(result.current.values.soundSpeed).toBe(345.6);
        expect(result.current.bufferRefs.windSpeedBufferRef.current.getLatest()).toEqual([1.23, 7.89, 2.5]);
        expect(result.current.bufferRefs.windDirectionBufferRef.current.getLatest()).toEqual([42, 180, 45]);
        expect(result.current.bufferRefs.temperatureBufferRef.current.getLatest()).toEqual([24.6, 31, 25.1]);
        expect(result.current.bufferRefs.soundSpeedBufferRef.current.getLatest()).toEqual([344.2, 350, 345.6]);
        expect(result.current.bufferRefs.timestampBufferRef.current.length).toBe(3);
    });
    it('stores A/B direction wind speeds in aligned chart buffers', () => {
        const firstSample = createSample({ windSpeedA: 0.5, windSpeedB: 1.1 });
        const secondSample = createSample({ windSpeed: 2.5, windSpeedA: -0.25, windSpeedB: 2.49 });
        const { result, rerender } = renderSensorHook('live', firstSample);
        rerender({ dataSource: 'live', bleSensorData: secondSample });
        expect(result.current.bufferRefs.windSpeedBufferRef.current.getLatest()).toEqual([1.23, 2.5]);
        expect(result.current.bufferRefs.windSpeedABufferRef.current.getLatest()).toEqual([0.5, -0.25]);
        expect(result.current.bufferRefs.windSpeedBBufferRef.current.getLatest()).toEqual([1.1, 2.49]);
        expect(result.current.bufferRefs.timestampBufferRef.current.length).toBe(2);
    });
    it('calculates 10 minute average wind speed from sample timestamps', () => {
        const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime();
        const firstSample = createSample({ windSpeed: 1, timestamp: baseTime });
        const secondSample = createSample({ windSpeed: 3, timestamp: baseTime + 9 * 60 * 1000 });
        const thirdSample = createSample({ windSpeed: 5, timestamp: baseTime + 10 * 60 * 1000 + 1000 });
        const { result, rerender } = renderSensorHook('live', firstSample);
        expect(result.current.values.windSpeedAverage10m).toBe(1);
        rerender({ dataSource: 'live', bleSensorData: secondSample });
        expect(result.current.values.windSpeedAverage10m).toBe(2);
        rerender({ dataSource: 'live', bleSensorData: thirdSample });
        expect(result.current.values.windSpeedAverage10m).toBe(4);
    });
    it('does not drop in-window wind speed samples when an older timestamp appears in between', () => {
        const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime();
        const firstSample = createSample({ windSpeed: 1, timestamp: baseTime + 30000 });
        const oldSample = createSample({ windSpeed: 100, timestamp: baseTime - 20 * 60 * 1000 });
        const currentSample = createSample({ windSpeed: 5, timestamp: baseTime + 60000 });
        const { result, rerender } = renderSensorHook('live', firstSample);
        rerender({ dataSource: 'live', bleSensorData: oldSample });
        rerender({ dataSource: 'live', bleSensorData: currentSample });
        expect(result.current.values.windSpeedAverage10m).toBe(3);
    });
    it('falls back to receipt time for non-finite timestamps before calculating the 10 minute average', () => {
        const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime();
        vi.setSystemTime(baseTime);
        const { result, rerender } = renderSensorHook('live', createSample({ windSpeed: 2, timestamp: Number.NaN }));
        expect(result.current.values.windSpeedAverage10m).toBe(2);
        vi.setSystemTime(baseTime + 5 * 60 * 1000);
        rerender({
            dataSource: 'live',
            bleSensorData: createSample({ windSpeed: 4, timestamp: Number.NaN }),
        });
        expect(result.current.values.windSpeedAverage10m).toBe(3);
        expect(result.current.bufferRefs.windSpeedBufferRef.current.getLatest()).toEqual([2, 4]);
        expect(result.current.bufferRefs.timestampBufferRef.current.length).toBe(2);
    });
});
