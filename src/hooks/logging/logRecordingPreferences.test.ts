import { beforeEach, describe, expect, it } from 'vitest';
import {
  BROWSER_LOG_INTERVAL_STORAGE_KEY,
  DEFAULT_BROWSER_LOG_INTERVAL_MS,
  LOG_RECORDING_MODE_STORAGE_KEY,
  readBrowserLogIntervalPreference,
  readLogRecordingModePreference,
  storeBrowserLogIntervalPreference,
  storeLogRecordingModePreference,
} from './logRecordingPreferences';

describe('logRecordingPreferences', () => {
  beforeEach(() => {
    window.localStorage.removeItem(LOG_RECORDING_MODE_STORAGE_KEY);
    window.localStorage.removeItem(BROWSER_LOG_INTERVAL_STORAGE_KEY);
  });

  it('uses Card as the migration default and restores a persisted destination selection', () => {
    expect(readLogRecordingModePreference()).toBe('card');

    storeLogRecordingModePreference('dual');
    expect(readLogRecordingModePreference()).toBe('dual');
  });

  it('ignores unknown persisted values', () => {
    window.localStorage.setItem(LOG_RECORDING_MODE_STORAGE_KEY, 'invalid');
    expect(readLogRecordingModePreference()).toBe('card');
  });

  it('keeps App log cadence independent and defaults to the current 10 Hz behavior', () => {
    expect(readBrowserLogIntervalPreference()).toBe(DEFAULT_BROWSER_LOG_INTERVAL_MS);
    expect(storeBrowserLogIntervalPreference(10_000)).toBe(true);
    expect(readBrowserLogIntervalPreference()).toBe(10_000);
  });

  it('rejects App log intervals outside 100 ms to 600 seconds', () => {
    expect(storeBrowserLogIntervalPreference(99)).toBe(false);
    expect(storeBrowserLogIntervalPreference(600_001)).toBe(false);
    window.localStorage.setItem(BROWSER_LOG_INTERVAL_STORAGE_KEY, 'invalid');
    expect(readBrowserLogIntervalPreference()).toBe(DEFAULT_BROWSER_LOG_INTERVAL_MS);
  });
});
