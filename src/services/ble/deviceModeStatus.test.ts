import { describe, expect, it } from 'vitest';
import { getDeviceModeLabel, getDeviceModePhyLabel, parseDeviceModeStatus } from './deviceModeStatus';

const viewFromBytes = (...bytes: number[]): DataView =>
  new DataView(Uint8Array.from(bytes).buffer);

describe('deviceModeStatus', () => {
  it('parses ESP32 I2C measure mode status', () => {
    expect(parseDeviceModeStatus(viewFromBytes(1, 1, 0x05, 0))).toEqual({
      protocolVersion: 1,
      modeCode: 1,
      mode: 'i2cMeasure',
      flags: 0x05,
      phyCode: 0,
      phy: '1m',
      bleConnected: true,
      uartBridgeEnabled: false,
      i2cMeasureActive: true,
      commandMode: false,
      bootloaderMode: false,
      wifiPortalActive: false,
      stm32UpdateActive: false,
    });
  });

  it('treats a non-zero legacy PHY byte as reserved', () => {
    expect(parseDeviceModeStatus(viewFromBytes(1, 3, 0x03, 1))).toMatchObject({
      mode: 'uartBridge',
      phy: 'reserved',
      bleConnected: true,
      uartBridgeEnabled: true,
      i2cMeasureActive: false,
    });
  });

  it('parses STM32 update mode status', () => {
    expect(parseDeviceModeStatus(viewFromBytes(1, 6, 0x60, 0))).toMatchObject({
      modeCode: 6,
      mode: 'stm32Update',
      wifiPortalActive: true,
      stm32UpdateActive: true,
    });
  });

  it('labels known modes and the released 1M-only PHY contract', () => {
    expect(getDeviceModeLabel('command')).toBe('コマンド');
    expect(getDeviceModeLabel('stm32Update')).toBe('STM32更新');
    expect(getDeviceModeLabel('unknown')).toBe('不明');
    expect(getDeviceModePhyLabel('reserved')).toBe('予約値（非対応）');
  });

  it('rejects short payloads', () => {
    expect(() => parseDeviceModeStatus(viewFromBytes(1, 1, 0x05))).toThrow('短すぎます');
  });
});
