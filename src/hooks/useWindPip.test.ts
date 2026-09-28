import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeWindPipMock = vi.hoisted(() => ({
  isAvailable: vi.fn(() => true),
  getSupport: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  update: vi.fn(),
  stateListener: null as null | ((state: Record<string, unknown>) => void),
  restoreListener: null as null | (() => void),
}));

vi.mock('../services/nativeWindPip', () => ({
  isNativeWindPipAvailable: nativeWindPipMock.isAvailable,
  getNativeWindPipSupport: nativeWindPipMock.getSupport,
  startNativeWindPip: nativeWindPipMock.start,
  stopNativeWindPip: nativeWindPipMock.stop,
  updateNativeWindPip: nativeWindPipMock.update,
  subscribeToNativeWindPipState: vi.fn(async (listener) => {
    nativeWindPipMock.stateListener = listener;
    return { remove: vi.fn() };
  }),
  subscribeToNativeWindPipRestore: vi.fn(async (listener) => {
    nativeWindPipMock.restoreListener = listener;
    return { remove: vi.fn() };
  }),
}));

import { useWindPip } from './useWindPip';

type WindPipTestOptions = Parameters<typeof useWindPip>[0];

const baseOptions: WindPipTestOptions = {
  isConnected: true,
  dataState: 'live',
  windSpeed: 2.5,
  windDirection: 123,
  temperature: 24.6,
  soundSpeed: 346.8,
  headingSpeed: -0.42,
  windSpeedAverage10m: 2.11,
  windSpeedUnit: 'm/s',
  cardLogState: 'recording',
  cardLogDetail: undefined,
  appLogState: 'error',
  appLogDetail: '保存失敗',
  themeVariant: 'graphite',
  sampleTimestampMs: 123_456,
};

describe('useWindPip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeWindPipMock.stateListener = null;
    nativeWindPipMock.restoreListener = null;
    nativeWindPipMock.isAvailable.mockReturnValue(true);
    nativeWindPipMock.getSupport.mockResolvedValue({ supported: true, possible: true, active: false });
    nativeWindPipMock.update.mockResolvedValue({ supported: true, possible: true, active: false, phase: 'ready' });
    nativeWindPipMock.start.mockResolvedValue({ supported: true, possible: true, active: false, phase: 'starting' });
    nativeWindPipMock.stop.mockResolvedValue({ supported: true, possible: true, active: false, phase: 'ready' });
  });

  it('enables explicit start only for a fresh connected measurement', async () => {
    const { result, rerender } = renderHook(
      (options: typeof baseOptions) => useWindPip(options),
      { initialProps: baseOptions },
    );

    await waitFor(() => expect(result.current.canStart).toBe(true));
    await act(async () => result.current.toggle());
    expect(nativeWindPipMock.start).toHaveBeenCalledWith(expect.objectContaining({
      windSpeedMps: 2.5,
      windDirectionDegrees: 123,
      temperatureCelsius: 24.6,
      soundSpeedMps: 346.8,
      headingSpeedMps: -0.42,
      windSpeedAverage10mMps: 2.11,
      cardLogState: 'recording',
      appLogState: 'error',
      appLogDetail: '保存失敗',
      dataState: 'live',
      capturedAtMs: 123_456,
    }));

    rerender({ ...baseOptions, dataState: 'stale' });
    await waitFor(() => expect(nativeWindPipMock.update).toHaveBeenLastCalledWith(expect.objectContaining({
      windSpeedMps: null,
      windDirectionDegrees: null,
      temperatureCelsius: null,
      soundSpeedMps: null,
      headingSpeedMps: null,
      windSpeedAverage10mMps: null,
      cardLogState: 'recording',
      appLogState: 'error',
      dataState: 'stale',
    })));
    expect(result.current.canStart).toBe(false);

    rerender({ ...baseOptions, isConnected: false, dataState: 'disconnected' });
    await waitFor(() => expect(nativeWindPipMock.update).toHaveBeenLastCalledWith(expect.objectContaining({
      windSpeedMps: null,
      windDirectionDegrees: null,
      temperatureCelsius: null,
      soundSpeedMps: null,
      headingSpeedMps: null,
      windSpeedAverage10mMps: null,
      cardLogState: 'recording',
      appLogState: 'error',
      dataState: 'disconnected',
    })));
    expect(result.current.canStart).toBe(false);
  });

  it('updates optional telemetry and log status without changing the wind-data start gate', async () => {
    const { result, rerender } = renderHook(
      (options: WindPipTestOptions) => useWindPip(options),
      { initialProps: baseOptions },
    );
    await waitFor(() => expect(result.current.canStart).toBe(true));

    rerender({
      ...baseOptions,
      temperature: null,
      soundSpeed: Number.NaN,
      headingSpeed: Number.NaN,
      windSpeedAverage10m: null,
      cardLogState: 'error',
      cardLogDetail: '書込失敗',
      appLogState: 'ready',
      appLogDetail: undefined,
    });

    await act(async () => result.current.toggle());
    expect(nativeWindPipMock.start).toHaveBeenLastCalledWith(expect.objectContaining({
      temperatureCelsius: null,
      soundSpeedMps: null,
      headingSpeedMps: null,
      windSpeedAverage10mMps: null,
      cardLogState: 'error',
      cardLogDetail: '書込失敗',
      appLogState: 'ready',
      dataState: 'live',
    }));
    expect(result.current.canStart).toBe(true);
  });

  it('keeps explicit start enabled while native PiP readiness is transient', async () => {
    nativeWindPipMock.getSupport.mockResolvedValue({ supported: true, possible: false, active: false });
    nativeWindPipMock.update.mockResolvedValue({ supported: true, possible: false, active: false, phase: 'ready' });
    const { result } = renderHook(() => useWindPip(baseOptions));

    await waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current.possible).toBe(false);
    expect(result.current.canStart).toBe(true);
  });

  it('marks PiP busy immediately while the native start request is pending', async () => {
    let finishStart!: (state: Record<string, unknown>) => void;
    nativeWindPipMock.start.mockReturnValueOnce(new Promise((resolve) => { finishStart = resolve; }));
    const { result } = renderHook(() => useWindPip(baseOptions));
    await waitFor(() => expect(result.current.available).toBe(true));

    let startPromise!: Promise<void>;
    act(() => { startPromise = result.current.toggle(); });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      finishStart({ supported: true, possible: true, active: true, phase: 'active' });
      await startPromise;
    });
    expect(result.current.active).toBe(true);
  });

  it('tracks native lifecycle events and restores the second carousel slide', async () => {
    const onRestoreRequested = vi.fn();
    const { result } = renderHook(() => useWindPip({ ...baseOptions, onRestoreRequested }));
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => {
      nativeWindPipMock.stateListener?.({
        supported: true,
        possible: true,
        active: true,
        phase: 'active',
      });
      nativeWindPipMock.restoreListener?.();
    });

    expect(result.current.active).toBe(true);
    expect(onRestoreRequested).toHaveBeenCalledTimes(1);

    await act(async () => result.current.toggle());
    expect(nativeWindPipMock.stop).toHaveBeenCalledTimes(1);
  });

  it('reconciles native PiP after foreground return without downgrading a pending start', async () => {
    const { result } = renderHook(() => useWindPip(baseOptions));
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => {
      nativeWindPipMock.stateListener?.({
        supported: true,
        possible: true,
        active: false,
        phase: 'starting',
      });
    });
    expect(result.current.busy).toBe(true);

    nativeWindPipMock.getSupport.mockResolvedValueOnce({
      supported: true,
      possible: true,
      active: false,
    });
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow'));
    });
    await waitFor(() => expect(result.current.busy).toBe(true));

    nativeWindPipMock.getSupport.mockResolvedValueOnce({
      supported: true,
      possible: true,
      active: true,
    });
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow'));
    });
    await waitFor(() => expect(result.current.active).toBe(true));

    nativeWindPipMock.getSupport.mockResolvedValueOnce({
      supported: true,
      possible: true,
      active: false,
    });
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow'));
    });
    await waitFor(() => {
      expect(result.current.active).toBe(false);
      expect(result.current.busy).toBe(false);
    });
  });

  it('does not initialize the native bridge on the web', () => {
    nativeWindPipMock.isAvailable.mockReturnValue(false);
    const { result } = renderHook(() => useWindPip(baseOptions));

    expect(result.current.available).toBe(false);
    expect(result.current.canStart).toBe(false);
    expect(nativeWindPipMock.getSupport).not.toHaveBeenCalled();
    expect(nativeWindPipMock.update).not.toHaveBeenCalled();
  });
});
