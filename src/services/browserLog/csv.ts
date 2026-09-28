import type { SensorData } from '../../types/ble';

export const BROWSER_LOG_CSV_HEADER = [
  'timestamp_iso',
  'timestamp_epoch_ms',
  'browser_received_at_epoch_ms',
  'direction[deg]',
  'speed[m/s]',
  'head_speed[m/s]',
  'sound_speed[m/s]',
  'sonic_temp[degC]',
  'sensor_status',
  'status_protocol_version',
  'status_flags',
  'service_status',
  'active_cause',
  'ntc_reading_status',
].join(',') + '\r\n';

const encoder = new TextEncoder();

export const getUtf8ByteLength = (text: string): number => encoder.encode(text).byteLength;

const formatFinite = (value: number, digits: number): string =>
  Number.isFinite(value) ? value.toFixed(digits) : '';

const formatInteger = (value: number): string =>
  Number.isFinite(value) ? String(Math.trunc(value)) : '';

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

const formatLocalTimestamp = (
  timestampMs: number,
  explicitUtcOffsetMinutes?: number,
): { iso: string; filename: string } | null => {
  const instant = new Date(timestampMs);
  const offsetMinutes = explicitUtcOffsetMinutes ?? -instant.getTimezoneOffset();
  if (!Number.isFinite(timestampMs) || Number.isNaN(instant.getTime()) ||
      !Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 14 * 60) return null;

  const local = new Date(timestampMs + offsetMinutes * 60_000);
  if (Number.isNaN(local.getTime())) return null;
  const year = pad(local.getUTCFullYear(), 4);
  const month = pad(local.getUTCMonth() + 1, 2);
  const day = pad(local.getUTCDate(), 2);
  const hour = pad(local.getUTCHours(), 2);
  const minute = pad(local.getUTCMinutes(), 2);
  const second = pad(local.getUTCSeconds(), 2);
  const millisecond = pad(local.getUTCMilliseconds(), 3);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHour = pad(Math.floor(absoluteOffset / 60), 2);
  const offsetMinute = pad(absoluteOffset % 60, 2);

  return {
    iso: `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}${sign}${offsetHour}:${offsetMinute}`,
    filename: `${year}${month}${day}_${hour}${minute}${second}`,
  };
};

/** The receiving terminal's local time, with an explicit offset for later interpretation. */
export const formatBrowserLogTimestampIso = (
  timestampMs: number,
  explicitUtcOffsetMinutes?: number,
): string => formatLocalTimestamp(timestampMs, explicitUtcOffsetMinutes)?.iso ?? '';

export const formatBrowserLogFilenameTimestamp = (
  timestampMs: number,
  explicitUtcOffsetMinutes?: number,
): string => {
  const value = formatLocalTimestamp(timestampMs, explicitUtcOffsetMinutes);
  if (!value) throw new RangeError('Invalid browser log timestamp');
  return value.filename;
};

export const formatBrowserLogCsvRow = (
  sample: SensorData,
  receivedAt: number = sample.timestamp
): string => {
  const timestampMs = Number.isFinite(sample.timestamp) ? sample.timestamp : receivedAt;

  return [
    formatBrowserLogTimestampIso(timestampMs),
    formatInteger(timestampMs),
    formatInteger(receivedAt),
    formatFinite(sample.windDirection, 2),
    formatFinite(sample.windSpeed, 3),
    formatFinite(sample.headingSpeed, 3),
    formatFinite(sample.soundSpeed, 3),
    formatFinite(sample.temperature, 2),
    formatInteger(sample.sensorStatus),
    formatInteger(sample.statusProtocolVersion ?? Number.NaN),
    formatInteger(sample.statusFlags ?? Number.NaN),
    formatInteger(sample.serviceStatus ?? Number.NaN),
    formatInteger(sample.activeCause ?? Number.NaN),
    formatInteger(sample.ntcReadingStatus ?? Number.NaN),
  ].join(',') + '\r\n';
};
