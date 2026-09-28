export type RtcTimezoneOperation =
  | 'none'
  | 'set_zone'
  | 'sync_utc_and_zone'
  | 'unknown';

export type RtcTimezoneResult =
  | 'ok'
  | 'invalid_length'
  | 'invalid_version'
  | 'invalid_op'
  | 'unsupported_zone'
  | 'time_out_of_range'
  | 'nvs_failed'
  | 'rtc_write_failed'
  | 'readback_failed'
  | 'busy'
  | 'unknown';

export type RtcTimezoneWriteRequest =
  | {
      op: 'set_zone';
      zoneId: number;
    }
  | {
      op: 'sync_utc_and_zone';
      zoneId: number;
      unixSeconds: number;
    };

export interface RtcTimezoneStatus {
  protocolVersion: number;
  flags: number;
  rtcDetected: boolean;
  rtcReadable: boolean;
  utcValid: boolean;
  zoneConfigured: boolean;
  nvsPersisted: boolean;
  dstActive: boolean;
  busy: boolean;
  error: boolean;
  lastOperationCode: number;
  lastOperation: RtcTimezoneOperation;
  resultCode: number;
  result: RtcTimezoneResult;
  zoneId: number;
  rtcUnixSeconds: number;
  totalUtcOffsetMinutes: number;
  standardUtcOffsetMinutes: number;
  dstOffsetMinutes: number;
  operationGeneration: number;
  tzdbYear: number;
  tzdbRevisionLetter: string;
  tzdbVersion: string;
}

export interface RtcTimezoneSyncExpectation {
  /** Status read immediately before issuing the write. */
  baselineGeneration: number;
  zoneId: number;
  /** Client Unix time, in seconds, corresponding to receipt of the status. */
  referenceUnixSeconds: number;
  toleranceSeconds?: number;
}

export interface TimezoneCatalogZone {
  name: string;
  /** AceTime stable uint32 zone identifier. */
  zoneId: number;
}

export interface TimezoneCatalog {
  schemaVersion: number;
  source: string;
  aceTimeVersion: string;
  aceTimeCommit: string;
  tzdbVersion: string;
  tzdbYear: number;
  tzdbRevisionLetter: string;
  startYear: number;
  untilYear: number;
  zoneAndLinkCount: number;
  zones: readonly Readonly<TimezoneCatalogZone>[];
}
