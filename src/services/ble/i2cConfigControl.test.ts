import { describe, expect, it } from 'vitest';
import {
  buildI2cConfigRequest,
  formatI2cAddress,
  isI2cConfigOperationComplete,
  parseI2cConfigStatus,
} from './i2cConfigControl';

describe('i2cConfigControl', () => {
  it('parses a 16-byte I2C config status payload', () => {
    const data = new DataView(new Uint8Array([
      1, 0x13, 0, 2, 3, 1, 7, 16, 1, 0x42, 1, 100, 0, 6, 0x42, 0x07,
    ]).buffer);

    expect(parseI2cConfigStatus(data)).toMatchObject({
      protocolVersion: 1,
      lastOp: 'setI2cAddress',
      result: 'ok',
      remoteCommandStatus: 2,
      remoteLastError: 3,
      nodeId: 7,
      avgCycle: 16,
      windDirInstallMode: 1,
      i2cAddress: 0x42,
      i2cSlaveEnabled: true,
      measurementIntervalMs: 100,
      remoteRegisterVersion: 6,
      currentTargetI2cAddress: 0x42,
      rebootRequired: true,
      detected: true,
      configWriteSupported: true,
    });
  });

  it('builds set and command requests', () => {
    expect(Array.from(buildI2cConfigRequest({ op: 'setAvgCycle', value: 32 }))).toEqual([0x11, 32]);
    expect(Array.from(buildI2cConfigRequest({ op: 'save' }))).toEqual([0x20]);
  });

  it('parses v2 correlation sequences and requires a new operation generation', () => {
    const makeStatus = (operationSeq: number, result = 0) => parseI2cConfigStatus(
      new DataView(new Uint8Array([
        2, 0x20, result, 0, 0, 0, 7, 16, 0, 0x50, 1, 100, 0, 8, 0x50, 0x06,
        operationSeq, 44,
      ]).buffer)
    );
    const baseline = makeStatus(9);
    const stale = makeStatus(9);
    const completed = makeStatus(10);

    expect(completed.operationSeq).toBe(10);
    expect(completed.remoteCommandResultSeq).toBe(44);
    expect(isI2cConfigOperationComplete(stale, 'save', baseline)).toBe(false);
    expect(isI2cConfigOperationComplete(completed, 'save', baseline)).toBe(true);
  });

  it('accepts v2 wraparound only for the matching terminal operation', () => {
    const makeStatus = (operationSeq: number, op = 0x20, result = 0) => parseI2cConfigStatus(
      new DataView(new Uint8Array([
        2, op, result, 0, 0, 0, 7, 16, 0, 0x50, 1, 100, 0, 8, 0x50, 0x06,
        operationSeq, 0,
      ]).buffer)
    );
    const baseline = makeStatus(255);

    expect(isI2cConfigOperationComplete(makeStatus(0, 0x20, 0), 'save', baseline)).toBe(true);
    expect(isI2cConfigOperationComplete(makeStatus(0, 0x21, 0), 'save', baseline)).toBe(false);
    expect(isI2cConfigOperationComplete(makeStatus(0, 0x20, 1), 'save', baseline)).toBe(false);
  });

  it('treats a new-generation busy result as a terminal rejection', () => {
    const makeStatus = (operationSeq: number, result: number) => parseI2cConfigStatus(
      new DataView(new Uint8Array([
        2, 0x20, result, 0, 0, 0, 7, 16, 0, 0x50, 1, 100, 0, 8, 0x50, 0x06,
        operationSeq, 44,
      ]).buffer)
    );

    expect(isI2cConfigOperationComplete(makeStatus(10, 0x02), 'save', makeStatus(9, 0))).toBe(true);
  });

  it('keeps the v1 terminal-result fallback for legacy STM32 firmware', () => {
    const baseline = parseI2cConfigStatus(new DataView(new Uint8Array([
      1, 0x20, 1, 1, 0, 0, 7, 16, 0, 0x50, 1, 100, 0, 7, 0x50, 0x06,
    ]).buffer));
    const completed = parseI2cConfigStatus(new DataView(new Uint8Array([
      1, 0x20, 0, 0, 0, 0, 7, 16, 0, 0x50, 1, 100, 0, 7, 0x50, 0x06,
    ]).buffer));

    expect(isI2cConfigOperationComplete(completed, 'save', baseline)).toBe(true);
  });

  it('rejects invalid config values before BLE write', () => {
    expect(() => buildI2cConfigRequest({ op: 'setI2cAddress', value: 0x02 })).toThrow('範囲外');
    expect(() => buildI2cConfigRequest({ op: 'setAvgCycle', value: 3 })).toThrow('範囲外');
  });

  it('formats I2C addresses as uppercase hex', () => {
    expect(formatI2cAddress(0x8)).toBe('0x08');
    expect(formatI2cAddress(0x42)).toBe('0x42');
  });
});
