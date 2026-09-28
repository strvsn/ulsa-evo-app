import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IBLEAdapter } from '../../services/ble';
import type { DeviceInfo, Stm32FirmwareVersionStatus } from '../../types/ble';
import type { BLEConnectionState } from './types';
import { useBLEFirmwareInfoRefresh } from './useBLEFirmwareInfoRefresh';

const info: DeviceInfo = { firmwareRevision: '1.0.2', softwareRevision: 'demo', manufacturerName: 'STRVSN', modelNumber: 'ULSA EVO' };
const version = { readOk: true, firmwareVersion: '1.0.1' } as Stm32FirmwareVersionStatus;
const fixture = () => {
  const adapter = { getDeviceInfo: vi.fn().mockResolvedValue(info), getStm32FirmwareVersion: vi.fn().mockResolvedValue(version) };
  return {
    adapter,
    options: {
      adapterRef: { current: adapter as unknown as IBLEAdapter },
      connectionState: 'connected' as BLEConnectionState,
      connectionSessionRef: { current: 1 },
      setDeviceInfo: vi.fn(), updateStm32FirmwareVersion: vi.fn(), setStm32FirmwareVersionLastReadAt: vi.fn(),
    },
  };
};
afterEach(() => vi.useRealTimers());

describe('manual firmware information refresh', () => {
  it('reads ESP32 Device Information and then STM32 without starting an update', async () => {
    const { adapter, options } = fixture();
    const { result } = renderHook(() => useBLEFirmwareInfoRefresh(options));
    await act(async () => { await result.current.refreshFirmwareVersions(); });
    expect(options.setDeviceInfo).toHaveBeenCalledWith(info);
    expect(options.updateStm32FirmwareVersion).toHaveBeenCalledWith(version);
    expect(adapter.getDeviceInfo.mock.invocationCallOrder[0]).toBeLessThan(adapter.getStm32FirmwareVersion.mock.invocationCallOrder[0]);
    expect(result.current.firmwareInfoBusy).toBe(false);
    expect(result.current.firmwareInfoError).toBeNull();
  });

  it('does not read either firmware while disconnected', async () => {
    const { adapter, options } = fixture();
    const { result } = renderHook(() => useBLEFirmwareInfoRefresh({ ...options, connectionState: 'disconnected' }));
    await act(async () => { await result.current.refreshFirmwareVersions(); });
    expect(adapter.getDeviceInfo).not.toHaveBeenCalled();
    expect(adapter.getStm32FirmwareVersion).not.toHaveBeenCalled();
  });

  it.each(['empty', 'rejected'])('shows an ESP32 failure while still attempting STM32 (%s)', async (failure) => {
    const { adapter, options } = fixture();
    if (failure === 'empty') adapter.getDeviceInfo.mockResolvedValue({ ...info, firmwareRevision: '' });
    else adapter.getDeviceInfo.mockRejectedValue(new Error('GATT read failed'));
    const { result } = renderHook(() => useBLEFirmwareInfoRefresh(options));
    await act(async () => { await result.current.refreshFirmwareVersions(); });
    expect(adapter.getStm32FirmwareVersion).toHaveBeenCalledOnce();
    expect(result.current.firmwareInfoError).toContain('ESP32のバージョンを取得できません');
    expect(result.current.firmwareInfoBusy).toBe(false);
  });

  it('identifies an unavailable STM32 version without losing ESP32 information', async () => {
    const { adapter, options } = fixture();
    adapter.getStm32FirmwareVersion.mockResolvedValue(null);
    const { result } = renderHook(() => useBLEFirmwareInfoRefresh(options));
    await act(async () => { await result.current.refreshFirmwareVersions(); });
    expect(options.setDeviceInfo).toHaveBeenCalledWith(info);
    expect(result.current.firmwareInfoError).toContain('STM32のバージョンを取得できません');
  });

  it('suppresses double clicks and clears a previous error on successful retry', async () => {
    const { adapter, options } = fixture();
    adapter.getDeviceInfo.mockRejectedValueOnce(new Error('read failed'));
    const { result } = renderHook(() => useBLEFirmwareInfoRefresh(options));
    await act(async () => { await result.current.refreshFirmwareVersions(); });
    expect(result.current.firmwareInfoError).not.toBeNull();
    let resolveInfo!: (value: DeviceInfo) => void;
    adapter.getDeviceInfo.mockReturnValueOnce(new Promise((resolve) => { resolveInfo = resolve; }));
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.refreshFirmwareVersions(); });
    expect(result.current.firmwareInfoBusy).toBe(true);
    await act(async () => { await result.current.refreshFirmwareVersions(); });
    expect(adapter.getDeviceInfo).toHaveBeenCalledTimes(2);
    await act(async () => { resolveInfo(info); await refresh; });
    expect(result.current.firmwareInfoError).toBeNull();
    expect(result.current.firmwareInfoBusy).toBe(false);
  });

  it('bounds an ESP32 read and ignores its late result', async () => {
    vi.useFakeTimers();
    const { adapter, options } = fixture();
    let resolveInfo!: (value: DeviceInfo) => void;
    adapter.getDeviceInfo.mockReturnValue(new Promise((resolve) => { resolveInfo = resolve; }));
    const { result } = renderHook(() => useBLEFirmwareInfoRefresh(options));
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.refreshFirmwareVersions(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); await refresh; });
    expect(adapter.getStm32FirmwareVersion).toHaveBeenCalledOnce();
    expect(result.current.firmwareInfoBusy).toBe(false);
    expect(result.current.firmwareInfoError).toContain('ESP32');
    await act(async () => { resolveInfo(info); });
    expect(options.setDeviceInfo).not.toHaveBeenCalled();
  });

  it('discards ESP32 results after disconnect and releases the button', async () => {
    const { adapter, options } = fixture();
    let resolveInfo!: (value: DeviceInfo) => void;
    adapter.getDeviceInfo.mockReturnValue(new Promise((resolve) => { resolveInfo = resolve; }));
    const { result, rerender } = renderHook((state: BLEConnectionState) => useBLEFirmwareInfoRefresh({ ...options, connectionState: state }), { initialProps: 'connected' as BLEConnectionState });
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.refreshFirmwareVersions(); });
    options.connectionSessionRef.current += 1;
    rerender('disconnected');
    await act(async () => { resolveInfo(info); await refresh; });
    expect(options.setDeviceInfo).not.toHaveBeenCalled();
    expect(adapter.getStm32FirmwareVersion).not.toHaveBeenCalled();
    expect(result.current.firmwareInfoBusy).toBe(false);
  });

  it('does not apply an old STM32 read over the next connection', async () => {
    const { adapter, options } = fixture();
    let resolveOld!: (value: Stm32FirmwareVersionStatus) => void;
    adapter.getStm32FirmwareVersion.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    const { result } = renderHook(() => useBLEFirmwareInfoRefresh(options));
    let old!: Promise<void>;
    act(() => { old = result.current.refreshStm32FirmwareVersion(); });
    options.connectionSessionRef.current += 1;
    await act(async () => { await result.current.refreshStm32FirmwareVersion(); });
    await act(async () => { resolveOld({ ...version, firmwareVersion: '0.9.0' }); await old; });
    expect(options.updateStm32FirmwareVersion).toHaveBeenCalledTimes(1);
    expect(options.updateStm32FirmwareVersion).toHaveBeenCalledWith(version);
  });
});
