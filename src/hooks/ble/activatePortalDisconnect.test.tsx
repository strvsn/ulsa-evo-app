import { act, renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IBLEAdapter } from '../../services/ble';
import type { OtaControlStatus } from '../../types/ble';
import { isExpectedActivatePortalDisconnect } from './activatePortalDisconnect';
import { useBLEOtaControl } from './useBLEOtaControl';
import { useBLEStm32UpdateControl } from './useBLEStm32UpdateControl';

const createAdapterRef = (adapter: Partial<IBLEAdapter>): MutableRefObject<IBLEAdapter | null> => ({
  current: adapter as IBLEAdapter,
});

describe('isExpectedActivatePortalDisconnect', () => {
  it('matches only activatePortal disconnect-like errors', () => {
    expect(isExpectedActivatePortalDisconnect('activatePortal', new Error('GATT Server is disconnected'))).toBe(true);
    expect(isExpectedActivatePortalDisconnect('activatePortal', new DOMException('Device lost', 'NetworkError'))).toBe(true);
    expect(isExpectedActivatePortalDisconnect('preparePortal', new Error('GATT Server is disconnected'))).toBe(false);
    expect(isExpectedActivatePortalDisconnect('activatePortal', new Error('manifest signature failed'))).toBe(false);
  });
});

describe('activatePortal BLE disconnect handling', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('treats ESP32 OTA activatePortal disconnect as a SoftAP transition', async () => {
    const setError = vi.fn();
    const adapterRef = createAdapterRef({
      writeOtaControl: vi.fn().mockRejectedValue(new Error('GATT Server is disconnected')),
    });
    const { result } = renderHook(() =>
      useBLEOtaControl({ adapterRef, connectionState: 'connected', setError })
    );

    let status: Awaited<ReturnType<typeof result.current.writeOtaControl>> | undefined;
    await act(async () => {
      status = await result.current.writeOtaControl('activatePortal');
    });

    expect(status).toBeNull();
    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith(null);
    expect(console.warn).toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('still reports non-transition ESP32 OTA errors', async () => {
    const setError = vi.fn();
    const adapterRef = createAdapterRef({
      writeOtaControl: vi.fn().mockRejectedValue(new Error('manifest signature failed')),
    });
    const { result } = renderHook(() =>
      useBLEOtaControl({ adapterRef, connectionState: 'connected', setError })
    );

    await act(async () => {
      await result.current.writeOtaControl('activatePortal');
    });

    expect(setError).toHaveBeenLastCalledWith('manifest signature failed');
    expect(console.error).toHaveBeenCalled();
  });

  it('treats STM32 activatePortal disconnect as a SoftAP transition', async () => {
    const setError = vi.fn();
    const adapterRef = createAdapterRef({
      writeStm32UpdateControl: vi.fn().mockRejectedValue(new DOMException('Device is no longer connected', 'NetworkError')),
    });
    const { result } = renderHook(() =>
      useBLEStm32UpdateControl({ adapterRef, connectionState: 'connected', setError })
    );

    let status: Awaited<ReturnType<typeof result.current.writeStm32UpdateControl>> | undefined;
    await act(async () => {
      status = await result.current.writeStm32UpdateControl('activatePortal');
    });

    expect(status).toBeNull();
    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith(null);
    expect(console.warn).toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('does not hide STM32 non-activate disconnect errors', async () => {
    const setError = vi.fn();
    const adapterRef = createAdapterRef({
      writeStm32UpdateControl: vi.fn().mockRejectedValue(new Error('GATT Server is disconnected')),
    });
    const { result } = renderHook(() =>
      useBLEStm32UpdateControl({ adapterRef, connectionState: 'connected', setError })
    );

    await act(async () => {
      await result.current.writeStm32UpdateControl('preparePortal');
    });

    expect(setError).toHaveBeenLastCalledWith('GATT Server is disconnected');
    expect(console.error).toHaveBeenCalled();
  });

  it('treats physical authorization waiting as an expected non-error result', async () => {
    const pending = {
      protocolVersion: 3,
      result: 'authorizationRequired',
      physicalAuthRequired: true,
      hasCredentials: false,
    } as OtaControlStatus;
    const otaSetError = vi.fn();
    const stm32SetError = vi.fn();
    const ota = renderHook(() => useBLEOtaControl({
      adapterRef: createAdapterRef({ writeOtaControl: vi.fn().mockResolvedValue(pending) }),
      connectionState: 'connected',
      setError: otaSetError,
    }));
    const stm32 = renderHook(() => useBLEStm32UpdateControl({
      adapterRef: createAdapterRef({ writeStm32UpdateControl: vi.fn().mockResolvedValue(pending) }),
      connectionState: 'connected',
      setError: stm32SetError,
    }));

    await act(async () => {
      expect(await ota.result.current.writeOtaControl('preparePortal')).toBe(pending);
      expect(await stm32.result.current.writeStm32UpdateControl('preparePortal')).toBe(pending);
    });
    expect(otaSetError).toHaveBeenCalledTimes(1);
    expect(otaSetError).toHaveBeenLastCalledWith(null);
    expect(stm32SetError).toHaveBeenCalledTimes(1);
    expect(stm32SetError).toHaveBeenLastCalledWith(null);
  });
});
