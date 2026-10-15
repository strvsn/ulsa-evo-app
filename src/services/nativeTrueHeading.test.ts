import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const capacitorMock = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(),
}));
const pluginMock = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  addListener: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitorMock,
  registerPlugin: vi.fn(() => pluginMock),
}));

import {
  isNativeTrueHeadingAvailable,
  startTrueHeading,
  stopTrueHeading,
  subscribeToTrueNavigation,
  subscribeToTrueHeading,
} from './nativeTrueHeading';

describe('nativeTrueHeading', () => {
  afterEach(() => { window.__ULSA_NATIVE_RUNTIME = { isIOSAppOnMac: false }; });

  it('never starts heading or navigation on Mac even when Capacitor reports iOS', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(true);
    capacitorMock.getPlatform.mockReturnValue('ios');
    window.__ULSA_NATIVE_RUNTIME = { isIOSAppOnMac: true };
    expect(isNativeTrueHeadingAvailable()).toBe(false);
    await expect(startTrueHeading({ navigationMode: true })).resolves.toMatchObject({
      authorization: 'unsupported', available: false,
    });
    await stopTrueHeading();
    await expect(subscribeToTrueNavigation(vi.fn())).resolves.toBeNull();
    await expect(subscribeToTrueHeading(vi.fn())).resolves.toBeNull();
    expect(pluginMock.start).not.toHaveBeenCalled();
    expect(pluginMock.stop).not.toHaveBeenCalled();
    expect(pluginMock.addListener).not.toHaveBeenCalled();
  });
  it('keeps the measured heading on the fixed hardware-top axis, not physical display posture', () => {
    const nativeSource = readFileSync('ios/App/App/ULSATrueHeadingPlugin.swift', 'utf8');
    expect(nativeSource).toContain('locationManager.headingOrientation = .portrait');
    expect(nativeSource).not.toContain('UIDevice.current.orientation');
    expect(nativeSource).not.toContain('orientationDidChangeNotification');
    const screenSource = readFileSync('ios/App/App/ULSAEvoBridgeViewController.swift', 'utf8');
    expect(screenSource).toContain('view.window?.windowScene?.interfaceOrientation ?? .portrait');
    expect(screenSource).toContain('case .landscapeLeft: return 270');
    expect(screenSource).toContain('case .landscapeRight: return 90');
  });

  beforeEach(() => {
    capacitorMock.isNativePlatform.mockReset();
    capacitorMock.getPlatform.mockReset();
    pluginMock.start.mockReset();
    pluginMock.stop.mockReset();
    pluginMock.addListener.mockReset();
  });

  it('does not invoke a native bridge outside the iOS Capacitor app', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(false);

    expect(isNativeTrueHeadingAvailable()).toBe(false);
    await expect(startTrueHeading()).resolves.toMatchObject({
      available: false,
      authorization: 'unsupported',
    });
    await stopTrueHeading();
    await expect(subscribeToTrueHeading(vi.fn())).resolves.toBeNull();
    await expect(subscribeToTrueNavigation(vi.fn())).resolves.toBeNull();
    expect(pluginMock.start).not.toHaveBeenCalled();
    expect(pluginMock.stop).not.toHaveBeenCalled();
    expect(pluginMock.addListener).not.toHaveBeenCalled();
  });

  it('uses the registered bridge only for Capacitor iOS', async () => {
    const listener = vi.fn();
    const handle = { remove: vi.fn() };
    capacitorMock.isNativePlatform.mockReturnValue(true);
    capacitorMock.getPlatform.mockReturnValue('ios');
    pluginMock.start.mockResolvedValue({
      trueHeading: null,
      headingAccuracy: null,
      available: false,
      authorization: 'authorized',
    });
    pluginMock.stop.mockResolvedValue({ stopped: true });
    pluginMock.addListener.mockResolvedValue(handle);

    await expect(startTrueHeading()).resolves.toMatchObject({ authorization: 'authorized' });
    await subscribeToTrueHeading(listener);
    await stopTrueHeading();

    expect(pluginMock.start).toHaveBeenCalledOnce();
    expect(pluginMock.addListener).toHaveBeenCalledWith('headingChanged', listener);
    expect(pluginMock.stop).toHaveBeenCalledOnce();
  });

  it('enables navigation mode and subscribes to the unified GNSS update event', async () => {
    const listener = vi.fn();
    const handle = { remove: vi.fn() };
    capacitorMock.isNativePlatform.mockReturnValue(true);
    capacitorMock.getPlatform.mockReturnValue('ios');
    pluginMock.start.mockResolvedValue({
      trueHeading: null,
      headingAccuracy: null,
      available: false,
      authorization: 'authorized',
    });
    pluginMock.addListener.mockResolvedValue(handle);

    await startTrueHeading({ navigationMode: true });
    await expect(subscribeToTrueNavigation(listener)).resolves.toBe(handle);

    expect(pluginMock.start).toHaveBeenCalledWith({ navigationMode: true });
    expect(pluginMock.addListener).toHaveBeenCalledWith('navigationChanged', listener);
  });
});
