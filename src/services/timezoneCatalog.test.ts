import { describe, expect, it } from 'vitest';
import {
  getDeviceTimezoneCandidate,
  getTimezoneById,
  getTimezoneByName,
  TIMEZONE_CATALOG,
} from './timezoneCatalog';

describe('timezoneCatalog', () => {
  it('exposes the generated AceTime and TZDB identity', () => {
    expect(TIMEZONE_CATALOG).toMatchObject({
      schemaVersion: 1,
      source: 'AceTime/zonedbx/kZoneAndLinkRegistry',
      aceTimeVersion: '4.1.0',
      tzdbVersion: '2025b',
      tzdbYear: 2025,
      tzdbRevisionLetter: 'b',
      zoneAndLinkCount: 597,
    });
    expect(TIMEZONE_CATALOG.zones).toHaveLength(TIMEZONE_CATALOG.zoneAndLinkCount);
  });

  it.each([
    ['Asia/Tokyo', 367_396_520],
    ['America/New_York', 506_099_284],
    ['Europe/London', 1_550_484_654],
    ['Australia/Lord_Howe', 2_806_560_381],
    ['Asia/Kathmandu', 2_593_574_511],
    ['Pacific/Chatham', 789_440_921],
    ['Africa/Casablanca', 3_315_538_739],
  ] as const)('resolves %s and stable ID %d in both directions', (name, zoneId) => {
    expect(getTimezoneByName(name)).toEqual({ name, zoneId });
    expect(getTimezoneById(zoneId)).toEqual({ name, zoneId });
  });

  it('uses the device timezone only as a catalog-backed candidate', () => {
    expect(getDeviceTimezoneCandidate('Asia/Tokyo')).toEqual({
      name: 'Asia/Tokyo',
      zoneId: 367_396_520,
    });
  });

  it('requires manual selection for missing or out-of-catalog candidates', () => {
    expect(getDeviceTimezoneCandidate(null)).toBeNull();
    expect(getDeviceTimezoneCandidate('')).toBeNull();
    expect(getDeviceTimezoneCandidate('Mars/Olympus_Mons')).toBeNull();
    expect(getTimezoneByName('Mars/Olympus_Mons')).toBeNull();
    expect(getTimezoneById(0xffff_ffff)).toBeNull();
  });
});
