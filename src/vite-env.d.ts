/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BLE_DEBUG?: string;
  readonly VITE_CHART_DEBUG?: string;
  readonly VITE_ESP32_FIRMWARE_RELEASES_URL?: string;
  readonly VITE_MEMORY_DEBUG?: string;
  readonly VITE_RENDER_PERF_DEBUG?: string;
  readonly VITE_STM32_UPDATER_ENABLED?: string;
  readonly VITE_SUPPORT_URL?: string;
  readonly VITE_PRIVACY_POLICY_URL?: string;
}

// Viteビルド時に埋め込まれるGitコミット情報
declare const __APP_COMMIT_HASH__: string;
declare const __APP_COMMIT_TIME__: string;
