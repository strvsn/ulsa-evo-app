import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SensorData } from '../../types/ble';
import { SensorUiFrameBatch, useSensorUiFrameCommit, } from './useSensorUiFrameCommit';
const sample = (overrides: Partial<SensorData> = {}): SensorData => ({
    timestamp: 0,
    windDirection: 10,
    windSpeed: 1,
    temperature: 20,
    soundSpeed: 343,
    headingSpeed: 0,
    windSpeedA: null,
    windSpeedB: null,
    nodeId: 1,
    sensorStatus: 1,
    ...overrides,
});
describe('SensorUiFrameBatch', () => {
    it('keeps only the latest display snapshot while timeline delivery stays outside React state', () => {
        const batch = new SensorUiFrameBatch();
        const direction = sample({ windDirection: 20 });
        const speed = sample({ windDirection: 20, windSpeed: 2 });
        const temperature = sample({ windDirection: 20, windSpeed: 2, temperature: 21 });
        batch.enqueue(direction, 'windDirection', 100);
        batch.enqueue(speed, 'windSpeed', 101);
        batch.enqueue(temperature, 'temperature', 102);
        expect(batch.drain()).toEqual({
            latestSample: temperature,
            standardFieldReceivedAt: {
                windDirection: 100,
                windSpeed: 101,
                temperature: 102,
            },
            lastStandardReceivedAt: 102,
        });
    });
    it('keeps wind freshness timestamps across separate display frames', () => {
        const batch = new SensorUiFrameBatch();
        const direction = sample({ windDirection: 20 });
        const status = sample({ windDirection: 20, sensorStatus: 1 });
        const speed = sample({ windDirection: 20, windSpeed: 2 });
        batch.enqueue(direction, 'windDirection', 100);
        expect(batch.drain()?.standardFieldReceivedAt).toEqual({ windDirection: 100 });
        batch.enqueue(status, 'sensorStatus', 101);
        expect(batch.drain()?.standardFieldReceivedAt).toEqual({ windDirection: 100 });
        batch.enqueue(speed, 'windSpeed', 102);
        expect(batch.drain()).toMatchObject({
            standardFieldReceivedAt: {
                windDirection: 100,
                windSpeed: 102,
            },
            lastStandardReceivedAt: 102,
        });
    });
    it('clears accumulated freshness when the connection is reset', () => {
        const batch = new SensorUiFrameBatch();
        batch.enqueue(sample(), 'windSpeed', 100);
        batch.drain();
        batch.clear();
        batch.enqueue(sample(), 'sensorStatus', 101);
        expect(batch.drain()).toMatchObject({
            standardFieldReceivedAt: {},
            lastStandardReceivedAt: null,
        });
    });
});
describe('useSensorUiFrameCommit', () => {
    let frameCallbacks: Map<number, FrameRequestCallback>;
    let nextFrameId: number;
    beforeEach(() => {
        frameCallbacks = new Map();
        nextFrameId = 1;
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            const id = nextFrameId++;
            frameCallbacks.set(id, callback);
            return id;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
            frameCallbacks.delete(id);
        }));
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });
    it('commits a characteristic burst once on the next display frame', () => {
        const setters = {
            lastSensorDataAtRef: { current: null as number | null },
            setDataState: vi.fn(),
            setConnectedDevice: vi.fn(),
            onSensorDataCommitted: vi.fn(),
        };
        const { result } = renderHook(() => useSensorUiFrameCommit(setters));
        act(() => {
            result.current.enqueueSensorUiUpdate(sample({ windDirection: 20 }), 'windDirection', 100);
            result.current.enqueueSensorUiUpdate(sample({ windDirection: 20, windSpeed: 2 }), 'windSpeed', 101);
            result.current.enqueueSensorUiUpdate(sample({ windDirection: 20, windSpeed: 2, temperature: 21 }), 'temperature', 102);
        });
        expect(frameCallbacks).toHaveLength(1);
        expect(setters.onSensorDataCommitted).not.toHaveBeenCalled();
        expect(setters.lastSensorDataAtRef.current).toBe(102);
        act(() => {
            for (const callback of frameCallbacks.values())
                callback(120);
            frameCallbacks.clear();
        });
        expect(setters.onSensorDataCommitted).toHaveBeenCalledWith(expect.objectContaining({
            latestSample: expect.objectContaining({ temperature: 21 }),
            standardFieldReceivedAt: {
                windDirection: 100,
                windSpeed: 101,
                temperature: 102,
            },
            lastStandardReceivedAt: 102,
        }));
        expect(setters.setDataState).toHaveBeenCalledWith('live');
        expect(setters.setConnectedDevice).toHaveBeenCalledOnce();
    });
    it('cancels an old connection frame before it can restore stale state', () => {
        const setters = {
            lastSensorDataAtRef: { current: null as number | null },
            setDataState: vi.fn(),
            setConnectedDevice: vi.fn(),
            onSensorDataCommitted: vi.fn(),
        };
        const { result } = renderHook(() => useSensorUiFrameCommit(setters));
        act(() => {
            result.current.enqueueSensorUiUpdate(sample(), 'windSpeed', 100);
            result.current.cancelPendingSensorUiUpdate();
        });
        expect(frameCallbacks).toHaveLength(0);
        expect(setters.onSensorDataCommitted).not.toHaveBeenCalled();
    });
    it('commits the assembled snapshot immediately when hidden PiP delivery requests it', () => {
        const setters = {
            lastSensorDataAtRef: { current: null as number | null },
            setDataState: vi.fn(),
            setConnectedDevice: vi.fn(),
            onSensorDataCommitted: vi.fn(),
        };
        const { result } = renderHook(() => useSensorUiFrameCommit(setters));
        act(() => {
            result.current.enqueueSensorUiUpdate(sample({ windDirection: 20 }), 'windDirection', 100);
            result.current.enqueueSensorUiUpdate(sample({ windDirection: 20, windSpeed: 2 }), 'windSpeed', 101, true);
        });
        expect(frameCallbacks).toHaveLength(0);
        expect(setters.onSensorDataCommitted).toHaveBeenCalledOnce();
        expect(setters.onSensorDataCommitted).toHaveBeenCalledWith(expect.objectContaining({
            latestSample: expect.objectContaining({ windDirection: 20, windSpeed: 2 }),
            standardFieldReceivedAt: { windDirection: 100, windSpeed: 101 },
            lastStandardReceivedAt: 101,
        }));
    });
});
