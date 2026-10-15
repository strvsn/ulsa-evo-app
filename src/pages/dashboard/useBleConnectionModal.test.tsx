import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBleConnectionModal } from './useBleConnectionModal';
import { NATIVE_BLE_SCAN_TOTAL_TIMEOUT_MS } from './useContinuousNativeBleScan';

type Options = Parameters<typeof useBleConnectionModal>[0];

const createOptions = (overrides: Partial<Options> = {}): Options => ({
  connectionState: 'disconnected',
  availableDevices: [],
  error: null,
  platformInfo: { platform: 'ios', adapterType: 'Capacitor', isSupported: true },
  scanAndConnect: vi.fn().mockResolvedValue(undefined),
  cancelScan: vi.fn().mockResolvedValue(undefined),
  connectToDevice: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('useBleConnectionModal', () => {
  afterEach(() => vi.useRealTimers());

  it('hands explicit early selection to the connection owner while scan shutdown is pending', async () => {
    vi.useFakeTimers();
    let finishScan!: () => void;
    let finishStop!: () => void;
    const options = createOptions({
      scanAndConnect: vi.fn(() => new Promise<void>((resolve) => { finishScan = resolve; })),
      cancelScan: vi.fn(() => new Promise<void>((resolve) => { finishStop = resolve; })),
    });
    const { result, rerender } = renderHook((props) => useBleConnectionModal(props), {
      initialProps: options,
    });
    act(() => result.current.handleStatusCardClick());
    const device = { deviceId: 'device-b', name: 'ULSA EVO #2' };
    rerender({ ...options, connectionState: 'scanning', availableDevices: [device] });
    expect(options.cancelScan).not.toHaveBeenCalled();
    expect(options.connectToDevice).not.toHaveBeenCalled();

    act(() => result.current.handleConnectToBleDevice(device));
    expect(options.cancelScan).toHaveBeenCalledOnce();
    // The existing connection action must synchronously reserve the selected
    // device; that action owns the awaited native shutdown barrier.
    expect(options.connectToDevice).toHaveBeenCalledOnce();
    expect(options.connectToDevice).toHaveBeenCalledWith(device);
    expect(result.current.isContinuousNativeScanActive).toBe(false);
    expect(result.current.showBLEModal).toBe(true);
    rerender({ ...options, connectionState: 'connecting', availableDevices: [device] });
    expect(result.current.showBLEModal).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NATIVE_BLE_SCAN_TOTAL_TIMEOUT_MS + 1);
    });
    expect(options.scanAndConnect).toHaveBeenCalledOnce();
    expect(options.cancelScan).toHaveBeenCalledOnce();
    await act(async () => { finishStop(); finishScan(); });
    rerender({ ...options, connectionState: 'connected', availableDevices: [] });
    expect(result.current.showBLEModal).toBe(false);
  });

  it('keeps the dialog open after selection fails so a retained candidate can be retried', async () => {
    const device = { deviceId: 'device-a', name: 'ULSA EVO #1' };
    const options = createOptions({ availableDevices: [device] });
    const { result, rerender } = renderHook((props) => useBleConnectionModal(props), {
      initialProps: options,
    });
    await act(async () => result.current.handleStatusCardClick());
    await act(async () => result.current.handleConnectToBleDevice(device));
    rerender({ ...options, error: '接続に失敗しました' });
    expect(result.current.showBLEModal).toBe(true);
    await act(async () => result.current.handleConnectToBleDevice(device));
    expect(options.connectToDevice).toHaveBeenCalledTimes(2);
    expect(options.connectToDevice).toHaveBeenLastCalledWith(device);
  });

  it('cancels search on dismissal without connecting a discovered candidate', async () => {
    let finishScan!: () => void;
    const options = createOptions({
      scanAndConnect: vi.fn(() => new Promise<void>((resolve) => { finishScan = resolve; })),
    });
    const { result, rerender } = renderHook((props) => useBleConnectionModal(props), {
      initialProps: options,
    });
    act(() => result.current.handleStatusCardClick());
    rerender({ ...options, connectionState: 'scanning',
      availableDevices: [{ deviceId: 'device-a', name: 'ULSA EVO #1' }] });
    act(() => result.current.handleBLEModalDismiss());
    expect(result.current.showBLEModal).toBe(false);
    expect(result.current.isContinuousNativeScanActive).toBe(false);
    expect(options.cancelScan).toHaveBeenCalledOnce();
    expect(options.connectToDevice).not.toHaveBeenCalled();
    await act(async () => finishScan());
  });

  it('keeps Web Bluetooth as one chooser action without selecting a retained card automatically', async () => {
    const options = createOptions({
      availableDevices: [{ deviceId: 'device-a', name: 'ULSA EVO #1' }],
      platformInfo: { platform: 'web', adapterType: 'WebBluetooth', isSupported: true },
    });
    const { result } = renderHook(() => useBleConnectionModal(options));
    await act(async () => result.current.handleStatusCardClick());
    expect(options.scanAndConnect).toHaveBeenCalledOnce();
    expect(options.cancelScan).not.toHaveBeenCalled();
    expect(options.connectToDevice).not.toHaveBeenCalled();
    expect(result.current.isContinuousNativeScanActive).toBe(false);
  });
});
