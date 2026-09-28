import { describe, expect, it } from 'vitest';
import type { OtaControlStatus } from '../../types/ble';
import type { Esp32OtaHttpStatus, Esp32OtaSession } from '../../services/ota/esp32OtaTransfer';
import {
  describeNodeIdDifference,
  describeNodeIdValues,
  describeJoinResult,
  isPortalStatusReadyForSession,
  isPhysicalAuthorizationGranted,
  isPhysicalAuthorizationPending,
  portalStatusSsidMatchesSession,
  toSession,
  validatePhysicalAuthorizationStatus,
  waitForPhysicalAuthorization,
} from './otaPanelHelpers';
import { confirmLegacyOtaMigration } from './otaAuthorizationFlow';

const session: Esp32OtaSession = {
  ssid: 'ULSA-EVO-OTA-7',
  password: 'password',
  token: 'token',
  ip: '192.168.4.1',
  nodeId: 7,
};

describe('OTA session binding and informational Node ID', () => {
  it('keeps native Wi-Fi error codes visible for retry diagnostics', () => {
    expect(describeJoinResult({
      ssid: 'ULSA-EVO-OTA-a3f',
      connected: false,
      reason: 'systemConfiguration',
      errorCode: 10,
    })).toBe('systemConfiguration / code 10');
  });

  it('creates a session when Node ID is absent or zero', () => {
    expect(toSession({ ssid: session.ssid, token: session.token, ip: session.ip } as OtaControlStatus))
      .toEqual(expect.objectContaining({ token: session.token, nodeId: undefined }));
    expect(toSession({ ssid: session.ssid, token: session.token, ip: session.ip, nodeId: 0 } as OtaControlStatus))
      .toEqual(expect.objectContaining({ token: session.token, nodeId: 0 }));
  });

  it('binds HTTP status by session SSID/profile and does not block on a changed Node label', () => {
    expect(portalStatusSsidMatchesSession({ ssid: session.ssid } as Esp32OtaHttpStatus, session)).toBe(true);
    expect(portalStatusSsidMatchesSession({ ssid: '' } as Esp32OtaHttpStatus, session)).toBe(false);
    expect(isPortalStatusReadyForSession({
      portalActive: true,
      ssid: session.ssid,
      nodeId: 8,
    } as Esp32OtaHttpStatus, session)).toBe(true);
  });

  it('reports a changed Node ID only as an informational warning', () => {
    expect(describeNodeIdDifference(7, 8)).toMatch(/任意の識別ラベル/);
    expect(describeNodeIdValues([
      { label: 'BLE', value: 7 },
      { label: 'session', value: 7 },
      { label: 'HTTP', value: 8 },
    ])).toContain('BLE 7 / session 7 / HTTP 8');
    expect(describeNodeIdDifference(7, 7)).toBeNull();
    expect(describeNodeIdDifference(undefined, 7)).toBeNull();
  });
});

const authStatus = (overrides: Partial<OtaControlStatus> = {}): OtaControlStatus => ({
  protocolVersion: 3,
  lastOpCode: 1,
  lastOp: 'preparePortal',
  resultCode: 7,
  result: 'authorizationRequired',
  stateCode: 1,
  progress: 0,
  flags: 0x10,
  portalActive: false,
  updating: false,
  hasCredentials: false,
  error: false,
  physicalAuthRequired: true,
  physicalAuthGranted: false,
  recoveryPortal: false,
  reservedFlagSet: false,
  uploadedBytes: 0,
  totalBytes: 0,
  remainingSeconds: 60,
  nodeId: 7,
  ssid: '',
  password: '',
  token: '',
  ip: '',
  ...overrides,
});

describe('OTA physical authorization', () => {
  it('requires explicit confirmation only for legacy firmware', () => {
    const confirm = window.confirm;
    window.confirm = () => false;
    expect(confirmLegacyOtaMigration(authStatus({ protocolVersion: 2 }), 'legacy')).toBe(false);
    expect(confirmLegacyOtaMigration(authStatus({ protocolVersion: 3 }), 'v3')).toBe(true);
    window.confirm = confirm;
  });

  it('distinguishes pending and granted v3 sessions', () => {
    const pending = authStatus();
    const granted = authStatus({
      resultCode: 0,
      result: 'ok',
      flags: 0x24,
      physicalAuthRequired: false,
      physicalAuthGranted: true,
      hasCredentials: true,
      ssid: session.ssid,
      password: session.password,
      token: session.token,
      ip: session.ip,
    });

    expect(isPhysicalAuthorizationPending(pending)).toBe(true);
    expect(isPhysicalAuthorizationGranted(pending)).toBe(false);
    expect(isPhysicalAuthorizationPending(granted)).toBe(false);
    expect(isPhysicalAuthorizationGranted(granted)).toBe(true);
  });

  it('rejects contradictory or reserved v3 flags', () => {
    expect(validatePhysicalAuthorizationStatus(authStatus({ hasCredentials: true })))
      .toMatch(/認可前/);
    expect(validatePhysicalAuthorizationStatus(authStatus({ reservedFlagSet: true })))
      .toMatch(/予約flag/);
    expect(validatePhysicalAuthorizationStatus(authStatus({ recoveryPortal: true })))
      .toMatch(/Recovery portal/);
  });

  it('polls until the same control reports a granted session', async () => {
    const granted = authStatus({
      resultCode: 0,
      result: 'ok',
      flags: 0x24,
      physicalAuthRequired: false,
      physicalAuthGranted: true,
      hasCredentials: true,
      ssid: session.ssid,
      password: session.password,
      token: session.token,
      ip: session.ip,
    });
    let reads = 0;
    const result = await waitForPhysicalAuthorization({
      initialStatus: authStatus(),
      pollIntervalMs: 0,
      readStatus: async () => {
        reads += 1;
        return granted;
      },
    });

    expect(reads).toBe(1);
    expect(result).toBe(granted);
  });
});
