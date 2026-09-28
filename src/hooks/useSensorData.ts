import { useEffect, useLayoutEffect, useState, useRef, useMemo, useCallback } from 'react';
import type { RefObject } from 'react';
import { NumericRingBuffer, RingBuffer } from '../utils/RingBuffer';
import { ReferenceWindSpeedWindow, REFERENCE_WIND_METRICS_WINDOW_MS } from '../utils/derivedWindMetrics';
import type { SensorData } from '../types/ble';
import type { SensorValues, UseSensorDataReturn } from '../types/sensor';
import type { LineChartRef } from '../components/charts';
import { recordPerfEvent } from '../utils/renderPerfDiagnostics';
import type { DisplaySampleListener, SensorDisplayUpdate, TimelineSampleListener } from './ble/types';
export const MAX_HISTORY = 6000;
export const WIND_SPEED_AVERAGE_WINDOW_MS = REFERENCE_WIND_METRICS_WINDOW_MS;
export type SensorDataSource = 'empty' | 'live' | 'stale';
interface UseSensorDataOptions {
    dataSource: SensorDataSource;
    subscribeDisplaySamples: (listener: DisplaySampleListener) => () => void;
    subscribeTimelineSamples: (listener: TimelineSampleListener) => () => void;
    lineChartRef: RefObject<LineChartRef | null>;
    reactiveValues?: boolean;
}
interface SensorDataController extends UseSensorDataReturn {
    resetReadings: () => void;
    applyLatestData: (update: SensorDisplayUpdate) => void;
    ingestLiveSample: (data: SensorData) => void;
}
interface UseLiveSensorDataOptions {
    active: boolean;
    subscribeDisplaySamples: (listener: DisplaySampleListener) => () => void;
    subscribeTimelineSamples: (listener: TimelineSampleListener) => () => void;
    applyLatestData: (update: SensorDisplayUpdate) => void;
    ingestLiveSample: (data: SensorData) => void;
}
const createTimestamp = (timestampMs: number = Date.now()): string => new Date(timestampMs).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});
const normalizeOptionalSpeed = (value: number | null | undefined): number => (typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(2)) : Number.NaN);
const normalizeDirection = (degrees: number): number => ((degrees % 360) + 360) % 360;
const measurementUsable = (data: SensorData): boolean => (data.statusProtocolVersion !== 2 && data.statusProtocolVersion !== 3) ||
    data.sensorStatus === 1;
const calculateContinuousDirection = (previousContinuous: number, nextDisplay: number): number => {
    const currentDisplay = normalizeDirection(previousContinuous);
    let delta = nextDisplay - currentDisplay;
    if (delta > 180)
        delta -= 360;
    if (delta < -180)
        delta += 360;
    return previousContinuous + delta;
};
const createEmptySensorValues = (): SensorValues => ({
    windSpeed: null,
    windSpeedAverage10m: null,
    windDirection: null,
    windDirectionContinuous: 0,
    headingSpeed: null,
    temperature: null,
    soundSpeed: null,
});
const areSensorValuesEqual = (a: SensorValues, b: SensorValues): boolean => Object.is(a.windSpeed, b.windSpeed) &&
    Object.is(a.windSpeedAverage10m, b.windSpeedAverage10m) &&
    Object.is(a.windDirection, b.windDirection) &&
    Object.is(a.windDirectionContinuous, b.windDirectionContinuous) &&
    Object.is(a.headingSpeed, b.headingSpeed) &&
    Object.is(a.temperature, b.temperature) &&
    Object.is(a.soundSpeed, b.soundSpeed);
const EMPTY_SENSOR_VALUES = createEmptySensorValues();
const useSensorDataController = (lineChartRef: RefObject<LineChartRef | null>, reactiveValues: boolean): SensorDataController => {
    const windSpeedBuffer = useMemo(() => new NumericRingBuffer(MAX_HISTORY), []);
    const windSpeedABuffer = useMemo(() => new NumericRingBuffer(MAX_HISTORY), []);
    const windSpeedBBuffer = useMemo(() => new NumericRingBuffer(MAX_HISTORY), []);
    const windDirectionBuffer = useMemo(() => new NumericRingBuffer(MAX_HISTORY), []);
    const temperatureBuffer = useMemo(() => new NumericRingBuffer(MAX_HISTORY), []);
    const soundSpeedBuffer = useMemo(() => new NumericRingBuffer(MAX_HISTORY), []);
    const timestampBuffer = useMemo(() => new RingBuffer<string>(MAX_HISTORY), []);
    const timestampMsBuffer = useMemo(() => new RingBuffer<number>(MAX_HISTORY), []);
    const referenceWindSpeedWindow = useMemo(() => new ReferenceWindSpeedWindow(), []);
    const [values, setValues] = useState<SensorValues>(() => createEmptySensorValues());
    const valuesRef = useRef<SensorValues>(values);
    const presentationListenersRef = useRef(new Set<(values: SensorValues) => void>());
    const getPresentationValues = useCallback(() => valuesRef.current, []);
    const subscribePresentationValues = useCallback((listener: (values: SensorValues) => void) => {
        presentationListenersRef.current.add(listener);
        listener(valuesRef.current);
        return () => presentationListenersRef.current.delete(listener);
    }, []);
    const publishPresentationValues = useCallback((nextValues: SensorValues) => {
        valuesRef.current = nextValues;
        presentationListenersRef.current.forEach((listener) => listener(nextValues));
        if (reactiveValues)
            setValues(nextValues);
    }, [reactiveValues]);
    useLayoutEffect(() => {
        if (reactiveValues)
            setValues(valuesRef.current);
    }, [reactiveValues]);
    const windSpeedAverage10mRef = useRef<number | null>(null);
    const displayUpdateRef = useRef<SensorDisplayUpdate | null>(null);
    const windSpeedBufferRef = useRef(windSpeedBuffer);
    const windSpeedABufferRef = useRef(windSpeedABuffer);
    const windSpeedBBufferRef = useRef(windSpeedBBuffer);
    const windDirectionBufferRef = useRef(windDirectionBuffer);
    const temperatureBufferRef = useRef(temperatureBuffer);
    const soundSpeedBufferRef = useRef(soundSpeedBuffer);
    const timestampBufferRef = useRef(timestampBuffer);
    const timestampMsBufferRef = useRef(timestampMsBuffer);
    const referenceWindSpeedWindowRef = useRef(referenceWindSpeedWindow);
    const lastDebugLogTime = useRef<number>(0);
    const bufferRefs = useMemo(() => ({
        referenceWindSpeedWindowRef,
        windSpeedBufferRef,
        windSpeedABufferRef,
        windSpeedBBufferRef,
        windDirectionBufferRef,
        temperatureBufferRef,
        soundSpeedBufferRef,
        timestampBufferRef,
        timestampMsBufferRef,
    }), [
        referenceWindSpeedWindowRef,
        windSpeedBufferRef,
        windSpeedABufferRef,
        windSpeedBBufferRef,
        windDirectionBufferRef,
        temperatureBufferRef,
        soundSpeedBufferRef,
        timestampBufferRef,
        timestampMsBufferRef
    ]);
    const resetReadings = useCallback(() => {
        const hasBufferedReadings = windSpeedBuffer.length > 0 ||
            windSpeedABuffer.length > 0 ||
            windSpeedBBuffer.length > 0 ||
            windDirectionBuffer.length > 0 ||
            temperatureBuffer.length > 0
            ||
                soundSpeedBuffer.length > 0
            ||
                timestampBuffer.length > 0 ||
            timestampMsBuffer.length > 0 ||
            referenceWindSpeedWindow.length > 0;
        if (!areSensorValuesEqual(valuesRef.current, EMPTY_SENSOR_VALUES)) {
            publishPresentationValues(createEmptySensorValues());
        }
        windSpeedAverage10mRef.current = null;
        if (!hasBufferedReadings) {
            return;
        }
        windSpeedBuffer.clear();
        windSpeedABuffer.clear();
        windSpeedBBuffer.clear();
        windDirectionBuffer.clear();
        temperatureBuffer.clear();
        soundSpeedBuffer.clear();
        timestampBuffer.clear();
        timestampMsBuffer.clear();
        referenceWindSpeedWindow.clear();
        lineChartRef.current?.updateData();
    }, [
        windSpeedBuffer,
        windSpeedABuffer,
        windSpeedBBuffer,
        windDirectionBuffer,
        temperatureBuffer,
        soundSpeedBuffer,
        timestampBuffer,
        timestampMsBuffer,
        referenceWindSpeedWindow,
        lineChartRef,
        publishPresentationValues
    ]);
    const ingestLiveSample = useCallback((data: SensorData) => {
        recordPerfEvent('useSensorData.applyLiveSample');
        const sampleTimestamp = Number.isFinite(data.timestamp) ? data.timestamp : Date.now();
        const timestamp = createTimestamp(sampleTimestamp);
        const usable = measurementUsable(data);
        const newWindSpeed = Number.isFinite(data.windSpeed)
            ? Number(data.windSpeed.toFixed(2))
            : Number.NaN;
        windSpeedBuffer.push(newWindSpeed);
        windSpeedABuffer.push(normalizeOptionalSpeed(data.windSpeedA));
        windSpeedBBuffer.push(normalizeOptionalSpeed(data.windSpeedB));
        timestampMsBuffer.push(sampleTimestamp);
        referenceWindSpeedWindow.push(usable ? newWindSpeed : Number.NaN, sampleTimestamp);
        windSpeedAverage10mRef.current = referenceWindSpeedWindow.getAverage(sampleTimestamp);
        const rawDirection = Number.isFinite(data.windDirection)
            ? normalizeDirection(data.windDirection)
            : Number.NaN;
        const newDirection = Number.isFinite(rawDirection) ? Math.round(rawDirection) : Number.NaN;
        windDirectionBuffer.push(newDirection);
        const newTemperature = Number.isFinite(data.temperature)
            ? Number(data.temperature.toFixed(1))
            : Number.NaN;
        temperatureBuffer.push(newTemperature);
        const newSoundSpeed = Number.isFinite(data.soundSpeed)
            ? Number(data.soundSpeed.toFixed(1))
            : Number.NaN;
        soundSpeedBuffer.push(newSoundSpeed);
        timestampBuffer.push(timestamp);
        if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
            lineChartRef.current?.updateData();
        }
    }, [
        windSpeedBuffer,
        windSpeedABuffer,
        windSpeedBBuffer,
        windDirectionBuffer,
        temperatureBuffer,
        soundSpeedBuffer,
        timestampBuffer,
        timestampMsBuffer,
        referenceWindSpeedWindow,
        lineChartRef
    ]);
    const applyLatestData = useCallback((update: SensorDisplayUpdate) => {
        displayUpdateRef.current = update;
        const data = update.latestSample;
        const previousValues = valuesRef.current;
        const usable = measurementUsable(data);
        const windSpeed = Number.isFinite(data.windSpeed)
            ? Number(data.windSpeed.toFixed(2))
            : null;
        const rawWindDirection = Number.isFinite(data.windDirection)
            ? normalizeDirection(data.windDirection)
            : null;
        const windDirection = rawWindDirection === null ? null : Math.round(rawWindDirection);
        const headingSpeed = Number.isFinite(data.headingSpeed)
            ? Number(data.headingSpeed.toFixed(2))
            : null;
        const temperature = Number.isFinite(data.temperature)
            ? Number(data.temperature.toFixed(1))
            : null;
        const soundSpeed = Number.isFinite(data.soundSpeed)
            ? Number(data.soundSpeed.toFixed(1))
            : null;
        const nextValues: SensorValues = {
            windSpeed,
            windSpeedAverage10m: usable ? windSpeedAverage10mRef.current : null,
            windDirection,
            windDirectionContinuous: rawWindDirection === null
                ? previousValues.windDirectionContinuous
                : calculateContinuousDirection(previousValues.windDirectionContinuous, rawWindDirection),
            headingSpeed,
            temperature,
            soundSpeed,
        };
        if (!areSensorValuesEqual(previousValues, nextValues))
            publishPresentationValues(nextValues);
    }, [publishPresentationValues]);
    return {
        values,
        getPresentationValues,
        subscribePresentationValues,
        bufferRefs,
        lastDebugLogTime,
        displayUpdateRef,
        resetReadings,
        applyLatestData,
        ingestLiveSample,
    };
};
export const useLiveSensorData = ({ active, subscribeDisplaySamples, subscribeTimelineSamples, applyLatestData, ingestLiveSample, }: UseLiveSensorDataOptions): void => {
    useLayoutEffect(() => active ? subscribeDisplaySamples(applyLatestData) : () => undefined, [active, applyLatestData, subscribeDisplaySamples]);
    useLayoutEffect(() => subscribeTimelineSamples(ingestLiveSample), [ingestLiveSample, subscribeTimelineSamples]);
};
export const useSensorData = ({ dataSource, subscribeDisplaySamples, subscribeTimelineSamples, lineChartRef, reactiveValues = true, }: UseSensorDataOptions): UseSensorDataReturn => {
    const { values, getPresentationValues, subscribePresentationValues, bufferRefs, lastDebugLogTime, displayUpdateRef, resetReadings, applyLatestData, ingestLiveSample, } = useSensorDataController(lineChartRef, reactiveValues);
    useEffect(() => {
        if (dataSource === 'empty') {
            resetReadings();
        }
    }, [dataSource, resetReadings]);
    useLiveSensorData({
        active: dataSource === 'live',
        subscribeDisplaySamples,
        subscribeTimelineSamples,
        applyLatestData,
        ingestLiveSample,
    });
    useEffect(() => {
        const redrawLatestHistory = () => {
            if (document.visibilityState === 'visible')
                lineChartRef.current?.updateData();
        };
        document.addEventListener('visibilitychange', redrawLatestHistory);
        return () => document.removeEventListener('visibilitychange', redrawLatestHistory);
    }, [lineChartRef]);
    return {
        values,
        getPresentationValues,
        subscribePresentationValues,
        bufferRefs,
        lastDebugLogTime,
        displayUpdateRef,
    };
};
