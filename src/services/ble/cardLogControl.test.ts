import { describe, expect, it } from 'vitest';
import { buildCardLogControlRequest, parseCardLogControlStatus } from './cardLogControl';

const viewFromBytes = (...bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);

describe('cardLogControl', () => {
  it('builds カードログ control requests', () => {
    expect(Array.from(buildCardLogControlRequest('read'))).toEqual([0x00]);
    expect(Array.from(buildCardLogControlRequest('start'))).toEqual([0x01]);
    expect(Array.from(buildCardLogControlRequest('stop'))).toEqual([0x02]);
  });

  it('parses カードログ control status', () => {
    expect(parseCardLogControlStatus(viewFromBytes(1, 0x01, 0, 3, 0x07, 0))).toEqual({
      protocolVersion: 1,
      lastOpCode: 0x01,
      lastOp: 'start',
      resultCode: 0,
      result: 'ok',
      cardState: 3,
      flags: 0x07,
      cardAvailable: true,
      loggingEnabled: true,
      canLog: true,
      stopReasonCode: 0,
    });
  });

  it('rejects truncated カードログ control status', () => {
    expect(() => parseCardLogControlStatus(viewFromBytes(1, 0x01, 0, 3, 0x07))).toThrow('短すぎます');
  });

  it('decodes a start rejected outside I2C measurement without changing the status length', () => {
    const status = parseCardLogControlStatus(viewFromBytes(1, 0x01, 0x07, 3, 0x01, 0));
    expect(status.result).toBe('wrongMode');
    expect(status.loggingEnabled).toBe(false);
  });
});
