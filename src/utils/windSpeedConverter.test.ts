import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WIND_SPEED_UNIT,
  WIND_SPEED_UNIT_STORAGE_KEY,
  convertWindSpeed,
  getNextWindSpeedUnit,
  isWindSpeedUnit,
  readWindSpeedUnitPreference,
  storeWindSpeedUnitPreference,
} from './windSpeedConverter';

describe('windSpeedConverter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converts m/s into each supported display unit', () => {
    expect(convertWindSpeed(2, 'm/s')).toBe(2);
    expect(convertWindSpeed(2, 'km/h')).toBe(7.2);
    expect(convertWindSpeed(2, 'cm/s')).toBe(200);
  });

  it('cycles through m/s, km/h and cm/s in display order', () => {
    expect(getNextWindSpeedUnit('m/s')).toBe('km/h');
    expect(getNextWindSpeedUnit('km/h')).toBe('cm/s');
    expect(getNextWindSpeedUnit('cm/s')).toBe('m/s');
  });

  it('recognizes only supported persisted values', () => {
    expect(isWindSpeedUnit('m/s')).toBe(true);
    expect(isWindSpeedUnit('km/h')).toBe(true);
    expect(isWindSpeedUnit('cm/s')).toBe(true);
    expect(isWindSpeedUnit('mph')).toBe(false);
    expect(isWindSpeedUnit(null)).toBe(false);
  });

  it('uses m/s by default and restores a persisted display unit', () => {
    expect(readWindSpeedUnitPreference()).toBe(DEFAULT_WIND_SPEED_UNIT);

    storeWindSpeedUnitPreference('km/h');

    expect(window.localStorage.getItem(WIND_SPEED_UNIT_STORAGE_KEY)).toBe('km/h');
    expect(readWindSpeedUnitPreference()).toBe('km/h');
  });

  it('falls back to m/s for an unknown persisted value', () => {
    window.localStorage.setItem(WIND_SPEED_UNIT_STORAGE_KEY, 'mph');

    expect(readWindSpeedUnitPreference()).toBe(DEFAULT_WIND_SPEED_UNIT);
  });

  it('keeps working when storage access is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable');
    });

    expect(readWindSpeedUnitPreference()).toBe(DEFAULT_WIND_SPEED_UNIT);

    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable');
    });

    expect(() => storeWindSpeedUnitPreference('cm/s')).not.toThrow();
  });
});
