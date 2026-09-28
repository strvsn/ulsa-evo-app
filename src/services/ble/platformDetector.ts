/**
 * BLEプラットフォーム検出ユーティリティ
 */

import { Capacitor } from '@capacitor/core';

/**
 * ブラウザ名を検出
 * Bluefy: iOS用Web Bluetooth対応ブラウザ
 */
export function detectBrowserName(): string | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  if (ua.includes('Bluefy')) return 'Bluefy';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Firefox')) return 'Firefox';
  return null;
}

/**
 * Chromeブラウザかどうか（watchAdvertisements等の実験的APIが使える）
 */
export function isChromeBrowser(): boolean {
  const name = detectBrowserName();
  return name === 'Chrome' || name === 'Edge';
}

/**
 * Bluefyブラウザかどうか
 */
export function isBluefyBrowser(): boolean {
  return detectBrowserName() === 'Bluefy';
}

/**
 * BLEプラットフォーム種別
 */
export type BLEPlatform = 'capacitor' | 'web' | 'unsupported';

/**
 * 現在のプラットフォームを検出
 */
export function detectBLEPlatform(): BLEPlatform {
  // Capacitorネイティブ環境（iOS/Android）
  if (Capacitor.isNativePlatform()) {
    return 'capacitor';
  }

  // Web Bluetooth API対応ブラウザ（Chrome/Edge）
  if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
    return 'web';
  }

  // 非対応（Safari/Firefox等）
  return 'unsupported';
}

/**
 * BLEがサポートされているかチェック
 */
export function isBLESupported(): boolean {
  return detectBLEPlatform() !== 'unsupported';
}

/** HTTPS → SoftAP HTTP requires Chromium's Local Network Access exemption. */
export function getStm32WebUpdateUnavailableReason(): string | null {
  const browserHelp = 'PCのChrome 142以降／Edge 143以降、またはAndroidのChrome 142以降をご利用ください。';
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return browserHelp;
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod|CriOS|EdgiOS|Bluefy/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIos) {
    return 'iPhone／iPadのブラウザではSTM32更新に対応していません。ULSA EVOのiOSアプリをご利用ください。';
  }
  if (!window.isSecureContext) {
    return 'Web版のSTM32更新にはHTTPS接続が必要です。公式WebアプリをHTTPSで開いてください。';
  }
  if (!('bluetooth' in navigator) || !navigator.bluetooth) {
    return `このブラウザはWeb Bluetoothに対応していません。${browserHelp}`;
  }
  const edgeVersion = ua.match(/Edg\/(\d+)/);
  const chromeVersion = ua.match(/Chrome\/(\d+)/);
  const isOtherBrowser = /EdgA\/|OPR\/|SamsungBrowser\/|Firefox\/|Vivaldi\//.test(ua);
  const supported = !isOtherBrowser && (edgeVersion
    ? !/Android/.test(ua) && Number(edgeVersion[1]) >= 143
    : chromeVersion && Number(chromeVersion[1]) >= 142);
  return supported ? null : `このブラウザではSTM32更新に対応していません。${browserHelp}`;
}

/** Some browsers do not expose this permission name; HTTP remains the final check. */
export async function readLocalNetworkAccessPermissionState(): Promise<PermissionState | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return null;
    const status = await navigator.permissions.query({ name: 'local-network-access' as PermissionName });
    return status.state;
  } catch {
    return null;
  }
}

/**
 * プラットフォーム情報を取得
 */
export function getPlatformInfo(): {
  platform: BLEPlatform;
  isNative: boolean;
  browserName: string | null;
  supportMessage: string;
} {
  const platform = detectBLEPlatform();
  const isNative = Capacitor.isNativePlatform();

  const browserName = isNative ? null : detectBrowserName();

  let supportMessage: string;
  switch (platform) {
    case 'capacitor':
      supportMessage = 'ネイティブBLE対応';
      break;
    case 'web':
      supportMessage = `Web BLE API対応 (${browserName || 'ブラウザ'})`;
      break;
    case 'unsupported':
      supportMessage = `BLE非対応ブラウザです (${browserName || '不明'})。Chrome または Edge をご使用ください。`;
      break;
  }

  return { platform, isNative, browserName, supportMessage };
}
