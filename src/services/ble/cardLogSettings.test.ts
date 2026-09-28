import { buildCardLogSettingsRequest, parseCardLogSettingsStatus } from './cardLogSettings';

const viewFromBytes = (...bytes: number[]): DataView => {
  const buffer = new ArrayBuffer(bytes.length);
  const array = new Uint8Array(buffer);
  array.set(bytes);
  return new DataView(buffer);
};

describe('cardLogSettings', () => {
  it('builds read, restore, interval, and next-boot auto-start write requests', () => {
    expect(Array.from(buildCardLogSettingsRequest({ op: 'read' }))).toEqual([0x00]);
    expect(Array.from(buildCardLogSettingsRequest({ op: 'restoreDefault' }))).toEqual([0x02]);
    expect(Array.from(buildCardLogSettingsRequest({ op: 'setIntervalMs', intervalMs: 1000 }))).toEqual([
      0x01, 0xe8, 0x03, 0x00, 0x00,
    ]);
    expect(Array.from(buildCardLogSettingsRequest({ op: 'setAutoStart', autoStartEnabled: true }))).toEqual([0x03, 0x01]);
    expect(Array.from(buildCardLogSettingsRequest({ op: 'setAutoStart', autoStartEnabled: false }))).toEqual([0x03, 0x00]);
  });

  it('parses the 20 byte settings status', () => {
    expect(parseCardLogSettingsStatus(viewFromBytes(
      3, 3, 0, 0x0f,
      0xe8, 0x03, 0x00, 0x00,
      0x64, 0x00, 0x00, 0x00,
      0xc0, 0x27, 0x09, 0x00,
      0xe8, 0x03, 0x00, 0x00
    ))).toEqual({
      protocolVersion: 3,
      lastOpCode: 3,
      lastOp: 'setAutoStart',
      resultCode: 0,
      result: 'ok',
      flags: 0x0f,
      persisted: true,
      stmIntervalKnown: true,
      defaultInterval: true,
      autoStartEnabled: true,
      currentIntervalMs: 1000,
      minIntervalMs: 100,
      maxIntervalMs: 600000,
      stm32IntervalMs: 1000,
    });
  });

  it('parses out-of-range results and unknown STM32 interval', () => {
    expect(parseCardLogSettingsStatus(viewFromBytes(
      1, 1, 7, 0x00,
      0x32, 0x00, 0x00, 0x00,
      0x64, 0x00, 0x00, 0x00,
      0xc0, 0x27, 0x09, 0x00,
      0x00, 0x00, 0x00, 0x00
    ))).toMatchObject({
      lastOp: 'setIntervalMs',
      result: 'outOfRange',
      currentIntervalMs: 50,
      minIntervalMs: 100,
      maxIntervalMs: 600000,
      stm32IntervalMs: null,
      stmIntervalKnown: false,
    });
  });

  it('parses exact-source-cadence rejection results from protocol v2', () => {
    expect(parseCardLogSettingsStatus(viewFromBytes(
      2, 1, 8, 0x01,
      0x64, 0x00, 0x00, 0x00,
      0x64, 0x00, 0x00, 0x00,
      0xc0, 0x27, 0x09, 0x00,
      0x00, 0x00, 0x00, 0x00
    ))).toMatchObject({
      protocolVersion: 2,
      lastOp: 'setIntervalMs',
      resultCode: 8,
      result: 'sourceIntervalUnknown',
      stmIntervalKnown: false,
      stm32IntervalMs: null,
    });

    expect(parseCardLogSettingsStatus(viewFromBytes(
      2, 1, 9, 0x03,
      0x96, 0x00, 0x00, 0x00,
      0x64, 0x00, 0x00, 0x00,
      0xc0, 0x27, 0x09, 0x00,
      0x64, 0x00, 0x00, 0x00
    ))).toMatchObject({
      protocolVersion: 2,
      lastOp: 'setIntervalMs',
      resultCode: 9,
      result: 'intervalNotAligned',
      stmIntervalKnown: true,
      stm32IntervalMs: 100,
    });
  });

  it('parses invalid auto-start values from protocol v3', () => {
    expect(parseCardLogSettingsStatus(viewFromBytes(
      3, 3, 10, 0x00,
      0x64, 0x00, 0x00, 0x00,
      0x64, 0x00, 0x00, 0x00,
      0xc0, 0x27, 0x09, 0x00,
      0x64, 0x00, 0x00, 0x00
    ))).toMatchObject({
      protocolVersion: 3,
      lastOp: 'setAutoStart',
      resultCode: 10,
      result: 'invalidValue',
      autoStartEnabled: false,
    });
  });
});
