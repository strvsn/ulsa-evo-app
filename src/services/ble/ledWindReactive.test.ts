import { describe, expect, it } from 'vitest';
import {
  buildLEDWindReactiveConfigPayload,
  isLEDWindReactiveOperationComplete,
  ledWindReactiveThemeCode,
  parseLEDWindReactiveStatus,
} from './ledWindReactive';

const viewFromBytes = (...bytes: number[]): DataView =>
  new DataView(Uint8Array.from(bytes).buffer);

describe('LED Wind Reactive BLE contract', () => {
  it('uses a compact set-config request with a stable theme mapping', () => {
    expect(ledWindReactiveThemeCode('tide')).toBe(0);
    expect(ledWindReactiveThemeCode('aurora')).toBe(4);
    expect([...buildLEDWindReactiveConfigPayload({ enabled: true, theme: 'viridis' })])
      .toEqual([1, 1, 2]);
  });

  it('parses status flags and requires an acknowledged matching config', () => {
    const status = parseLEDWindReactiveStatus(viewFromBytes(1, 1, 0, 0x07, 3, 0));
    expect(status).toMatchObject({
      protocolVersion: 1,
      lastOp: 'setConfig',
      result: 'ok',
      enabled: true,
      active: true,
      persisted: true,
      theme: 'ember',
    });
    expect(isLEDWindReactiveOperationComplete(status, { enabled: true, theme: 'ember' })).toBe(true);
    expect(isLEDWindReactiveOperationComplete(status, { enabled: false, theme: 'ember' })).toBe(false);
  });

  it('rejects malformed status and unknown theme IDs', () => {
    expect(() => parseLEDWindReactiveStatus(viewFromBytes(1, 1, 0, 0x00, 5, 0)))
      .toThrow('theme is invalid');
    expect(() => parseLEDWindReactiveStatus(viewFromBytes(1, 1, 0))).toThrow('payload too short');
  });
});
