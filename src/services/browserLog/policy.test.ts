import { describe, expect, it } from 'vitest';
import {
  BROWSER_LOG_MAX_STORED_BYTES,
  BROWSER_LOG_MIN_FREE_BYTES,
  BROWSER_LOG_RETENTION_DAYS,
  createEmptyBrowserLogStatus,
  normalizeBrowserLogStorageError,
} from './policy';

describe('browser log storage policy', () => {
  it('publishes the product retention and capacity defaults', () => {
    const status = createEmptyBrowserLogStatus();
    expect(status.retentionDays).toBe(BROWSER_LOG_RETENTION_DAYS);
    expect(status.maxStoredBytes).toBe(BROWSER_LOG_MAX_STORED_BYTES);
    expect(status.minFreeBytes).toBe(BROWSER_LOG_MIN_FREE_BYTES);
    expect(status.storageRemainingBytes).toBe(BROWSER_LOG_MAX_STORED_BYTES);
  });

  it('maps IndexedDB quota exceptions to a recoverable user message', () => {
    const error = normalizeBrowserLogStorageError(
      new DOMException('The quota has been exceeded.', 'QuotaExceededError'),
    );
    expect(error.code).toBe('quota');
    expect(error.message).toContain('ZIP');
    expect(error.message).toContain('削除');
  });
});
