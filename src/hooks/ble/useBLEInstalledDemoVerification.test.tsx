import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IBLEAdapter } from '../../services/ble';
import { useBLEInstalledDemoVerification } from './useBLEInstalledDemoVerification';

const expected = {
  version: '1.0.0',
  revision: 123,
  commit: '0123456789abcdef0123456789abcdef01234567',
};

const adapter = (deviceCount = 1, softwareRevision = 'r123.g0123456789ab.demo') => ({
  scanDevices: vi.fn().mockResolvedValue(Array.from({ length: deviceCount }, (_, index) => ({
    deviceId: `device-${index}`,
    name: `ULSA EVO #${index}`,
  }))),
  getDeviceInfo: vi.fn().mockResolvedValue({
    firmwareRevision: '1.0.0',
    softwareRevision,
    manufacturerName: 'STRVSN',
    modelNumber: 'ULSA EVO',
  }),
  disconnect: vi.fn().mockResolvedValue(undefined),
}) as unknown as IBLEAdapter;

describe('installed Demo BLE verification', () => {
  it('connects the only candidate and verifies its identity', async () => {
    const mockAdapter = adapter();
    const connectToDevice = vi.fn().mockResolvedValue(undefined);
    const setDeviceInfo = vi.fn();
    const { result } = renderHook(() => useBLEInstalledDemoVerification({
      adapterRef: { current: mockAdapter },
      platformInfo: { platform: 'ios', adapterType: 'Capacitor', isSupported: true },
      connectToDevice,
      setDeviceInfo,
    }));
    await expect(result.current(expected)).resolves.toBeUndefined();
    expect(connectToDevice).toHaveBeenCalledOnce();
    expect(setDeviceInfo).toHaveBeenCalledOnce();
  });

  it('rejects multiple candidates and an identity mismatch', async () => {
    const multiple = renderHook(() => useBLEInstalledDemoVerification({
      adapterRef: { current: adapter(2) },
      platformInfo: { platform: 'ios', adapterType: 'Capacitor', isSupported: true },
      connectToDevice: vi.fn(),
      setDeviceInfo: vi.fn(),
    }));
    await expect(multiple.result.current(expected)).rejects.toThrow('複数');

    const mismatchAdapter = adapter(1, 'r124.g0123456789ab.demo');
    const mismatch = renderHook(() => useBLEInstalledDemoVerification({
      adapterRef: { current: mismatchAdapter },
      platformInfo: { platform: 'ios', adapterType: 'Capacitor', isSupported: true },
      connectToDevice: vi.fn().mockResolvedValue(undefined),
      setDeviceInfo: vi.fn(),
    }));
    await expect(mismatch.result.current(expected)).rejects.toThrow(
      '期待: FW=1.0.0, Build=r123.g0123456789ab.demo / ' +
      '実機: FW=1.0.0, Build=r124.g0123456789ab.demo'
    );
    expect(mismatchAdapter.disconnect).toHaveBeenCalledOnce();
  });

  it('reports missing identity fields as unverified rather than a firmware mismatch', async () => {
    const missingInfoAdapter = adapter(1);
    vi.mocked(missingInfoAdapter.getDeviceInfo).mockResolvedValue({
      firmwareRevision: '',
      softwareRevision: '',
      manufacturerName: '',
      modelNumber: '',
    });
    const { result } = renderHook(() => useBLEInstalledDemoVerification({
      adapterRef: { current: missingInfoAdapter },
      platformInfo: { platform: 'ios', adapterType: 'Capacitor', isSupported: true },
      connectToDevice: vi.fn().mockResolvedValue(undefined),
      setDeviceInfo: vi.fn(),
    }));
    await expect(result.current(expected)).rejects.toThrow('バージョン情報を読み取れず');
    expect(missingInfoAdapter.disconnect).toHaveBeenCalledOnce();
  });

  it('shows safe expected and actual identity details for trailing garbage', async () => {
    const trailingGarbage = '\u0000\ufffd\n<script>device-secret</script>';
    const actualSoftwareRevision = `r123.g0123456789ab.demo${trailingGarbage}`;
    const mismatchAdapter = adapter(1, actualSoftwareRevision);
    const { result } = renderHook(() => useBLEInstalledDemoVerification({
      adapterRef: { current: mismatchAdapter },
      platformInfo: { platform: 'ios', adapterType: 'Capacitor', isSupported: true },
      connectToDevice: vi.fn().mockResolvedValue(undefined),
      setDeviceInfo: vi.fn(),
    }));

    const error = await result.current(expected).then(
      () => null,
      (caught: unknown) => caught instanceof Error ? caught : null
    );
    expect(error?.message).toContain(
      '期待: FW=1.0.0, Build=r123.g0123456789ab.demo / ' +
      `実機: FW=1.0.0, Build=r123.g0123456789ab.demo + ` +
      `末尾に不要データ（${Array.from(trailingGarbage).length}文字）`
    );
    expect(error?.message).not.toContain('device-secret');
    expect(error?.message).not.toContain('\u0000');
    expect(error?.message).not.toContain('<script>');
    expect(mismatchAdapter.disconnect).toHaveBeenCalledOnce();
  });

  it('does not expose an unrecognized identity value', async () => {
    const privateSentinel = `private-value-${'x'.repeat(200)}`;
    const mismatchAdapter = adapter(1, privateSentinel);
    const { result } = renderHook(() => useBLEInstalledDemoVerification({
      adapterRef: { current: mismatchAdapter },
      platformInfo: { platform: 'ios', adapterType: 'Capacitor', isSupported: true },
      connectToDevice: vi.fn().mockResolvedValue(undefined),
      setDeviceInfo: vi.fn(),
    }));

    const error = await result.current(expected).then(
      () => null,
      (caught: unknown) => caught instanceof Error ? caught : null
    );
    expect(error?.message).toContain(
      `実機: FW=1.0.0, Build=判別不能（${Array.from(privateSentinel).length}文字）`
    );
    expect(error?.message).not.toContain(privateSentinel);
    expect(error?.message.length).toBeLessThan(240);
    expect(mismatchAdapter.disconnect).toHaveBeenCalledOnce();
  });

  it('uses the browser chooser, then verifies the same Demo identity on Web Bluetooth', async () => {
    const mockAdapter = {
      scanAndSelect: vi.fn().mockResolvedValue({
        deviceId: 'web-device',
        name: 'ULSA EVO #0',
        nodeId: 0,
      }),
      getDeviceInfo: vi.fn().mockResolvedValue({
        firmwareRevision: '1.0.0',
        softwareRevision: 'r123.g0123456789ab.demo',
        manufacturerName: 'STRVSN',
        modelNumber: 'ULSA EVO',
      }),
      disconnect: vi.fn().mockResolvedValue(undefined),
    } as unknown as IBLEAdapter;
    const connectToDevice = vi.fn().mockResolvedValue(undefined);
    const setDeviceInfo = vi.fn();
    const { result } = renderHook(() => useBLEInstalledDemoVerification({
      adapterRef: { current: mockAdapter },
      platformInfo: { platform: 'web', adapterType: 'WebBluetooth', isSupported: true },
      connectToDevice,
      setDeviceInfo,
    }));

    await expect(result.current(expected)).resolves.toBeUndefined();
    expect(mockAdapter.scanAndSelect).toHaveBeenCalledOnce();
    expect(connectToDevice).toHaveBeenCalledWith({
      deviceId: 'web-device',
      name: 'ULSA EVO #0',
      nodeId: 0,
      rssi: undefined,
    });
    expect(setDeviceInfo).toHaveBeenCalledOnce();
  });
});
