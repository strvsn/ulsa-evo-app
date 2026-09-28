import { SENSOR_DATA_STALE_MS } from '../../hooks/ble/constants';
import type { WindPipDataState } from '../../services/nativeWindPip';

export interface WindRoseDataFreshness {
  dataState: WindPipDataState;
  /** Oldest timestamp required to form a complete wind vector sample. */
  sampleTimestampMs: number | null;
}

const isValidTimestamp = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0;

/**
 * Wind rendering requires both speed and direction. General sensor liveness is
 * insufficient because temperature notifications can continue after either
 * wind characteristic has stopped.
 */
export const resolveWindRoseDataFreshness = ({
  isConnected,
  windSpeedReceivedAt,
  windDirectionReceivedAt,
  nowMs = Date.now(),
}: {
  isConnected: boolean;
  windSpeedReceivedAt?: number;
  windDirectionReceivedAt?: number;
  nowMs?: number;
}): WindRoseDataFreshness => {
  if (!isConnected) return { dataState: 'disconnected', sampleTimestampMs: null };
  if (!isValidTimestamp(windSpeedReceivedAt) || !isValidTimestamp(windDirectionReceivedAt)) {
    return { dataState: 'waiting', sampleTimestampMs: null };
  }

  const sampleTimestampMs = Math.min(windSpeedReceivedAt, windDirectionReceivedAt);
  return {
    dataState: nowMs - sampleTimestampMs > SENSOR_DATA_STALE_MS ? 'stale' : 'live',
    sampleTimestampMs,
  };
};
