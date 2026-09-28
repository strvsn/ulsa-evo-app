import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ULSA_DEVICE_NOT_FOUND_ERROR } from '../../hooks/ble/scanMessages';
import {
  NATIVE_BLE_SCAN_RETRY_DELAY_MS,
  NATIVE_BLE_SCAN_TOTAL_TIMEOUT_MS,
  useContinuousNativeBleScan,
} from './useContinuousNativeBleScan';

const nativePlatformInfo = {
  platform: 'ios' as const,
  adapterType: 'Capacitor' as const,
  isSupported: true,
};

const createOptions = (overrides: Partial<Parameters<typeof useContinuousNativeBleScan>[0]> = {}) => ({
  modalOpen: true,
  connectionState: 'disconnected' as const,
  availableDeviceCount: 0,
  error: ULSA_DEVICE_NOT_FOUND_ERROR,
  platformInfo: nativePlatformInfo,
  scanAndConnect: vi.fn().mockResolvedValue(undefined),
  cancelNativeScan: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('useContinuousNativeBleScan', () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('retries a Capacitor scan after an ordinary no-device result', async () => {
    vi.useFakeTimers();
    const options = createOptions();
    const { result } = renderHook((nextOptions) => useContinuousNativeBleScan(nextOptions), {
      initialProps: options,
    });

    act(() => {
      result.current.beginContinuousNativeScan();
    });
    expect(options.scanAndConnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NATIVE_BLE_SCAN_RETRY_DELAY_MS - 1);
    });
    expect(options.scanAndConnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(options.scanAndConnect).toHaveBeenCalledTimes(2);
  });

  it('stops retries after a completed scan has candidates, without cancelling that scan', async () => {
    vi.useFakeTimers();
    const options = createOptions();
    const { result, rerender } = renderHook((nextOptions) => useContinuousNativeBleScan(nextOptions), {
      initialProps: options,
    });

    act(() => {
      result.current.beginContinuousNativeScan();
    });
    rerender({ ...options, availableDeviceCount: 1 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NATIVE_BLE_SCAN_RETRY_DELAY_MS * 2);
    });
    expect(options.scanAndConnect).toHaveBeenCalledTimes(1);
    expect(result.current.isContinuousNativeScanActive).toBe(false);
    expect(options.cancelNativeScan).not.toHaveBeenCalled();

    act(() => {
      result.current.beginContinuousNativeScan();
    });
    rerender({ ...options, modalOpen: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NATIVE_BLE_SCAN_RETRY_DELAY_MS * 2);
    });
    expect(result.current.isContinuousNativeScanActive).toBe(false);
  });

  it('keeps the current scan running as the first and later candidates arrive', async () => {
    let finishScan!: () => void;
    const options = createOptions({
      error: null,
      scanAndConnect: vi.fn(() => new Promise<void>((resolve) => { finishScan = resolve; })),
    });
    const { result, rerender } = renderHook((props) => useContinuousNativeBleScan(props), { initialProps: options });
    act(() => { result.current.beginContinuousNativeScan(); });
    for (const count of [1, 2, 3]) {
      rerender({ ...options, connectionState: 'scanning', availableDeviceCount: count });
      expect(result.current.isContinuousNativeScanActive).toBe(true);
      expect(options.cancelNativeScan).not.toHaveBeenCalled();
    }
    await act(async () => { finishScan(); });
    rerender({ ...options, availableDeviceCount: 3 });
    expect(result.current.isContinuousNativeScanActive).toBe(false);
    expect(options.scanAndConnect).toHaveBeenCalledOnce();
    expect(options.cancelNativeScan).not.toHaveBeenCalled();
  });

  it('does not cancel a rescan merely because previously discovered candidates remain', async () => {
    const options = createOptions({ availableDeviceCount: 2,
      scanAndConnect: vi.fn(() => new Promise<void>(() => undefined)), });
    const { result, rerender } = renderHook((props) => useContinuousNativeBleScan(props), { initialProps: options });
    act(() => { result.current.beginContinuousNativeScan(); });
    expect(result.current.isContinuousNativeScanActive).toBe(true);
    expect(options.cancelNativeScan).not.toHaveBeenCalled();
    rerender({ ...options, modalOpen: false });
    expect(options.cancelNativeScan).toHaveBeenCalledOnce();
    expect(result.current.isContinuousNativeScanActive).toBe(false);
  });

  it('keeps Web Bluetooth as a one-shot browser chooser action', async () => {
    vi.useFakeTimers();
    const options = createOptions({
      platformInfo: {
        platform: 'web',
        adapterType: 'WebBluetooth',
        isSupported: true,
      },
    });
    const { result } = renderHook(() => useContinuousNativeBleScan(options));

    act(() => {
      result.current.beginContinuousNativeScan();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NATIVE_BLE_SCAN_RETRY_DELAY_MS * 2);
    });

    expect(options.scanAndConnect).toHaveBeenCalledTimes(1);
    expect(options.cancelNativeScan).not.toHaveBeenCalled();
    expect(result.current.isContinuousNativeScanActive).toBe(false);
  });

  it('stops an unattended native scan after the total energy budget', async () => {
    vi.useFakeTimers();
    const options = createOptions({
      scanAndConnect: vi.fn(() => new Promise<void>(() => undefined)),
    });
    const { result } = renderHook(() => useContinuousNativeBleScan(options));

    act(() => {
      result.current.beginContinuousNativeScan();
    });
    expect(result.current.isContinuousNativeScanActive).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NATIVE_BLE_SCAN_TOTAL_TIMEOUT_MS);
    });

    expect(result.current.isContinuousNativeScanActive).toBe(false);
    expect(options.cancelNativeScan).toHaveBeenCalledOnce();
  });

  it('stops native scan immediately when the app becomes hidden', () => {
    const options = createOptions({
      scanAndConnect: vi.fn(() => new Promise<void>(() => undefined)),
    });
    const { result } = renderHook(() => useContinuousNativeBleScan(options));

    act(() => {
      result.current.beginContinuousNativeScan();
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.isContinuousNativeScanActive).toBe(false);
    expect(options.cancelNativeScan).toHaveBeenCalledOnce();
  });
});
