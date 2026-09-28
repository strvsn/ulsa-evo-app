import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_ULSA_THEME_ID,
  getUlsaThemeIndex,
  LEGACY_ULSA_THEME_STORAGE_KEY,
  persistUlsaThemePreference,
  readUlsaThemePreference,
  ULSA_THEME_STORAGE_KEY,
} from './themes';

describe('ULSA theme preferences', () => {
  beforeEach(() => window.localStorage.clear());

  it('uses stable theme ids for new preferences', () => {
    window.localStorage.setItem(ULSA_THEME_STORAGE_KEY, 'light');
    expect(readUlsaThemePreference(window.localStorage)).toBe('light');
    expect(getUlsaThemeIndex('light')).toBe(7);
  });

  it('migrates a legacy numeric preference without exposing archived themes', () => {
    window.localStorage.setItem(LEGACY_ULSA_THEME_STORAGE_KEY, '3');
    expect(readUlsaThemePreference(window.localStorage)).toBe('graphite');
    persistUlsaThemePreference(window.localStorage, 'graphite');
    expect(window.localStorage.getItem(ULSA_THEME_STORAGE_KEY)).toBe('graphite');
    expect(window.localStorage.getItem(LEGACY_ULSA_THEME_STORAGE_KEY)).toBeNull();
  });

  it('rejects unknown ids and archived legacy indexes', () => {
    window.localStorage.setItem(ULSA_THEME_STORAGE_KEY, 'purple');
    window.localStorage.setItem(LEGACY_ULSA_THEME_STORAGE_KEY, '0');
    expect(readUlsaThemePreference(window.localStorage)).toBe(DEFAULT_ULSA_THEME_ID);
  });
});
