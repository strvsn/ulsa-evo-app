import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // ★ アプリの一意識別子（Bundle ID）
  // App Store に登録する前に変更する場合はここを書き換えてください。
  // 一度 App Store に登録すると変更できないため、慎重に決定してください。
  appId: 'com.strvsn.ulsaEvoApp',

  // ★ アプリ表示名（ホーム画面に表示される名前）
  appName: 'EVO APP',

  // ビルド済み Web アセットの場所
  webDir: 'dist',

  loggingBehavior: 'none',

  // WKWebView / scrollView の下地色。CSSが届かないnative背景の白露出を防ぐ。
  backgroundColor: '#071019',

  // iOS 固有設定
  ios: {
    // Safe area はCSSで制御し、WKWebViewのnative insetによる下部余白を作らない。
    contentInset: 'never',
    backgroundColor: '#071019',
  },

  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'BLEデバイスをスキャン中...',
        cancel: 'キャンセル',
        availableDevices: '利用可能なデバイス',
        noDeviceFound: 'デバイスが見つかりません',
      },
    },
  },
};

export default config;
