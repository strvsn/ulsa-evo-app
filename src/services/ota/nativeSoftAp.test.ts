import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  probeInitialPortal: vi.fn(),
  removeConfiguration: vi.fn(),
  isNativePlatform: vi.fn(() => true),
  getPlatform: vi.fn(() => 'ios'),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
    getPlatform: mocks.getPlatform,
  },
  registerPlugin: () => ({
    connect: mocks.connect,
    probeInitialPortal: mocks.probeInitialPortal,
    removeConfiguration: mocks.removeConfiguration,
  }),
}));

import {
  connectToEsp32SoftAp,
  connectToInitialSoftApWithTimeout,
  describeNativeSoftApJoinFailure,
  probeInitialPortalFromIos,
  shouldRetryNativeSoftApJoin,
} from './nativeSoftAp';

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('nativeSoftAp', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue('ios');
  });

  it('uses join-once credentials without issuing a separate removal request', async () => {
    mocks.connect.mockResolvedValue({
      ssid: 'ULSA-EVO-OTA-A3F',
      connected: true,
      reason: 'connected',
    });

    await expect(connectToEsp32SoftAp({
      ssid: 'ULSA-EVO-OTA-A3F',
      password: 'session-password',
    })).resolves.toMatchObject({ connected: true });

    expect(mocks.connect).toHaveBeenCalledWith({
      ssid: 'ULSA-EVO-OTA-A3F',
      password: 'session-password',
      joinOnce: true,
    });
    expect(mocks.removeConfiguration).not.toHaveBeenCalled();
  });

  it('prevents overlapping native join requests and allows an explicit later retry', async () => {
    const deferred = createDeferred<{ ssid: string; connected: boolean; reason: string }>();
    mocks.connect
      .mockReturnValueOnce(deferred.promise)
      .mockResolvedValueOnce({ ssid: 'ULSA-EVO-OTA-A3F', connected: true, reason: 'connected' });

    const first = connectToEsp32SoftAp({ ssid: 'ULSA-EVO-OTA-A3F', password: 'session-password' });
    await expect(connectToEsp32SoftAp({ ssid: 'ULSA-EVO-OTA-A3F', password: 'session-password' }))
      .resolves.toMatchObject({ connected: false, reason: 'pending' });
    expect(mocks.connect).toHaveBeenCalledOnce();

    deferred.resolve({ ssid: 'ULSA-EVO-OTA-A3F', connected: false, reason: 'userDenied' });
    await first;
    await connectToEsp32SoftAp({ ssid: 'ULSA-EVO-OTA-A3F', password: 'session-password' });
    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });

  it('bounds a stalled Initial join without issuing an overlapping native request', async () => {
    vi.useFakeTimers();
    const deferred = createDeferred<{ ssid: string; connected: boolean }>();
    mocks.connect.mockReturnValueOnce(deferred.promise);
    try {
      const result = connectToInitialSoftApWithTimeout({ ssid: 'ULSA-EVO-INITIAL', password: '' }, 20_000);
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(result).resolves.toMatchObject({ connected: false, reason: 'timeout' });
      expect(mocks.connect).toHaveBeenCalledOnce();
      expect(describeNativeSoftApJoinFailure({ ssid: 'ULSA-EVO-INITIAL', connected: false, reason: 'timeout' }, true))
        .toContain('手動で接続');
    } finally {
      deferred.resolve({ ssid: 'ULSA-EVO-INITIAL', connected: false });
      await Promise.resolve();
      vi.useRealTimers();
    }
  });

  it('probes only through the iOS native plugin and preserves a bounded result', async () => {
    mocks.probeInitialPortal.mockResolvedValue({ reachable: false, reason: 'nativeNetworkError', errorCode: -1009 });
    await expect(probeInitialPortalFromIos()).resolves.toEqual({
      reachable: false, reason: 'nativeNetworkError', errorCode: -1009,
    });
    expect(mocks.probeInitialPortal).toHaveBeenCalledOnce();
    mocks.isNativePlatform.mockReturnValue(false);
    await expect(probeInitialPortalFromIos()).resolves.toMatchObject({ reason: 'unsupported' });
    expect(mocks.probeInitialPortal).toHaveBeenCalledOnce();
  });

  it('bounds a native portal probe that never returns', async () => {
    vi.useFakeTimers();
    const deferred = createDeferred<{ reachable: boolean }>();
    mocks.probeInitialPortal.mockReturnValue(deferred.promise);
    try {
      const result = probeInitialPortalFromIos();
      await vi.advanceTimersByTimeAsync(7_000);
      await expect(result).resolves.toMatchObject({ reachable: false, reason: 'probeTimeout' });
    } finally {
      deferred.resolve({ reachable: false });
      vi.useRealTimers();
    }
  });

  it('keeps user denial explicit and includes the native error code', () => {
    const result = {
      ssid: 'ULSA-EVO-OTA-A3F',
      connected: false,
      reason: 'userDenied',
      errorDomain: 'NEHotspotConfigurationErrorDomain',
      errorCode: 7,
    };

    expect(describeNativeSoftApJoinFailure(result)).toContain('キャンセル');
    expect(describeNativeSoftApJoinFailure(result)).toContain('code 7');
    expect(shouldRetryNativeSoftApJoin(result)).toBe(false);
    expect(describeNativeSoftApJoinFailure(result, true)).toContain('接続を再確認');
    expect(describeNativeSoftApJoinFailure(result, true)).not.toContain('BLE接続');
  });

  it.each(['pending', 'systemConfiguration', 'internal', 'unknown'])(
    'allows one caller-bounded retry for transient %s errors',
    (reason) => {
      expect(shouldRetryNativeSoftApJoin({
        ssid: 'ULSA-EVO-OTA-A3F',
        connected: false,
        reason,
      })).toBe(true);
    },
  );
});
