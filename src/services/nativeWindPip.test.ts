import { beforeEach, describe, expect, it, vi } from 'vitest';

const pluginMock = vi.hoisted(() => ({
  isSupported: vi.fn(),
  start: vi.fn(),
  update: vi.fn(),
  stop: vi.fn(),
  addListener: vi.fn(),
}));

const capacitorMock = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  getPlatform: vi.fn(() => 'ios'),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitorMock,
  registerPlugin: vi.fn(() => pluginMock),
}));

import {
  getNativeWindPipSupport,
  isNativeWindPipAvailable,
  startNativeWindPip,
  subscribeToNativeWindPipRestore,
  updateNativeWindPip,
  type WindPipSnapshot,
} from './nativeWindPip';

const snapshot: WindPipSnapshot = {
  windSpeedMps: 1.25,
  windDirectionDegrees: 275,
  temperatureCelsius: 23.4,
  soundSpeedMps: 345.6,
  headingSpeedMps: -0.31,
  windSpeedAverage10mMps: 1.18,
  windSpeedUnit: 'm/s',
  dataState: 'live',
  cardLogState: 'recording',
  appLogState: 'ready',
  themeVariant: 'graphite',
  isLightTheme: false,
  capturedAtMs: 1234,
};

describe('nativeWindPip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capacitorMock.isNativePlatform.mockReturnValue(true);
    capacitorMock.getPlatform.mockReturnValue('ios');
  });

  it('exposes the native plugin only on Capacitor iOS', async () => {
    pluginMock.isSupported.mockResolvedValue({ supported: true, possible: true, active: false });

    expect(isNativeWindPipAvailable()).toBe(true);
    await expect(getNativeWindPipSupport()).resolves.toEqual({ supported: true, possible: true, active: false });

    capacitorMock.getPlatform.mockReturnValue('android');
    expect(isNativeWindPipAvailable()).toBe(false);
    await expect(getNativeWindPipSupport()).resolves.toEqual({ supported: false, possible: false, active: false });
  });

  it('forwards live snapshots without inventing sensor values', async () => {
    pluginMock.start.mockResolvedValue({ supported: true, possible: true, active: true, phase: 'active' });
    pluginMock.update.mockResolvedValue({ supported: true, possible: true, active: true, phase: 'active' });

    await startNativeWindPip(snapshot);
    await updateNativeWindPip({
      ...snapshot,
      dataState: 'stale',
      windSpeedMps: null,
      windDirectionDegrees: null,
      temperatureCelsius: null,
      soundSpeedMps: null,
      headingSpeedMps: null,
      windSpeedAverage10mMps: null,
      cardLogState: 'error',
      cardLogDetail: '書込遅延',
    });

    expect(pluginMock.start).toHaveBeenCalledWith(snapshot);
    expect(pluginMock.update).toHaveBeenCalledWith(expect.objectContaining({
      dataState: 'stale',
      windSpeedMps: null,
      windDirectionDegrees: null,
      temperatureCelsius: null,
      soundSpeedMps: null,
      headingSpeedMps: null,
      windSpeedAverage10mMps: null,
      cardLogState: 'error',
      cardLogDetail: '書込遅延',
      appLogState: 'ready',
    }));
  });

  it('does not register native listeners on the web', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(false);
    await expect(subscribeToNativeWindPipRestore(vi.fn())).resolves.toBeNull();
    expect(pluginMock.addListener).not.toHaveBeenCalled();
  });
});
