import type { BLEParseErrorStats } from '../../services/ble';
import type { RtcTimeStatus } from '../../types/ble';
export const SENSOR_DATA_STALE_MS = 3000;
export const DEVICE_MODE_REFRESH_MS = 1500;
export const DEVICE_HEALTH_REFRESH_MS = 1500;
export const CARD_LOG_DETAIL_REFRESH_MS = 1500;
export const CARD_LOG_CONTROL_FALLBACK_REFRESH_MS = 5000;
export const CARD_LOG_NOTIFY_START_TIMEOUT_MS = 2500;
export const RTC_TIME_REFRESH_MS = 5000;
export const CARD_STATUS_REFRESH_MS = 60000;
export const RTC_SYNC_READBACK_DELAY_MS = 400;
export const RTC_SYNC_READBACK_SAMPLE_COUNT = 3;
export const RTC_SYNC_READBACK_SAMPLE_INTERVAL_MS = 500;
export const RTC_SYNC_OK_OFFSET_MS = 2500;
export const EMPTY_PARSE_ERROR_STATS: BLEParseErrorStats = {
    count: 0,
    lastError: null,
};
export const EMPTY_RTC_TIME_STATUS: RtcTimeStatus = {
    deviceTime: null,
    deviceEpochSeconds: null,
    systemTimeAtRead: null,
    offsetMs: null,
    offsetAssessment: 'single',
    lastReadAt: null,
    supported: null,
    readError: null,
    syncState: 'idle',
    lastSyncAt: null,
    lastSyncOffsetMs: null,
    syncMessage: null,
    zoneId: null,
    zoneName: null,
    totalUtcOffsetMinutes: null,
    standardUtcOffsetMinutes: null,
    dstOffsetMinutes: null,
    tzdbVersion: null,
    rtcDetected: false,
    rtcReadable: false,
    utcValid: false,
    zoneConfigured: false,
    nvsPersisted: false,
    dstActive: false,
    operationGeneration: null,
    lastOperation: 'none',
    lastResult: null,
    operationBusy: false,
    deviceError: false,
};
