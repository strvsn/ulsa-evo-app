import type {
  RtcTimezoneOperation,
  RtcTimezoneResult,
  RtcTimezoneStatus,
  RtcTimezoneSyncExpectation,
  RtcTimezoneWriteRequest,
} from '../../types/rtcTimezone';

export const RTC_TIMEZONE_PROTOCOL_VERSION = 1;
export const RTC_TIMEZONE_SET_ZONE_REQUEST_LENGTH = 6;
export const RTC_TIMEZONE_SYNC_REQUEST_LENGTH = 14;
export const RTC_TIMEZONE_STATUS_LENGTH = 28;
export const RTC_TIMEZONE_SYNC_TOLERANCE_SECONDS = 2.5;
export const RTC_TIMEZONE_MIN_UNIX_SECONDS = 946_684_800;
export const RTC_TIMEZONE_MAX_UNIX_SECONDS = 4_102_444_799;

export const RTC_TIMEZONE_OPERATION_CODES = {
  set_zone: 0x01,
  sync_utc_and_zone: 0x02,
} as const satisfies Record<RtcTimezoneWriteRequest['op'], number>;

export const RTC_TIMEZONE_STATUS_FLAGS = {
  rtcDetected: 0x01,
  rtcReadable: 0x02,
  utcValid: 0x04,
  zoneConfigured: 0x08,
  nvsPersisted: 0x10,
  dstActive: 0x20,
  busy: 0x40,
  error: 0x80,
} as const;

const OPERATION_BY_CODE = new Map<number, RtcTimezoneOperation>([
  [0x00, 'none'],
  [RTC_TIMEZONE_OPERATION_CODES.set_zone, 'set_zone'],
  [RTC_TIMEZONE_OPERATION_CODES.sync_utc_and_zone, 'sync_utc_and_zone'],
]);

const RESULT_BY_CODE = new Map<number, RtcTimezoneResult>([
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
]);

const isUint32 = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;

const assertZoneId = (zoneId: number): void => {
  if (!isUint32(zoneId)) {
    throw new Error('timezone zone ID must be a uint32 value');
  }
};

const assertUnixSeconds = (unixSeconds: number): void => {
  if (
    !Number.isSafeInteger(unixSeconds)
    || unixSeconds < RTC_TIMEZONE_MIN_UNIX_SECONDS
    || unixSeconds > RTC_TIMEZONE_MAX_UNIX_SECONDS
  ) {
    throw new Error('RTC Unix time must be an integer in the supported 2000-2099 range');
  }
};

export const buildRtcTimezoneRequest = (
  request: RtcTimezoneWriteRequest
): Uint8Array => {
  assertZoneId(request.zoneId);
  const operationCode = RTC_TIMEZONE_OPERATION_CODES[request.op];
  if (operationCode === undefined) {
    throw new Error(`Unsupported RTC timezone operation: ${String(request.op)}`);
  }

  const syncRequest = request.op === 'sync_utc_and_zone';
  if (syncRequest) assertUnixSeconds(request.unixSeconds);

  const payload = new Uint8Array(
    syncRequest
      ? RTC_TIMEZONE_SYNC_REQUEST_LENGTH
      : RTC_TIMEZONE_SET_ZONE_REQUEST_LENGTH
  );
  const view = new DataView(payload.buffer);
  view.setUint8(0, operationCode);
  view.setUint8(1, RTC_TIMEZONE_PROTOCOL_VERSION);
  view.setUint32(2, request.zoneId, true);
  if (syncRequest) view.setBigInt64(6, BigInt(request.unixSeconds), true);
  return payload;
};

export const buildSetRtcTimezoneRequest = (zoneId: number): Uint8Array =>
  buildRtcTimezoneRequest({ op: 'set_zone', zoneId });

export const buildSyncRtcTimezoneRequest = (
  zoneId: number,
  unixSeconds: number
): Uint8Array => buildRtcTimezoneRequest({
  op: 'sync_utc_and_zone',
  zoneId,
  unixSeconds,
});

const readSafeInt64 = (value: DataView, offset: number): number => {
  const raw = value.getBigInt64(offset, true);
  const minimum = BigInt(Number.MIN_SAFE_INTEGER);
  const maximum = BigInt(Number.MAX_SAFE_INTEGER);
  if (raw < minimum || raw > maximum) {
    throw new Error('RTC Unix time is outside JavaScript safe integer range');
  }
  return Number(raw);
};

export const parseRtcTimezoneStatus = (value: DataView): RtcTimezoneStatus => {
  if (value.byteLength !== RTC_TIMEZONE_STATUS_LENGTH) {
    throw new Error(
      `RTC Timezone status requires exactly ${RTC_TIMEZONE_STATUS_LENGTH} bytes, got ${value.byteLength}`
    );
  }

  const protocolVersion = value.getUint8(0);
  if (protocolVersion !== RTC_TIMEZONE_PROTOCOL_VERSION) {
    throw new Error(`Unsupported RTC Timezone protocol version: ${protocolVersion}`);
  }
  if (value.getUint8(27) !== 0) {
    throw new Error('RTC Timezone status reserved byte must be zero');
  }

  const tzdbRevisionCode = value.getUint8(26);
  if (tzdbRevisionCode < 0x61 || tzdbRevisionCode > 0x7a) {
    throw new Error('RTC Timezone status has an invalid TZDB revision letter');
  }

  const flags = value.getUint8(1);
  const lastOperationCode = value.getUint8(2);
  const resultCode = value.getUint8(3);
  const tzdbYear = value.getUint16(24, true);
  const tzdbRevisionLetter = String.fromCharCode(tzdbRevisionCode);

  return {
    protocolVersion,
    flags,
    rtcDetected: (flags & RTC_TIMEZONE_STATUS_FLAGS.rtcDetected) !== 0,
    rtcReadable: (flags & RTC_TIMEZONE_STATUS_FLAGS.rtcReadable) !== 0,
    utcValid: (flags & RTC_TIMEZONE_STATUS_FLAGS.utcValid) !== 0,
    zoneConfigured: (flags & RTC_TIMEZONE_STATUS_FLAGS.zoneConfigured) !== 0,
    nvsPersisted: (flags & RTC_TIMEZONE_STATUS_FLAGS.nvsPersisted) !== 0,
    dstActive: (flags & RTC_TIMEZONE_STATUS_FLAGS.dstActive) !== 0,
    busy: (flags & RTC_TIMEZONE_STATUS_FLAGS.busy) !== 0,
    error: (flags & RTC_TIMEZONE_STATUS_FLAGS.error) !== 0,
    lastOperationCode,
    lastOperation: OPERATION_BY_CODE.get(lastOperationCode) ?? 'unknown',
    resultCode,
    result: RESULT_BY_CODE.get(resultCode) ?? 'unknown',
    zoneId: value.getUint32(4, true),
    rtcUnixSeconds: readSafeInt64(value, 8),
    totalUtcOffsetMinutes: value.getInt16(16, true),
    standardUtcOffsetMinutes: value.getInt16(18, true),
    dstOffsetMinutes: value.getInt16(20, true),
    operationGeneration: value.getUint16(22, true),
    tzdbYear,
    tzdbRevisionLetter,
    tzdbVersion: `${tzdbYear}${tzdbRevisionLetter}`,
  };
};

export const hasRtcTimezoneGenerationAdvanced = (
  currentGeneration: number,
  baselineGeneration: number
): boolean => (
  Number.isInteger(currentGeneration)
  && Number.isInteger(baselineGeneration)
  && currentGeneration >= 0
  && currentGeneration <= 0xffff
  && baselineGeneration >= 0
  && baselineGeneration <= 0xffff
  && currentGeneration !== baselineGeneration
);

export const isRtcTimezoneOperationComplete = (
  status: RtcTimezoneStatus,
  expectedOperation: RtcTimezoneWriteRequest['op'],
  baselineGeneration: number
): boolean => status.lastOperation === expectedOperation
  && hasRtcTimezoneGenerationAdvanced(
    status.operationGeneration,
    baselineGeneration
  );

export const isRtcTimezoneSyncVerified = (
  status: RtcTimezoneStatus,
  expectation: RtcTimezoneSyncExpectation
): boolean => {
  const toleranceSeconds = expectation.toleranceSeconds
    ?? RTC_TIMEZONE_SYNC_TOLERANCE_SECONDS;
  if (
    !Number.isFinite(expectation.referenceUnixSeconds)
    || !Number.isFinite(toleranceSeconds)
    || toleranceSeconds < 0
    || !isUint32(expectation.zoneId)
  ) {
    return false;
  }

  return isRtcTimezoneOperationComplete(
    status,
    'sync_utc_and_zone',
    expectation.baselineGeneration
  )
    && status.result === 'ok'
    && status.zoneId === expectation.zoneId
    && status.rtcDetected
    && status.rtcReadable
    && status.utcValid
    && status.zoneConfigured
    && status.nvsPersisted
    && !status.busy
    && !status.error
    && Math.abs(status.rtcUnixSeconds - expectation.referenceUnixSeconds)
      <= toleranceSeconds;
};

/** Backward-compatible semantic alias for callers phrased in terms of success. */
export const isRtcTimezoneSyncSuccessful = isRtcTimezoneSyncVerified;
