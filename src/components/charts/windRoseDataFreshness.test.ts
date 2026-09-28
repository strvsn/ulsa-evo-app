import { describe, expect, it } from 'vitest';
import { SENSOR_DATA_STALE_MS } from '../../hooks/ble/constants';
import { resolveWindRoseDataFreshness } from './windRoseDataFreshness';

describe('resolveWindRoseDataFreshness', () => {
  it('reports disconnected without reusing timestamps', () => {
    expect(resolveWindRoseDataFreshness({
      isConnected: false,
      windSpeedReceivedAt: 9_000,
      windDirectionReceivedAt: 9_500,
      nowMs: 10_000,
    })).toEqual({ dataState: 'disconnected', sampleTimestampMs: null });
  });

  it('waits until both wind characteristics have been received', () => {
    expect(resolveWindRoseDataFreshness({
      isConnected: true,
      windSpeedReceivedAt: 9_000,
      nowMs: 10_000,
    })).toEqual({ dataState: 'waiting', sampleTimestampMs: null });
  });

  it('uses the older wind field timestamp as the complete sample time', () => {
    expect(resolveWindRoseDataFreshness({
      isConnected: true,
      windSpeedReceivedAt: 9_700,
      windDirectionReceivedAt: 9_200,
      nowMs: 10_000,
    })).toEqual({ dataState: 'live', sampleTimestampMs: 9_200 });
  });

  it('becomes stale when either wind field stops despite the other remaining fresh', () => {
    expect(resolveWindRoseDataFreshness({
      isConnected: true,
      windSpeedReceivedAt: 9_900,
      windDirectionReceivedAt: 10_000 - SENSOR_DATA_STALE_MS - 1,
      nowMs: 10_000,
    })).toEqual({
      dataState: 'stale',
      sampleTimestampMs: 10_000 - SENSOR_DATA_STALE_MS - 1,
    });
  });

  it('also becomes stale when speed stops while direction remains fresh', () => {
    expect(resolveWindRoseDataFreshness({
      isConnected: true,
      windSpeedReceivedAt: 10_000 - SENSOR_DATA_STALE_MS - 1,
      windDirectionReceivedAt: 9_900,
      nowMs: 10_000,
    }).dataState).toBe('stale');
  });

  it('keeps the exact stale boundary live to match the BLE state contract', () => {
    expect(resolveWindRoseDataFreshness({
      isConnected: true,
      windSpeedReceivedAt: 10_000 - SENSOR_DATA_STALE_MS,
      windDirectionReceivedAt: 10_000,
      nowMs: 10_000,
    }).dataState).toBe('live');
  });
});
