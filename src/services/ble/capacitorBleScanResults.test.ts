import { describe, expect, it } from 'vitest';
import { normalizeCapacitorBleScanResult } from './capacitorBleScanResults';

const dataViewFromBytes = (...bytes: number[]): DataView =>
  new DataView(Uint8Array.from(bytes).buffer);

describe('normalizeCapacitorBleScanResult', () => {
  it('ignores scan callbacks without a device', () => {
    expect(normalizeCapacitorBleScanResult({ rssi: -60 })).toBeNull();
  });

  it('prefers Environmental Sensing service data over an iOS-cached name', () => {
    expect(normalizeCapacitorBleScanResult({
      device: { deviceId: 'device-a', name: 'ULSA EVO #0' },
      localName: 'ULSA EVO #0',
      rssi: -64,
      serviceData: {
        '0000181A-0000-1000-8000-00805F9B34FB': dataViewFromBytes(123, 0),
      },
    })).toEqual({
      deviceId: 'device-a',
      name: 'ULSA EVO #123',
      nodeId: 123,
      rssi: -64,
    });
  });

  it('falls back to the received device name when service data is unavailable', () => {
    expect(normalizeCapacitorBleScanResult({
      device: { deviceId: 'device-b', name: 'ULSA EVO #17' },
      rssi: -72,
    })).toEqual({
      deviceId: 'device-b',
      name: 'ULSA EVO #17',
      nodeId: 17,
      rssi: -72,
    });
  });
});
