import type { BrowserLogStatus } from './types';

export const BROWSER_LOG_RETENTION_DAYS = 30;
export const BROWSER_LOG_RETENTION_MS = BROWSER_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const BROWSER_LOG_MAX_STORED_BYTES = 100 * 1024 * 1024;
export const BROWSER_LOG_MIN_FREE_BYTES = 16 * 1024 * 1024;

export const createEmptyBrowserLogStatus = (): BrowserLogStatus => ({
  active: false,
  sessionId: null,
  rowCount: 0,
  segmentCount: 0,
  completedSegmentCount: 0,
  currentSegmentStartedAt: null,
  lastSampleAt: null,
  bufferedBytes: 0,
  storedSessionCount: 0,
  storedSegmentCount: 0,
  storedRowCount: 0,
  storedBytes: 0,
  hasExportableData: false,
  sessions: [],
  retentionDays: BROWSER_LOG_RETENTION_DAYS,
  maxStoredBytes: BROWSER_LOG_MAX_STORED_BYTES,
  minFreeBytes: BROWSER_LOG_MIN_FREE_BYTES,
  storageRemainingBytes: BROWSER_LOG_MAX_STORED_BYTES,
  storageQuotaBytes: null,
  storageUsageBytes: null,
  originRemainingBytes: null,
  effectiveWritableBytes: BROWSER_LOG_MAX_STORED_BYTES,
  storageLimitReached: false,
  maintenanceNotice: null,
  error: null,
});

export type BrowserLogStorageErrorCode = 'capacity' | 'quota' | 'storage';

export class BrowserLogStorageError extends Error {
  readonly code: BrowserLogStorageErrorCode;

  constructor(code: BrowserLogStorageErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BrowserLogStorageError';
    this.code = code;
  }
}

export const isQuotaExceededError = (error: unknown): boolean => {
  if (!(error instanceof DOMException)) return false;
  return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED';
};

export const normalizeBrowserLogStorageError = (error: unknown): BrowserLogStorageError => {
  if (error instanceof BrowserLogStorageError) return error;
  if (isQuotaExceededError(error)) {
    return new BrowserLogStorageError(
      'quota',
      '端末の保存空き容量が不足したため、アプリ内ログを停止しました。保存済みログをZIPで書き出してから削除してください。',
      { cause: error },
    );
  }
  return new BrowserLogStorageError(
    'storage',
    error instanceof Error ? error.message : String(error),
    { cause: error },
  );
};

export const createBrowserLogCapacityError = (): BrowserLogStorageError =>
  new BrowserLogStorageError(
    'capacity',
    'アプリ内ログが100 MiBの保存上限に達したため、記録を停止しました。保存済みログをZIPで書き出してから削除してください。',
  );

export const estimateBrowserLogStorage = async (): Promise<StorageEstimate | null> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
};
