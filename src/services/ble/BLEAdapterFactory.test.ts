import { afterEach, describe, expect, it } from 'vitest';
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
    resetBLEAdapter();
    Reflect.deleteProperty(navigator, 'bluetooth');
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
