import { describe, expect, it } from 'vitest';
import type { Esp32OtaSession } from '../../services/ota/esp32OtaTransfer';
import type { Stm32FirmwareReleaseOption } from '../../services/ota/stm32FirmwareReleaseCatalog';
import type { Stm32UpdateHttpStatus } from '../../services/ota/stm32OtaTransfer';
import { createStm32SyncProbeProof, doesStm32SyncProbeProofMatch } from './stm32SyncProbeProof';

const session: Esp32OtaSession = {
  ssid: 'ULSA-EVO-OTA-7',
  password: 'password',
  token: 'session-token',
  ip: '192.168.4.1',
  nodeId: 7,
};

const release: Stm32FirmwareReleaseOption = {
  id: 'release-1',
  tagName: 'stm32-1.0.0-field.1',
  title: 'STM32 1.0.0',
  publishedAt: '2026-09-03T00:00:00Z',
  assetName: 'stm32.ulsa-stm32pkg',
  target: 'ULSA_EVO_STM32_F411',
  version: '1.0.0',
  releaseTag: 'stm32-1.0.0-field.1',
  buildProfile: 'field',
  rdpPolicy: 'preserve',
  requiresAdmin: false,
  size: 1024,
  packageSha256: 'a'.repeat(64),
  downloadUrl: '/download',
  downloadTokenUrl: '/download-token',
  latest: true,
};

const status: Stm32UpdateHttpStatus = {
  phase: 'ready_to_write',
  packageReady: true,
  canCancel: true,
  canWrite: true,
  scratchBytes: 1024,
  totalBytes: 1024,
  packageBytes: release.size,
  packageSha256: release.packageSha256,
  writtenBytes: 0,
  verifiedBytes: 1024,
  progress: 100,
  nodeId: 7,
  target: release.target,
  version: release.version,
  releaseTag: release.releaseTag,
  buildProfile: release.buildProfile,
  rdpPolicy: release.rdpPolicy,
  bootloaderSyncOk: true,
  bootloaderSyncAttempts: 1,
  bootloaderSyncResponse: 0,
  bootloaderSyncError: null,
  sessionBound: true,
  sessionExpectedNodeId: 7,
  sessionTarget: release.target,
  sessionReleaseTag: release.releaseTag,
  error: null,
};

describe('STM32 sync probe proof', () => {
  it('binds a successful non-destructive probe to the active session and catalog package', () => {
    const proof = createStm32SyncProbeProof(session, release, status);

    expect(proof).toEqual({
      sessionToken: session.token,
      releaseTarget: release.target,
      releaseTag: release.releaseTag,
      packageSha256: release.packageSha256,
    });
    expect(doesStm32SyncProbeProofMatch(proof, session, release, status)).toBe(true);
  });

  it('rejects missing probe success or an invalid catalog package hash', () => {
    expect(createStm32SyncProbeProof(session, release, { ...status, bootloaderSyncOk: false })).toBeNull();
    expect(createStm32SyncProbeProof(session, { ...release, packageSha256: '' }, status)).toBeNull();
  });

  it.each<[string, {
    session?: Esp32OtaSession;
    release?: Stm32FirmwareReleaseOption;
    status?: Stm32UpdateHttpStatus;
  }]>([
    ['session token', { session: { ...session, token: 'other-token' } }],
    ['release target', { release: { ...release, target: 'ULSA_EVO_STM32_F446' } }],
    ['release tag', { release: { ...release, releaseTag: 'other-release' } }],
    ['package SHA', { release: { ...release, packageSha256: 'b'.repeat(64) } }],
    ['HTTP binding', { status: { ...status, sessionReleaseTag: 'other-release' } }],
    ['verified HTTP package SHA', { status: { ...status, packageSha256: 'b'.repeat(64) } }],
    ['verified HTTP package size', { status: { ...status, packageBytes: release.size + 1 } }],
  ])('invalidates the proof when %s changes', (_label, overrides) => {
    const proof = createStm32SyncProbeProof(session, release, status);
    expect(doesStm32SyncProbeProofMatch(
      proof,
      overrides.session ?? session,
      overrides.release ?? release,
      overrides.status ?? status,
    )).toBe(false);
  });

  it.each([0, 8, undefined])(
    'keeps proof valid when the informational Node ID changes to %s',
    (nodeId) => {
      const proof = createStm32SyncProbeProof(session, release, status);
      expect(doesStm32SyncProbeProofMatch(
        proof,
        { ...session, nodeId },
        release,
        { ...status, nodeId },
      )).toBe(true);
    },
  );
});
