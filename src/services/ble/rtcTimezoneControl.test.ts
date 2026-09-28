import { describe, expect, it } from 'vitest';
import type { RtcTimezoneStatus } from '../../types/rtcTimezone';
import {
  buildRtcTimezoneRequest,
  buildSetRtcTimezoneRequest,
  buildSyncRtcTimezoneRequest,
  hasRtcTimezoneGenerationAdvanced,
  isRtcTimezoneOperationComplete,
  isRtcTimezoneSyncSuccessful,
  isRtcTimezoneSyncVerified,
  parseRtcTimezoneStatus,
  RTC_TIMEZONE_MAX_UNIX_SECONDS,
  RTC_TIMEZONE_MIN_UNIX_SECONDS,
} from './rtcTimezoneControl';

const makeStatusBytes = (overrides: Partial<{
  protocolVersion: number;
  flags: number;
  lastOperation: number;
  result: number;
  zoneId: number;
  rtcUnixSeconds: bigint;
  totalOffset: number;
  standardOffset: number;
  dstOffset: number;
  generation: number;
  tzdbYear: number;
  tzdbRevision: number;
  reserved: number;
}> = {}): Uint8Array => {
  const payload = new Uint8Array(28);
  const view = new DataView(payload.buffer);
  view.setUint8(0, overrides.protocolVersion ?? 1);
  view.setUint8(1, overrides.flags ?? 0x3f);
  view.setUint8(2, overrides.lastOperation ?? 0x02);
  view.setUint8(3, overrides.result ?? 0x00);
  view.setUint32(4, overrides.zoneId ?? 0xdead_beef, true);
  view.setBigInt64(8, overrides.rtcUnixSeconds ?? 1_787_030_400n, true);
  view.setInt16(16, overrides.totalOffset ?? 540, true);
  view.setInt16(18, overrides.standardOffset ?? 540, true);
  view.setInt16(20, overrides.dstOffset ?? 0, true);
  view.setUint16(22, overrides.generation ?? 42, true);
  view.setUint16(24, overrides.tzdbYear ?? 2025, true);
  view.setUint8(26, overrides.tzdbRevision ?? 'b'.charCodeAt(0));
  view.setUint8(27, overrides.reserved ?? 0);
  return payload;
};

const parseBytes = (bytes: Uint8Array): RtcTimezoneStatus =>
  parseRtcTimezoneStatus(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));

describe('rtcTimezoneControl request builders', () => {
  it('builds exact little-endian SET_ZONE and SYNC_UTC_AND_ZONE payloads', () => {
    expect(Array.from(buildSetRtcTimezoneRequest(0x89ab_cdef))).toEqual([
      0x01, 0x01, 0xef, 0xcd, 0xab, 0x89,
    ]);

    const sync = buildSyncRtcTimezoneRequest(0x89ab_cdef, 1_787_030_400);
    expect(sync).toHaveLength(14);
    expect(Array.from(sync.slice(0, 6))).toEqual([
      0x02, 0x01, 0xef, 0xcd, 0xab, 0x89,
    ]);
    expect(new DataView(sync.buffer).getBigInt64(6, true)).toBe(1_787_030_400n);
  });

  it('accepts both supported time boundaries and all uint32 zone IDs', () => {
    expect(buildSyncRtcTimezoneRequest(0, RTC_TIMEZONE_MIN_UNIX_SECONDS)).toHaveLength(14);
    expect(buildSyncRtcTimezoneRequest(0xffff_ffff, RTC_TIMEZONE_MAX_UNIX_SECONDS)).toHaveLength(14);
  });

  it('rejects invalid IDs, non-integral times, and times outside 2000-2099', () => {
    expect(() => buildSetRtcTimezoneRequest(-1)).toThrow('uint32');
    expect(() => buildSetRtcTimezoneRequest(0x1_0000_0000)).toThrow('uint32');
    expect(() => buildSyncRtcTimezoneRequest(1, RTC_TIMEZONE_MIN_UNIX_SECONDS - 1)).toThrow('2000-2099');
    expect(() => buildSyncRtcTimezoneRequest(1, RTC_TIMEZONE_MAX_UNIX_SECONDS + 1)).toThrow('2000-2099');
    expect(() => buildSyncRtcTimezoneRequest(1, 1_787_030_400.5)).toThrow('integer');
  });

  it('does not expose an unknown operation through the typed generic builder', () => {
    expect(Array.from(buildRtcTimezoneRequest({ op: 'set_zone', zoneId: 1 }))).toEqual([
      1, 1, 1, 0, 0, 0,
    ]);
    expect(() => buildRtcTimezoneRequest({
      op: 'unknown',
      zoneId: 1,
    } as never)).toThrow('Unsupported RTC timezone operation');
  });
});

describe('rtcTimezoneControl status parser', () => {
  it('parses all fields from the exact 28-byte little-endian status', () => {
    expect(parseBytes(makeStatusBytes({
      flags: 0xff,
      zoneId: 0x89ab_cdef,
      rtcUnixSeconds: 1_787_030_400n,
      totalOffset: 630,
      standardOffset: 570,
      dstOffset: 60,
      generation: 0xbeef,
    }))).toEqual({
      protocolVersion: 1,
      flags: 0xff,
      rtcDetected: true,
      rtcReadable: true,
      utcValid: true,
      zoneConfigured: true,
      nvsPersisted: true,
      dstActive: true,
      busy: true,
      error: true,
      lastOperationCode: 2,
      lastOperation: 'sync_utc_and_zone',
      resultCode: 0,
      result: 'ok',
      zoneId: 0x89ab_cdef,
      rtcUnixSeconds: 1_787_030_400,
      totalUtcOffsetMinutes: 630,
      standardUtcOffsetMinutes: 570,
      dstOffsetMinutes: 60,
      operationGeneration: 0xbeef,
      tzdbYear: 2025,
      tzdbRevisionLetter: 'b',
      tzdbVersion: '2025b',
    });
  });

  it.each([
    [0x00, 'ok'],
    [0x01, 'invalid_length'],
    [0x02, 'invalid_version'],
    [0x03, 'invalid_op'],
    [0x04, 'unsupported_zone'],
    [0x05, 'time_out_of_range'],
    [0x06, 'nvs_failed'],
    [0x07, 'rtc_write_failed'],
    [0x08, 'readback_failed'],
    [0x09, 'busy'],
    [0xff, 'unknown'],
  ] as const)('maps result 0x%s to %s', (result, expected) => {
    expect(parseBytes(makeStatusBytes({ result })).result).toBe(expected);
  });

  it('preserves unknown operations as a safe unsupported state', () => {
    expect(parseBytes(makeStatusBytes({ lastOperation: 0x7f }))).toMatchObject({
      lastOperationCode: 0x7f,
      lastOperation: 'unknown',
    });
  });

  it('rejects short, long, unknown-version, reserved, and invalid-TZDB payloads', () => {
    expect(() => parseBytes(makeStatusBytes().slice(0, 27))).toThrow('exactly 28');
    expect(() => parseBytes(new Uint8Array(29))).toThrow('exactly 28');
    expect(() => parseBytes(makeStatusBytes({ protocolVersion: 2 }))).toThrow('protocol version');
    expect(() => parseBytes(makeStatusBytes({ reserved: 1 }))).toThrow('reserved byte');
    expect(() => parseBytes(makeStatusBytes({ tzdbRevision: 0 }))).toThrow('revision letter');
  });
});

describe('rtcTimezoneControl sync completion', () => {
  const expectation = {
    baselineGeneration: 41,
    zoneId: 0xdead_beef,
    referenceUnixSeconds: 1_787_030_402.5,
  };

  it('requires a new matching generation and accepts the inclusive 2.5-second boundary', () => {
    const status = parseBytes(makeStatusBytes({ rtcUnixSeconds: 1_787_030_400n }));
    expect(isRtcTimezoneOperationComplete(status, 'sync_utc_and_zone', 41)).toBe(true);
    expect(isRtcTimezoneSyncVerified(status, expectation)).toBe(true);
    expect(isRtcTimezoneSyncSuccessful(status, expectation)).toBe(true);
    expect(hasRtcTimezoneGenerationAdvanced(0, 0xffff)).toBe(true);
  });

  it('never treats an advanced same-operation BUSY result as success', () => {
    const busy = parseBytes(makeStatusBytes({ result: 9, generation: 42 }));

    expect(isRtcTimezoneOperationComplete(
      busy,
      'sync_utc_and_zone',
      expectation.baselineGeneration
    )).toBe(true);
    expect(isRtcTimezoneSyncVerified(busy, expectation)).toBe(false);
  });

  it.each([
    ['stale generation', { generation: 41 }],
    ['wrong operation', { lastOperation: 1 }],
    ['non-ok result', { result: 9 }],
    ['wrong zone', { zoneId: 1 }],
    ['missing NVS persistence', { flags: 0x2f }],
    ['invalid UTC', { flags: 0x3b }],
    ['busy status', { flags: 0x7f }],
    ['error status', { flags: 0xbf }],
    ['time outside tolerance', { rtcUnixSeconds: 1_787_030_399n }],
  ])('rejects %s', (_name, overrides) => {
    expect(isRtcTimezoneSyncSuccessful(
      parseBytes(makeStatusBytes(overrides)),
      expectation
    )).toBe(false);
  });

  it('fails closed for invalid expectations', () => {
    const status = parseBytes(makeStatusBytes());
    expect(isRtcTimezoneSyncSuccessful(status, {
      ...expectation,
      toleranceSeconds: -1,
    })).toBe(false);
    expect(isRtcTimezoneSyncSuccessful(status, {
      ...expectation,
      referenceUnixSeconds: Number.NaN,
    })).toBe(false);
  });
});
