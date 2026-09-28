/**
 * BLEアダプターファクトリー
 * プラットフォームに応じた適切なアダプターを提供
 */

import type { IBLEAdapter, BLEPlatformInfo } from './IBLEAdapter';
import { CapacitorBLEAdapter } from './CapacitorBLEAdapter';
import { WebBLEAdapter } from './WebBLEAdapter';
import { detectBLEPlatform, getPlatformInfo } from './platformDetector';

/**
 * BLE非サポートエラー
 */
export class BLENotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BLENotSupportedError';
  }
}

/**
 * BLEアダプターのシングルトンインスタンス
 */
let adapterInstance: IBLEAdapter | null = null;

/**
 * 現在のプラットフォームに適したBLEアダプターを取得
 * @throws BLENotSupportedError BLE非サポート環境の場合
 */
export function getBLEAdapter(): IBLEAdapter {
  if (adapterInstance) {
    return adapterInstance;
  }

  const platform = detectBLEPlatform();

  switch (platform) {
    case 'capacitor':
      adapterInstance = new CapacitorBLEAdapter();
      break;
    case 'web':
      adapterInstance = new WebBLEAdapter();
      break;
    case 'unsupported': {
      const info = getPlatformInfo();
      throw new BLENotSupportedError(info.supportMessage);
    }
  }

  return adapterInstance;
}

/**
 * BLEアダプターインスタンスをリセット（テスト用）
 */
export function resetBLEAdapter(): void {
  adapterInstance = null;
}

/**
 * 現在のプラットフォーム情報を取得
 */
export function getBLEPlatformInfo(): BLEPlatformInfo {
  const info = getPlatformInfo();
  const platform = detectBLEPlatform();
  const webBluetoothAvailable = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  const secureContext = typeof window !== 'undefined' ? window.isSecureContext : undefined;
  
  let adapterType: BLEPlatformInfo['adapterType'] = 'none';
  let platformName: BLEPlatformInfo['platform'] = 'unknown';
  
  if (platform === 'capacitor') {
    adapterType = 'Capacitor';
    // Capacitorのネイティブプラットフォームを検出
    const nativePlatform = (typeof navigator !== 'undefined' && 
      navigator.userAgent.includes('iPhone')) ? 'ios' : 'android';
    platformName = nativePlatform;
  } else if (platform === 'web') {
    adapterType = 'WebBluetooth';
    platformName = 'web';
  }
  
  return {
    platform: platformName,
    adapterType,
    isSupported: platform !== 'unsupported',
    browserName: info.browserName,
    secureContext,
    webBluetoothAvailable,
    message: info.supportMessage,
  };
}
