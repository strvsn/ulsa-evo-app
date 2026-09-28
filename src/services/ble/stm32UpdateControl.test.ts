import { describe, expect, it } from 'vitest';
import {
  buildStm32UpdateControlRequest,
  parseStm32UpdateControlStatus,
} from './stm32UpdateControl';

const encoder = new TextEncoder();

const putU32LE = (target: Uint8Array, offset: number, value: number) => {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
  target[offset + 2] = (value >> 16) & 0xff;
  target[offset + 3] = (value >> 24) & 0xff;
};

const buildStatusPayload = () => {
  const strings = [
    'ULSA-EVO-OTA-7',
    'stm-pass-123',
    '0123456789abcdef0123456789abcdef',
    '192.168.4.1',
  ].map((value) => encoder.encode(value));
  const headerLength = 23;
  const totalLength = headerLength + strings.reduce((sum, value) => sum + value.length, 0);
  const payload = new Uint8Array(totalLength);

  payload[0] = 2;
  payload[1] = 1;
  payload[2] = 0;
  payload[3] = 3;
  payload[4] = 0;
  payload[5] = 0x05;
  putU32LE(payload, 6, 0);
  putU32LE(payload, 10, 0);
  putU32LE(payload, 14, 290);
  payload[18] = 7;
  payload[19] = strings[0].length;
  payload[20] = strings[1].length;
  payload[21] = strings[2].length;
  payload[22] = strings[3].length;

  let offset = headerLength;
  for (const value of strings) {
    payload.set(value, offset);
    offset += value.length;
  }

  return new DataView(payload.buffer);
};

describe('stm32UpdateControl', () => {
  it('builds one-byte operation requests for the STM32 update characteristic', () => {
    expect(Array.from(buildStm32UpdateControlRequest('read'))).toEqual([0]);
    expect(Array.from(buildStm32UpdateControlRequest('preparePortal'))).toEqual([1]);
    expect(Array.from(buildStm32UpdateControlRequest('activatePortal'))).toEqual([2]);
    expect(Array.from(buildStm32UpdateControlRequest('stopOrCancel'))).toEqual([3]);
  });

  it('builds extended prepare requests with session binding', () => {
    const target = encoder.encode('ULSA_EVO_STM32_F411');
    const releaseTag = encoder.encode('20260709.1');
    const payload = buildStm32UpdateControlRequest('preparePortal', {
      expectedNodeId: 7,
      target: 'ULSA_EVO_STM32_F411',
      releaseTag: '20260709.1',
    });

    expect(Array.from(payload.slice(0, 5))).toEqual([1, 0x07, 7, target.length, releaseTag.length]);
    expect(new TextDecoder().decode(payload.slice(5, 5 + target.length))).toBe('ULSA_EVO_STM32_F411');
    expect(new TextDecoder().decode(payload.slice(5 + target.length))).toBe('20260709.1');
  });

  it('binds prepare to target and release without treating Node ID as device identity', () => {
    const target = encoder.encode('ULSA_EVO_STM32_F411');
    const releaseTag = encoder.encode('20260709.1');
    const payload = buildStm32UpdateControlRequest('preparePortal', {
      target: 'ULSA_EVO_STM32_F411',
      releaseTag: '20260709.1',
    });

    expect(Array.from(payload.slice(0, 5))).toEqual([1, 0x06, 0, target.length, releaseTag.length]);
  });

  it('parses common SoftAP credentials for STM32 update sessions', () => {
    const status = parseStm32UpdateControlStatus(buildStatusPayload());

    expect(status).toMatchObject({
      protocolVersion: 2,
      lastOp: 'preparePortal',
      result: 'ok',
      portalActive: true,
      hasCredentials: true,
      nodeId: 7,
      ssid: 'ULSA-EVO-OTA-7',
      password: 'stm-pass-123',
      token: '0123456789abcdef0123456789abcdef',
      ip: '192.168.4.1',
      remainingSeconds: 290,
    });
  });
});
