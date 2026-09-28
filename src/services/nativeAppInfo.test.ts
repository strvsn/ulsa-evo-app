import { beforeEach, describe, expect, it, vi } from 'vitest';
import packageMetadata from '../../package.json';

const mocks = vi.hoisted(() => ({
  getInfo: vi.fn(),
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: mocks.getPlatform,
    isNativePlatform: mocks.isNativePlatform,
  },
  registerPlugin: () => ({ getInfo: mocks.getInfo }),
}));

vi.mock('../utils/buildInfo', () => ({ BUILD_COMMIT_HASH: 'abc1234' }));

import { getRuntimeAppInfo } from './nativeAppInfo';

describe('getRuntimeAppInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPlatform.mockReturnValue('web');
    mocks.isNativePlatform.mockReturnValue(false);
  });

  it('uses package version and Git hash on the Web', async () => {
    await expect(getRuntimeAppInfo()).resolves.toMatchObject({
      name: 'EVO APP',
      version: packageMetadata.version,
      build: 'abc1234',
      source: 'web-package',
      error: null,
    });
    expect(mocks.getInfo).not.toHaveBeenCalled();
  });

  it('uses the installed iOS bundle version and build number', async () => {
    mocks.getPlatform.mockReturnValue('ios');
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getInfo.mockResolvedValue({ name: 'EVO APP', version: '1.0.0', build: '20260830110000' });

    await expect(getRuntimeAppInfo()).resolves.toEqual({
      name: 'EVO APP',
      version: '1.0.0',
      build: '20260830110000',
      source: 'ios-bundle',
      error: null,
    });
  });

  it('falls back without inventing a native build when the plugin fails', async () => {
    mocks.getPlatform.mockReturnValue('ios');
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getInfo.mockRejectedValue(new Error('bridge unavailable'));

    await expect(getRuntimeAppInfo()).resolves.toMatchObject({
      source: 'fallback',
      build: 'abc1234',
      error: 'bridge unavailable',
    });
  });
});
