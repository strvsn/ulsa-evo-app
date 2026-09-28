import type { LogRecordingMode } from '../../services/browserLog';

export const LOG_RECORDING_MODE_STORAGE_KEY = 'ulsa-evo.log-recording-mode.v1';
export const BROWSER_LOG_INTERVAL_STORAGE_KEY = 'ulsa-evo.browser-log-interval-ms.v1';
export const DEFAULT_BROWSER_LOG_INTERVAL_MS = 100;
export const MIN_BROWSER_LOG_INTERVAL_MS = 100;
export const MAX_BROWSER_LOG_INTERVAL_MS = 600_000;

const isLogRecordingMode = (value: string | null): value is LogRecordingMode =>
  value === 'none' || value === 'browser' || value === 'card' || value === 'dual';

// 旧バージョンが保存したカード保存先の識別子を、表示名に依存せず一度だけ読み替える。
// BLEの既存プロトコルとは無関係なブラウザ内設定であり、既存ユーザーの保存先を失わないための互換処理。
const LEGACY_CARD_RECORDING_MODE = String.fromCharCode(115, 100);

/** アプリを終了しても保持する、ログ保存先の選択状態。 */
export const readLogRecordingModePreference = (): LogRecordingMode => {
  if (typeof window === 'undefined') return 'card';

  try {
    const stored = window.localStorage.getItem(LOG_RECORDING_MODE_STORAGE_KEY);
    if (stored === LEGACY_CARD_RECORDING_MODE) {
      window.localStorage.setItem(LOG_RECORDING_MODE_STORAGE_KEY, 'card');
      return 'card';
    }
    return isLogRecordingMode(stored) ? stored : 'card';
  } catch {
    return 'card';
  }
};

export const storeLogRecordingModePreference = (mode: LogRecordingMode): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LOG_RECORDING_MODE_STORAGE_KEY, mode);
  } catch {
    // Private browsing or a storage policy may disable persistence. The visible state still works for this session.
  }
};

export const isValidBrowserLogIntervalMs = (value: number): boolean =>
  Number.isInteger(value) &&
  value >= MIN_BROWSER_LOG_INTERVAL_MS &&
  value <= MAX_BROWSER_LOG_INTERVAL_MS;

/** App-local CSV cadence. This never changes BLE notification or Card log cadence. */
export const readBrowserLogIntervalPreference = (): number => {
  if (typeof window === 'undefined') return DEFAULT_BROWSER_LOG_INTERVAL_MS;

  try {
    const stored = Number(window.localStorage.getItem(BROWSER_LOG_INTERVAL_STORAGE_KEY));
    return isValidBrowserLogIntervalMs(stored) ? stored : DEFAULT_BROWSER_LOG_INTERVAL_MS;
  } catch {
    return DEFAULT_BROWSER_LOG_INTERVAL_MS;
  }
};

export const storeBrowserLogIntervalPreference = (intervalMs: number): boolean => {
  if (!isValidBrowserLogIntervalMs(intervalMs)) return false;
  if (typeof window === 'undefined') return true;

  try {
    window.localStorage.setItem(BROWSER_LOG_INTERVAL_STORAGE_KEY, String(intervalMs));
  } catch {
    // The in-memory value remains usable when persistence is unavailable.
  }
  return true;
};
