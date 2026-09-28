import { describe, expect, it } from 'vitest';
import {
  buildDeviceResetRequest,
  createOptimisticDeviceResetStatus,
  parseDeviceResetStatus,
} from './deviceResetControl';

const viewFromBytes = (...bytes: number[]): DataView =>
  new DataView(Uint8Array.from(bytes).buffer);

describe('deviceResetControl', () => {
  it('builds ESP32 and STM32 reset requests', () => {
    expect(Array.from(buildDeviceResetRequest('read'))).toEqual([0]);
    expect(Array.from(buildDeviceResetRequest('resetEsp32'))).toEqual([1]);
    expect(Array.from(buildDeviceResetRequest('resetStm32'))).toEqual([2]);
  });

  it('parses reset status payload flags and target', () => {
    expect(parseDeviceResetStatus(viewFromBytes(1, 2, 0, 0x08, 2, 0))).toEqual({
      protocolVersion: 1,
      lastOpCode: 2,
      lastOp: 'resetStm32',
      resultCode: 0,
      result: 'ok',
      flags: 0x08,
      esp32ResetPending: false,
      stm32ResetPending: false,
      esp32Rebooting: false,
      stm32Resetting: true,
      targetCode: 2,
      target: 'stm32',
    });
  });

  it('creates an optimistic status for ESP32 reboot disconnects', () => {
    expect(createOptimisticDeviceResetStatus('esp32')).toMatchObject({
      lastOp: 'resetEsp32',
      result: 'ok',
      esp32Rebooting: true,
      target: 'esp32',
    });
  });
});
