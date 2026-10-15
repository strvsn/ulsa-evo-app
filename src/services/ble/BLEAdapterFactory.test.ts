import { afterEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { getBLEPlatformInfo, resetBLEAdapter } from './BLEAdapterFactory';

const setNavigatorBluetooth = (available: boolean) => {
  if (available) {
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {},
    });
    return;
  }
  Reflect.deleteProperty(navigator, 'bluetooth');
};

const setNavigatorUserAgent = (userAgent: string) => {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
};

const setSecureContext = (secure: boolean) => {
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value: secure,
  });
};

describe('BLEAdapterFactory platform info', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetBLEAdapter();
    Reflect.deleteProperty(navigator, 'bluetooth');
  });

  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X)',
    'Mozilla/5.0 (iPad; CPU OS 27_0 like Mac OS X)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15',
  ])('reports the authoritative iOS host regardless of iPhone/iPad/Mac UA: %s', (ua) => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    setNavigatorUserAgent(ua);
    expect(getBLEPlatformInfo()).toMatchObject({ platform: 'ios', adapterType: 'Capacitor', isSupported: true });
  });

  it('keeps Android native classification independent of the UA', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    setNavigatorUserAgent('Mozilla/5.0 (iPhone)');
    expect(getBLEPlatformInfo()).toMatchObject({ platform: 'android', adapterType: 'Capacitor' });
  });

  it('reports secure Web Bluetooth availability for browser diagnostics', () => {
    setNavigatorBluetooth(true);
    setNavigatorUserAgent('Mozilla/5.0 Chrome/120.0.0.0');
    setSecureContext(true);

    expect(getBLEPlatformInfo()).toMatchObject({
      platform: 'web',
      adapterType: 'WebBluetooth',
      isSupported: true,
      browserName: 'Chrome',
      secureContext: true,
      webBluetoothAvailable: true,
      message: 'Web BLE API対応 (Chrome)',
    });
  });

  it('reports insecure non-Web-BLE browser diagnostics', () => {
    setNavigatorBluetooth(false);
    setNavigatorUserAgent('Mozilla/5.0 Safari/605.1.15');
    setSecureContext(false);

    expect(getBLEPlatformInfo()).toMatchObject({
      platform: 'unknown',
      adapterType: 'none',
      isSupported: false,
      browserName: 'Safari',
      secureContext: false,
      webBluetoothAvailable: false,
      message: 'BLE非対応ブラウザです (Safari)。Chrome または Edge をご使用ください。',
    });
  });
});
