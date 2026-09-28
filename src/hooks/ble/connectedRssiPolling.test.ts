import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONNECTED_RSSI_POLL_INTERVAL_MS,
  startConnectedRssiPolling,
} from './connectedRssiPolling';

describe('connected RSSI polling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads immediately, refreshes every five seconds, and stops cleanly', async () => {
    vi.useFakeTimers();
    const readRssi = vi.fn()
      .mockResolvedValueOnce(-72)
      .mockResolvedValueOnce(-58);
    const onRssi = vi.fn();

    const stop = startConnectedRssiPolling(readRssi, onRssi);
    await vi.advanceTimersByTimeAsync(0);
    expect(onRssi).toHaveBeenLastCalledWith(-72);

    await vi.advanceTimersByTimeAsync(CONNECTED_RSSI_POLL_INTERVAL_MS);
    expect(onRssi).toHaveBeenLastCalledWith(-58);

    stop();
    await vi.advanceTimersByTimeAsync(CONNECTED_RSSI_POLL_INTERVAL_MS * 2);
    expect(readRssi).toHaveBeenCalledTimes(2);
  });

  it('does not overlap reads and retries after a supplemental read failure', async () => {
    vi.useFakeTimers();
    let resolveFirst: ((value: number) => void) | undefined;
    const readRssi = vi.fn()
      .mockImplementationOnce(() => new Promise<number>((resolve) => { resolveFirst = resolve; }))
      .mockRejectedValueOnce(new Error('temporary native RSSI failure'))
      .mockResolvedValueOnce(-61);
    const onRssi = vi.fn();

    const stop = startConnectedRssiPolling(readRssi, onRssi);
    await vi.advanceTimersByTimeAsync(CONNECTED_RSSI_POLL_INTERVAL_MS);
    expect(readRssi).toHaveBeenCalledTimes(1);

    resolveFirst?.(-70);
    await vi.advanceTimersByTimeAsync(0);
    expect(onRssi).toHaveBeenLastCalledWith(-70);

    await vi.advanceTimersByTimeAsync(CONNECTED_RSSI_POLL_INTERVAL_MS);
    expect(onRssi).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CONNECTED_RSSI_POLL_INTERVAL_MS);
    expect(onRssi).toHaveBeenLastCalledWith(-61);
    stop();
  });

  it('pauses reads while hidden and refreshes immediately when visible again', async () => {
    vi.useFakeTimers();
    let visibilityState: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
    const readRssi = vi.fn().mockResolvedValue(-64);
    const onRssi = vi.fn();

    const stop = startConnectedRssiPolling(readRssi, onRssi);
    await vi.advanceTimersByTimeAsync(0);
    expect(readRssi).toHaveBeenCalledTimes(1);

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(CONNECTED_RSSI_POLL_INTERVAL_MS * 2);
    expect(readRssi).toHaveBeenCalledTimes(1);

    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(readRssi).toHaveBeenCalledTimes(2);
    stop();
  });
});
