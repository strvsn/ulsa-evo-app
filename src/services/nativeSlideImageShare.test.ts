import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  share: vi.fn(),
  isNativePlatform: vi.fn(() => true),
  getPlatform: vi.fn(() => 'ios'),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform, getPlatform: mocks.getPlatform },
  registerPlugin: () => ({ share: mocks.share }),
}));

import { isNativeSlideImageShareAvailable, shareNativeSlideImage } from './nativeSlideImageShare';

describe('native slide image sharing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue('ios');
  });

  it('sends the card rectangle to the iOS sharing bridge', async () => {
    const rect = { x: 15, y: 70, width: 350, height: 320 };
    mocks.share.mockResolvedValue({ completed: true });

    expect(isNativeSlideImageShareAvailable()).toBe(true);
    await expect(shareNativeSlideImage(rect)).resolves.toEqual({ completed: true });
    expect(mocks.share).toHaveBeenCalledWith(rect);
  });

  it('keeps the native-only gesture unavailable in a web browser', async () => {
    mocks.isNativePlatform.mockReturnValue(false);
    await expect(shareNativeSlideImage({ x: 0, y: 0, width: 300, height: 300 }))
      .rejects.toThrow('iOSアプリ');
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it('registers the same plugin name and offers Photos in the share sheet', () => {
    const bridge = readFileSync('ios/App/App/ULSAEvoBridgeViewController.swift', 'utf8');
    const plugin = readFileSync('ios/App/App/ULSASlideImageSharePlugin.swift', 'utf8');
    const info = readFileSync('ios/App/App/Info.plist', 'utf8');
    expect(bridge).toContain('registerPluginInstance(ULSASlideImageSharePlugin())');
    expect(plugin).toContain('let jsName = "UlsaSlideImageShare"');
    expect(plugin).toContain('webView.takeSnapshot(with: configuration)');
    expect(plugin).toContain('applicationActivities: [SaveSlideImageToPhotosActivity()]');
    expect(plugin).toContain('PHPhotoLibrary.requestAuthorization(for: .addOnly)');
    expect(info).toContain('<key>NSPhotoLibraryAddUsageDescription</key>');
  });
});
