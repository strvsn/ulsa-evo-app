import { Capacitor, registerPlugin } from '@capacitor/core';
import packageMetadata from '../../package.json';
import { BUILD_COMMIT_HASH } from '../utils/buildInfo';

export type RuntimeAppInfo = {
  name: string;
  version: string;
  build: string;
  source: 'ios-bundle' | 'web-package' | 'fallback';
  error: string | null;
};

interface NativeAppInfoPlugin {
  getInfo(): Promise<{ name?: string; version?: string; build?: string }>;
}

const UlsaAppInfo = registerPlugin<NativeAppInfoPlugin>('UlsaAppInfo');

const webFallback = (error: string | null = null): RuntimeAppInfo => ({
  name: 'EVO APP',
  version: packageMetadata.version,
  build: BUILD_COMMIT_HASH,
  source: error ? 'fallback' : 'web-package',
  error,
});

export const getRuntimeAppInfo = async (): Promise<RuntimeAppInfo> => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return webFallback();
  }

  try {
    const info = await UlsaAppInfo.getInfo();
    const version = info.version?.trim();
    const build = info.build?.trim();
    if (!version || !build) {
      return webFallback('iOS bundleのversion/buildを取得できませんでした');
    }
    return {
      name: info.name?.trim() || 'EVO APP',
      version,
      build,
      source: 'ios-bundle',
      error: null,
    };
  } catch (error) {
    return webFallback(
      error instanceof Error ? error.message : 'iOS bundle情報を取得できませんでした',
    );
  }
};
