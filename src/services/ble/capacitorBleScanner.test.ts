import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CapacitorBleDeviceIdentify } from './capacitorBleDeviceIdentify';
import {
  CAPACITOR_BLE_SCAN_DURATION_MS,
  CAPACITOR_BLE_SCAN_START_TIMEOUT_MS,
  CapacitorBleScanner,
} from './capacitorBleScanner';

type ScanResult = { device: { deviceId: string; name: string }; rssi: number };
type ScanCallback = (result: ScanResult) => void;

const bleClient = vi.hoisted(() => ({
  requestLEScan: vi.fn(),
  stopLEScan: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  write: vi.fn(),
  writeWithoutResponse: vi.fn(),
}));

vi.mock('@capacitor-community/bluetooth-le', () => ({
  BleClient: bleClient,
  numbersToDataView: (values: number[]) => new DataView(Uint8Array.from(values).buffer),
}));

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

const result = (deviceId: string): ScanResult => ({
  device: { deviceId, name: `ULSA EVO ${deviceId}` },
  rssi: -60,
});

describe('CapacitorBleScanner ownership and native stop barrier', () => {
  let callback: ScanCallback;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    bleClient.stopLEScan.mockResolvedValue(undefined);
    bleClient.requestLEScan.mockImplementation(async (_options, onResult: ScanCallback) => {
      callback = onResult;
    });
    bleClient.connect.mockResolvedValue(undefined);
    bleClient.disconnect.mockResolvedValue(undefined);
    bleClient.write.mockResolvedValue(undefined);
    bleClient.writeWithoutResponse.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the full passive five-second window and publishes later candidates', async () => {
    const scanner = new CapacitorBleScanner();
    const found = vi.fn();
    let finished = false;
    const scan = scanner.scan(['181a'], found).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(0);
    callback(result('a'));
    await vi.advanceTimersByTimeAsync(CAPACITOR_BLE_SCAN_DURATION_MS - 1);
    callback(result('b'));
    expect(finished).toBe(false);
    expect(found.mock.calls.map(([device]) => device.device.deviceId)).toEqual(['a', 'b']);
    await vi.advanceTimersByTimeAsync(1);
    await scan;
    expect(bleClient.stopLEScan).toHaveBeenCalledTimes(2);
    callback(result('late'));
    expect(found).toHaveBeenCalledTimes(2);
  });

  it('reserves cancellation before initial cleanup and prevents late startup', async () => {
    const cleanup = deferred();
    bleClient.stopLEScan.mockReturnValue(cleanup.promise);
    const scanner = new CapacitorBleScanner();
    const scan = scanner.scan(['181a'], vi.fn());
    const stop = scanner.stop();
    expect(bleClient.stopLEScan).toHaveBeenCalledTimes(1);
    cleanup.resolve();
    await Promise.all([scan, stop]);
    expect(bleClient.requestLEScan).not.toHaveBeenCalled();
  });

  it('coalesces repeated stops while cleanup is pending', async () => {
    const cleanup = deferred();
    bleClient.stopLEScan.mockReturnValue(cleanup.promise);
    const scanner = new CapacitorBleScanner();
    const scan = scanner.scan(['181a'], vi.fn());
    const firstStop = scanner.stop();
    const secondStop = scanner.stop();
    expect(bleClient.stopLEScan).toHaveBeenCalledTimes(1);
    cleanup.resolve();
    await Promise.all([scan, firstStop, secondStop]);
    expect(bleClient.requestLEScan).not.toHaveBeenCalled();
  });

  it('starts only the newest owner when two scans overlap initial cleanup', async () => {
    const cleanup = deferred();
    bleClient.stopLEScan.mockReturnValueOnce(cleanup.promise);
    const scanner = new CapacitorBleScanner();
    const firstFound = vi.fn();
    const secondFound = vi.fn();
    const first = scanner.scan(['first'], firstFound);
    const second = scanner.scan(['second'], secondFound);
    cleanup.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await first;
    expect(bleClient.requestLEScan).toHaveBeenCalledTimes(1);
    expect(bleClient.requestLEScan).toHaveBeenCalledWith({ services: ['second'] }, expect.any(Function));
    callback(result('b'));
    expect(firstFound).not.toHaveBeenCalled();
    expect(secondFound).toHaveBeenCalledOnce();
    await scanner.stop();
    await second;
  });

  it('awaits native stop when cancellation occurs before scan-start acknowledgement', async () => {
    const startup = deferred();
    const nativeStop = deferred();
    bleClient.requestLEScan.mockImplementation((_options, onResult: ScanCallback) => {
      callback = onResult;
      return startup.promise;
    });
    bleClient.stopLEScan.mockResolvedValueOnce(undefined).mockReturnValueOnce(nativeStop.promise);
    const scanner = new CapacitorBleScanner();
    const found = vi.fn();
    let finished = false;
    const scan = scanner.scan(['181a'], found).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(0);
    const stop = scanner.stop();
    callback(result('late'));
    startup.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).toBe(false);
    expect(found).not.toHaveBeenCalled();
    nativeStop.resolve();
    await Promise.all([scan, stop]);
    expect(finished).toBe(true);
    expect(bleClient.stopLEScan).toHaveBeenCalledTimes(2);
  });

  it('retains discovered results but clears the dwell timer when manually stopped', async () => {
    const scanner = new CapacitorBleScanner();
    const found = vi.fn();
    const scan = scanner.scan(['181a'], found);
    await vi.advanceTimersByTimeAsync(0);
    callback(result('a'));
    await scanner.stop();
    await scan;
    expect(found).toHaveBeenCalledWith(result('a'));
    callback(result('late'));
    expect(found).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not complete a cancelled scan before delayed native stop acknowledgement', async () => {
    const nativeStop = deferred();
    bleClient.stopLEScan.mockResolvedValueOnce(undefined).mockReturnValueOnce(nativeStop.promise);
    const scanner = new CapacitorBleScanner();
    let finished = false;
    const scan = scanner.scan(['181a'], vi.fn()).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(0);
    const stop = scanner.stop();
    await vi.advanceTimersByTimeAsync(CAPACITOR_BLE_SCAN_DURATION_MS);
    expect(finished).toBe(false);
    nativeStop.resolve();
    await Promise.all([scan, stop]);
  });

  it('propagates native stop failure to both the stopper and cancelled scan', async () => {
    const nativeStop = deferred();
    bleClient.stopLEScan.mockResolvedValueOnce(undefined).mockReturnValueOnce(nativeStop.promise);
    const scanner = new CapacitorBleScanner();
    const scan = scanner.scan(['181a'], vi.fn());
    const scanFailure = expect(scan).rejects.toThrow('BLE検索を停止できませんでした');
    await vi.advanceTimersByTimeAsync(0);
    const stopFailure = expect(scanner.stop()).rejects.toThrow('BLE検索を停止できませんでした');
    nativeStop.reject(new Error('native radio stop failed'));
    await Promise.all([scanFailure, stopFailure]);
    expect(bleClient.stopLEScan).toHaveBeenCalledTimes(2);
  });

  it('does not start after failed initial cleanup and allows a later successful retry', async () => {
    bleClient.stopLEScan.mockRejectedValueOnce(new Error('native stop failed'));
    const scanner = new CapacitorBleScanner();
    await expect(scanner.scan(['181a'], vi.fn())).rejects.toThrow('BLE検索を停止できませんでした');
    expect(bleClient.requestLEScan).not.toHaveBeenCalled();
    const retry = scanner.scan(['181a'], vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(bleClient.requestLEScan).toHaveBeenCalledOnce();
    await scanner.stop();
    await retry;
  });

  it('reports failed native stop when the passive window ends', async () => {
    bleClient.stopLEScan.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('stop failed'));
    const scanner = new CapacitorBleScanner();
    const failure = expect(scanner.scan(['181a'], vi.fn())).rejects.toThrow('BLE検索を停止できませんでした');
    await vi.advanceTimersByTimeAsync(CAPACITOR_BLE_SCAN_DURATION_MS);
    await failure;
  });

  it('keeps the existing startup timeout and waits for cleanup before exposing that error', async () => {
    const nativeStop = deferred();
    bleClient.requestLEScan.mockReturnValue(new Promise<void>(() => undefined));
    bleClient.stopLEScan.mockResolvedValueOnce(undefined).mockReturnValueOnce(nativeStop.promise);
    const scanner = new CapacitorBleScanner();
    let settled = false;
    const scan = scanner.scan(['181a'], vi.fn()).catch((error: unknown) => {
      settled = true;
      throw error;
    });
    const failure = expect(scan).rejects.toThrow('BLE検索を開始できませんでした');
    await vi.advanceTimersByTimeAsync(CAPACITOR_BLE_SCAN_START_TIMEOUT_MS);
    expect(bleClient.stopLEScan).toHaveBeenCalledTimes(2);
    expect(settled).toBe(false);
    nativeStop.resolve();
    await failure;
  });

  it('reclaims native scan state after a rejected startup', async () => {
    bleClient.requestLEScan.mockRejectedValueOnce(new Error('startup failed'));
    const scanner = new CapacitorBleScanner();
    await expect(scanner.scan(['181a'], vi.fn())).rejects.toThrow('startup failed');
    expect(bleClient.stopLEScan).toHaveBeenCalledTimes(2);
  });

  it('does not let an old finally stop the newer active scan', async () => {
    const reclaim = deferred();
    bleClient.stopLEScan.mockResolvedValueOnce(undefined).mockReturnValueOnce(reclaim.promise);
    const scanner = new CapacitorBleScanner();
    const firstFound = vi.fn();
    const first = scanner.scan(['first'], firstFound);
    await vi.advanceTimersByTimeAsync(0);
    const oldCallback = callback;
    const secondFound = vi.fn();
    const second = scanner.scan(['second'], secondFound);
    oldCallback(result('stale'));
    reclaim.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await first;
    expect(firstFound).not.toHaveBeenCalled();
    expect(bleClient.stopLEScan).toHaveBeenCalledTimes(2);
    callback(result('b'));
    expect(secondFound).toHaveBeenCalledOnce();
    await scanner.stop();
    await second;
    expect(bleClient.stopLEScan).toHaveBeenCalledTimes(3);
  });

  it('can stop again after the completed scan without restarting anything', async () => {
    const scanner = new CapacitorBleScanner();
    const scan = scanner.scan(['181a'], vi.fn());
    await vi.advanceTimersByTimeAsync(CAPACITOR_BLE_SCAN_DURATION_MS);
    await scan;
    await scanner.stop();
    expect(bleClient.requestLEScan).toHaveBeenCalledOnce();
    expect(bleClient.stopLEScan).toHaveBeenCalledTimes(3);
  });

  it('cancels the scanner owner before LED identification and waits for the same stop barrier', async () => {
    const nativeStop = deferred();
    bleClient.stopLEScan.mockResolvedValueOnce(undefined).mockReturnValueOnce(nativeStop.promise);
    const scanner = new CapacitorBleScanner();
    const identify = new CapacitorBleDeviceIdentify(() => null, () => scanner.stop());
    const found = vi.fn();
    const scan = scanner.scan(['181a'], found);
    await vi.advanceTimersByTimeAsync(0);
    const identification = identify.identify('a');
    callback(result('late'));
    await vi.advanceTimersByTimeAsync(0);
    expect(found).not.toHaveBeenCalled();
    expect(bleClient.connect).not.toHaveBeenCalled();
    nativeStop.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await scan;
    expect(bleClient.connect).toHaveBeenCalledWith('a');
    expect(bleClient.disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    await identification;
    expect(bleClient.disconnect).toHaveBeenCalledWith('a');
  });

  it('does no temporary GATT work if the identify scan-stop barrier fails', async () => {
    bleClient.stopLEScan.mockRejectedValueOnce(new Error('native stop failed'));
    const scanner = new CapacitorBleScanner();
    const identify = new CapacitorBleDeviceIdentify(() => null, () => scanner.stop());
    await expect(identify.identify('a')).rejects.toThrow('BLE検索を停止できませんでした');
    await identify.waitForIdle();
    expect(bleClient.connect).not.toHaveBeenCalled();
    expect(bleClient.write).not.toHaveBeenCalled();
    expect(bleClient.disconnect).not.toHaveBeenCalled();
  });
});
