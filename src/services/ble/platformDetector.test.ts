import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStm32WebUpdateUnavailableReason, readLocalNetworkAccessPermissionState } from './platformDetector';

const chrome = 'Mozilla/5.0 Chrome/142.0.0.0 Safari/537.36';
const browser = (userAgent = chrome, overrides: Record<string, unknown> = {}) => {
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { userAgent, bluetooth: {}, platform: 'MacIntel', maxTouchPoints: 0, ...overrides });
};

afterEach(() => vi.unstubAllGlobals());

describe('STM32 Web update support', () => {
  it.each([
    chrome,
    'Mozilla/5.0 Windows NT 10.0 Chrome/142.0.0.0 Edg/143.0.0.0',
    'Mozilla/5.0 Android 15 Chrome/142.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36',
  ])('allows supported Chrome/Edge with secure Web Bluetooth: %s', (ua) => {
    browser(ua);
    expect(getStm32WebUpdateUnavailableReason()).toBeNull();
  });

  it.each([
    'Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36',
    'Mozilla/5.0 Chrome/150.0.0.0 Edg/142.0.0.0',
    'Mozilla/5.0 Android 15 Chrome/150.0.0.0 EdgA/150.0.0.0',
    'Mozilla/5.0 Chrome/150.0.0.0 SamsungBrowser/30.0',
    'Mozilla/5.0 Chrome/150.0.0.0 OPR/125.0',
    'Mozilla/5.0 Firefox/150.0',
    'Mozilla/5.0 Safari/605.1.15',
  ])('does not mistake BLE or a Chrome token for LNA support: %s', (ua) => {
    browser(ua);
    expect(getStm32WebUpdateUnavailableReason()).toContain('Chrome 142以降／Edge 143以降');
  });

  it.each(['iPhone CriOS/150.0', 'iPad Safari/605.1', 'Bluefy Chrome/150.0'])('directs iOS Web users to the native app: %s', (ua) => {
    browser(ua);
    expect(getStm32WebUpdateUnavailableReason()).toContain('iOSアプリ');
  });

  it('detects an iPad requesting a desktop user agent', () => {
    browser(chrome, { maxTouchPoints: 5 });
    expect(getStm32WebUpdateUnavailableReason()).toContain('iPhone／iPad');
  });

  it('requires a secure context', () => {
    browser();
    vi.stubGlobal('isSecureContext', false);
    expect(getStm32WebUpdateUnavailableReason()).toContain('HTTPS');
  });

  it('requires a usable Web Bluetooth API', () => {
    browser(chrome, { bluetooth: undefined });
    expect(getStm32WebUpdateUnavailableReason()).toContain('Web Bluetooth');
  });

  it('fails closed without browser globals', () => {
    vi.stubGlobal('navigator', undefined);
    expect(getStm32WebUpdateUnavailableReason()).not.toBeNull();
  });
});

describe('Local Network Access permission', () => {
  it.each(['granted', 'prompt', 'denied'] as const)('reads %s without requesting network access', async (state) => {
    const query = vi.fn().mockResolvedValue({ state });
    browser(chrome, { permissions: { query } });
    expect(await readLocalNetworkAccessPermissionState()).toBe(state);
    expect(query).toHaveBeenCalledWith({ name: 'local-network-access' });
  });

  it('tolerates an unsupported permission name', async () => {
    browser(chrome, { permissions: { query: vi.fn().mockRejectedValue(new TypeError('Unknown permission')) } });
    expect(await readLocalNetworkAccessPermissionState()).toBeNull();
  });

  it('tolerates missing Permissions API support', async () => {
    browser();
    expect(await readLocalNetworkAccessPermissionState()).toBeNull();
  });
});
