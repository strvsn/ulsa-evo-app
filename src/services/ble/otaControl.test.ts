import { describe, expect, it } from 'vitest';
import { buildOtaControlRequest, parseOtaControlStatus } from './otaControl';

const encoder = new TextEncoder();

const putU32LE = (target: Uint8Array, offset: number, value: number) => {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
  target[offset + 2] = (value >> 16) & 0xff;
  target[offset + 3] = (value >> 24) & 0xff;
};

const buildStatusPayload = ({
  protocolVersion = 2,
  lastOp = 2,
  result = 0,
  state = 3,
  progress = 42,
  flags = 0x05,
  uploadedBytes = 0x01020304,
  totalBytes = 0x11121314,
  remainingSeconds = 280,
  ssid = 'ULSA-EVO-OTA-7',
  password = 'ota-pass-123',
  token = '0123456789abcdef0123456789abcdef',
  ip = '192.168.4.1',
  nodeId = 7,
} = {}) => {
  const strings = [ssid, password, token, ip].map((value) => encoder.encode(value));
  const headerLength = protocolVersion >= 2 ? 23 : 22;
  const totalLength = headerLength + strings.reduce((sum, value) => sum + value.length, 0);
  const payload = new Uint8Array(totalLength);

  payload[0] = protocolVersion;
  payload[1] = lastOp;
  payload[2] = result;
  payload[3] = state;
  payload[4] = progress;
  payload[5] = flags;
  putU32LE(payload, 6, uploadedBytes);
  putU32LE(payload, 10, totalBytes);
  putU32LE(payload, 14, remainingSeconds);
  if (protocolVersion >= 2) {
    payload[18] = nodeId;
    payload[19] = strings[0].length;
    payload[20] = strings[1].length;
    payload[21] = strings[2].length;
    payload[22] = strings[3].length;
  } else {
    payload[18] = strings[0].length;
    payload[19] = strings[1].length;
    payload[20] = strings[2].length;
    payload[21] = strings[3].length;
  }

  let offset = headerLength;
  for (const value of strings) {
    payload.set(value, offset);
    offset += value.length;
  }

  return new DataView(payload.buffer);
};

describe('otaControl', () => {
  it('builds one-byte operation requests expected by ESP32', () => {
    expect(Array.from(buildOtaControlRequest('read'))).toEqual([0]);
    expect(Array.from(buildOtaControlRequest('preparePortal'))).toEqual([1]);
    expect(Array.from(buildOtaControlRequest('activatePortal'))).toEqual([2]);
    expect(Array.from(buildOtaControlRequest('stopOrCancel'))).toEqual([3]);
  });

  it('parses the ESP32 OTA status header and session strings in order', () => {
    const status = parseOtaControlStatus(buildStatusPayload());

    expect(status).toMatchObject({
      protocolVersion: 2,
      lastOpCode: 2,
      lastOp: 'activatePortal',
      resultCode: 0,
      result: 'ok',
      stateCode: 3,
      progress: 42,
      flags: 0x05,
      portalActive: true,
      updating: false,
      hasCredentials: true,
      error: false,
      physicalAuthRequired: false,
      physicalAuthGranted: false,
      recoveryPortal: false,
      reservedFlagSet: false,
      uploadedBytes: 0x01020304,
      totalBytes: 0x11121314,
      remainingSeconds: 280,
      nodeId: 7,
      ssid: 'ULSA-EVO-OTA-7',
      password: 'ota-pass-123',
      token: '0123456789abcdef0123456789abcdef',
      ip: '192.168.4.1',
    });
  });

  it('keeps compatibility with v1 OTA status payloads and infers node ID from SSID', () => {
    const status = parseOtaControlStatus(buildStatusPayload({
      protocolVersion: 1,
      ssid: 'ULSA-EVO-OTA-12',
    }));

    expect(status.protocolVersion).toBe(1);
    expect(status.nodeId).toBe(12);
    expect(status.ssid).toBe('ULSA-EVO-OTA-12');
  });

  it('parses updating and error flags without relying on portalActive', () => {
    const status = parseOtaControlStatus(buildStatusPayload({
      result: 6,
      flags: 0x0a,
      ssid: 'ULSA-EVO-OTA-0',
      password: '',
      token: 'token',
    }));

    expect(status.result).toBe('failed');
    expect(status.portalActive).toBe(false);
    expect(status.updating).toBe(true);
    expect(status.hasCredentials).toBe(false);
    expect(status.error).toBe(true);
    expect(status.password).toBe('');
  });

  it('rejects truncated variable-length session payloads', () => {
    const payload = new Uint8Array(23);
    payload[0] = 2;
    payload[19] = 1;

    expect(() => parseOtaControlStatus(new DataView(payload.buffer))).toThrow(
      /OTA status string exceeds payload length/
    );
  });

  it('parses v3 physical authorization results and flags without moving string offsets', () => {
    const pending = parseOtaControlStatus(buildStatusPayload({
      protocolVersion: 3,
      lastOp: 1,
      result: 7,
      state: 1,
      flags: 0x10,
      remainingSeconds: 60,
      ssid: '',
      password: '',
      token: '',
      ip: '',
    }));

    expect(pending).toMatchObject({
      protocolVersion: 3,
      result: 'authorizationRequired',
      physicalAuthRequired: true,
      physicalAuthGranted: false,
      hasCredentials: false,
      remainingSeconds: 60,
      ssid: '',
      token: '',
    });

    const granted = parseOtaControlStatus(buildStatusPayload({
      protocolVersion: 3,
      lastOp: 1,
      result: 0,
      flags: 0x24,
      remainingSeconds: 60,
    }));
    expect(granted.physicalAuthRequired).toBe(false);
    expect(granted.physicalAuthGranted).toBe(true);
    expect(granted.hasCredentials).toBe(true);
    expect(granted.ssid).toBe('ULSA-EVO-OTA-7');
  });

  it('maps v3 expiration, peer conflict, recovery, and reserved flags', () => {
    expect(parseOtaControlStatus(buildStatusPayload({ protocolVersion: 3, result: 8 })).result)
      .toBe('authorizationExpired');
    const conflict = parseOtaControlStatus(buildStatusPayload({
      protocolVersion: 3,
      result: 9,
      flags: 0xc0,
    }));
    expect(conflict.result).toBe('peerConflict');
    expect(conflict.recoveryPortal).toBe(true);
    expect(conflict.reservedFlagSet).toBe(true);
  });
});
