import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  getPlatform: vi.fn(() => 'ios'),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: platform }));

import { isNativeIosApp, isNativeIosDevice } from './nativeRuntime';
import { detectBLEPlatform } from './ble/platformDetector';
import { isNativeDeviceOrientationAutoFlipAllowed } from '../pages/dashboard/nativeDeviceOrientation';

describe('native runtime host boundary', () => {
  beforeEach(() => {
    platform.isNativePlatform.mockReset().mockReturnValue(true);
    platform.getPlatform.mockReset().mockReturnValue('ios');
    window.__ULSA_NATIVE_RUNTIME = { isIOSAppOnMac: false };
  });
  afterEach(() => { window.__ULSA_NATIVE_RUNTIME = { isIOSAppOnMac: false }; });

  it('keeps iPhone/iPad device-only features and the native BLE adapter', () => {
    expect(isNativeIosApp()).toBe(true);
    expect(isNativeIosDevice()).toBe(true);
    expect(isNativeDeviceOrientationAutoFlipAllowed()).toBe(true);
    expect(detectBLEPlatform()).toBe('capacitor');
  });

  it('keeps Mac BLE native while disabling device-only orientation', () => {
    window.__ULSA_NATIVE_RUNTIME = { isIOSAppOnMac: true };
    expect(isNativeIosApp()).toBe(true);
    expect(isNativeIosDevice()).toBe(false);
    expect(isNativeDeviceOrientationAutoFlipAllowed()).toBe(false);
    expect(detectBLEPlatform()).toBe('capacitor');
  });

  it('fails closed for device-only APIs when the native host payload is missing', () => {
    delete window.__ULSA_NATIVE_RUNTIME;
    expect(isNativeIosDevice()).toBe(false);
    expect(isNativeDeviceOrientationAutoFlipAllowed()).toBe(false);
    expect(detectBLEPlatform()).toBe('capacitor');
  });

  it('does not interpret malformed native values as an iPhone', () => {
    window.__ULSA_NATIVE_RUNTIME = { isIOSAppOnMac: 'false' } as unknown as NonNullable<Window['__ULSA_NATIVE_RUNTIME']>;
    expect(isNativeIosDevice()).toBe(false);
  });

  it.each(['web', 'android'])('never enables iOS device-only APIs on %s', (name) => {
    platform.getPlatform.mockReturnValue(name);
    expect(isNativeIosApp()).toBe(false);
    expect(isNativeIosDevice()).toBe(false);
  });

  it('does not turn a browser into a native device using the host payload', () => {
    platform.isNativePlatform.mockReturnValue(false);
    expect(isNativeIosDevice()).toBe(false);
    expect(isNativeIosApp()).toBe(false);
  });

  it('handles a platform detection error without enabling device-only APIs', () => {
    platform.getPlatform.mockImplementation(() => { throw new Error('bridge unavailable'); });
    expect(isNativeIosApp()).toBe(false);
    expect(isNativeIosDevice()).toBe(false);
  });

  it('publishes the authoritative native host before app JavaScript on each navigation', () => {
    const source = readFileSync('ios/App/App/ULSAEvoBridgeViewController.swift', 'utf8');
    expect(source).toContain('ProcessInfo.processInfo.isiOSAppOnMac');
    expect(source).toContain('window.__ULSA_NATIVE_RUNTIME = Object.freeze(');
    expect(source).toContain('injectionTime: .atDocumentStart');
    expect(source).toContain('forMainFrameOnly: true');
    expect(source).toContain('webView?.configuration.userContentController.addUserScript(runtimeScript)');
    // Capacitor replaces the configuration's content controller during loadView;
    // injection must use the final controller, before the document is loaded.
    const hook = source.slice(source.indexOf('override func capacitorDidLoad()'), source.indexOf('override func viewDidAppear'));
    expect(hook).toContain('addUserScript(runtimeScript)');
  });

  it('bounds Mac viewport publication without changing the iPhone/iPad path', () => {
    const source = readFileSync('ios/App/App/ULSAEvoBridgeViewController.swift', 'utf8');
    expect(source).toContain('if ProcessInfo.processInfo.isiOSAppOnMac {\n            if macScreenMetricsInFlight');
    expect(source).toContain('macPendingScreenMetricsSource = source');
    expect(source).toContain('self.macScreenMetricsInFlight = false');
    expect(source).toContain('if error == nil, let pending');
    expect(source).toContain('self.publishScreenMetrics(source: pending)');
  });
});
