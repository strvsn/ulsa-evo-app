import { describe, expect, it } from 'vitest';
import type { Stm32FirmwareReleaseOption } from '../../services/ota/stm32FirmwareReleaseCatalog';
import {
  Stm32CancelTimeoutError,
  Stm32PackageUploadConnectionError,
  Stm32PackageUploadTimeoutError,
  Stm32StatusRequestTimeoutError,
  Stm32WriteStartTimeoutError,
  Stm32WriteMonitorError,
  type Stm32UpdateHttpStatus,
} from '../../services/ota/stm32OtaTransfer';
import type { Stm32FirmwareVersionStatus } from '../../types/ble';
import {
  canReuseStoredStm32Package,
  describeNoSelectableStm32Release,
  describePackage,
  describePackageTransferStepDetail,
  describeProbeStepDetail,
  describeReattachedStm32Status,
  describeStm32StatusReadFailure,
  describeStm32WebConnectionFailure,
  describeStoppedUpdateMessage,
  describeUnknownStm32CancelState,
  describeUnknownStm32WriteState,
  describeVersionConfirmation,
  describeWriteStepDetail,
  formatPackageBytes,
  formatPackageHash,
  isReleaseSelectableForMode,
  isStm32WriteLocked,
  isUserSelectableStm32Release,
  shouldClearCachedPackageAfterStatus,
  statusSessionMatchesRelease,
} from './stm32UpdatePanelHelpers';

const release: Stm32FirmwareReleaseOption = {
  id: 'rel-1',
  tagName: 'stm32-fw-test',
  title: 'STM32 FW',
  publishedAt: '2026-07-08T00:00:00Z',
  assetName: 'stm32.ulsa-stm32pkg',
  target: 'ULSA_EVO_STM32_F411',
  version: '20260708',
  releaseTag: 'stm32-20260708',
  buildProfile: 'field',
  rdpPolicy: 'preserve',
  requiresAdmin: false,
  size: 251000,
  packageSha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  downloadUrl: '/api/stm32-firmware/download?tag=stm32-fw-test',
  downloadTokenUrl: '/api/stm32-firmware/download-token',
  latest: true,
};

const status = (
  phase: Stm32UpdateHttpStatus['phase'],
  overrides: Partial<Stm32UpdateHttpStatus> = {}
): Stm32UpdateHttpStatus => ({
  phase,
  packageReady: phase === 'ready_to_write',
  canCancel: phase !== 'writing',
  canWrite: phase === 'ready_to_write',
  scratchBytes: 1024,
  totalBytes: 1024,
  packageBytes: release.size,
  packageSha256: release.packageSha256,
  writtenBytes: phase === 'complete' ? 1024 : 0,
  verifiedBytes: phase === 'complete' ? 1024 : 0,
  progress: phase === 'complete' ? 100 : 0,
  target: release.target,
  version: release.version,
  releaseTag: release.releaseTag,
  buildProfile: release.buildProfile,
  rdpPolicy: release.rdpPolicy,
  bootloaderSessionActive: phase === 'writing',
  nodeId: 7,
  sessionBound: true,
  sessionTarget: release.target,
  sessionReleaseTag: release.releaseTag,
  error: null,
  ...overrides,
});

const version = (raw: number): Stm32FirmwareVersionStatus => ({
  protocolVersion: 1,
  flags: 0x07,
  i2cClientPresent: true,
  detected: true,
  readOk: true,
  localError: 0,
  regVersion: 6,
  firmwareVersionRaw: raw,
  firmwareVersion: String(raw),
});

describe('stm32UpdatePanelHelpers', () => {
  it('distinguishes a denied browser permission from an unreachable SoftAP', () => {
    expect(describeStm32WebConnectionFailure(new TypeError('Failed to fetch'), 'ULSA-EVO-OTA-abc', 'denied'))
      .toContain('サイトの設定でアクセスを許可');
    const networkFailure = describeStm32WebConnectionFailure(new TypeError('Failed to fetch'), 'ULSA-EVO-OTA-abc', 'granted');
    expect(networkFailure).toContain('ULSA-EVO-OTA-abc');
    expect(networkFailure).toContain('インターネット未接続');
    expect(networkFailure).toContain('接続を確認');
    expect(describeStm32WebConnectionFailure(new Error('session mismatch'), 'ULSA-EVO-OTA-abc', 'granted'))
      .toBe('session mismatch');
  });
  it('formats package metadata without exposing an oversized hash row', () => {
    expect(formatPackageBytes(release.size)).toBe('246 KB');
    expect(formatPackageHash(release.packageSha256)).toBe('0123456789ab...89abcdef');
  });

  it('describes whether the selected package is cached', () => {
    const file = new File(['pkg'], release.assetName);

    expect(describePackage(null, release, false)).toBe('未取得');
    expect(describePackage({ releaseId: release.id, file }, release, false)).toBe('1 KB 取得済み');
  });

  it('keeps RDP1 admin packages out of the normal user selection list', () => {
    expect(isUserSelectableStm32Release(release)).toBe(true);
    expect(isUserSelectableStm32Release({
      ...release,
      rdpPolicy: 'enable_rdp1',
      requiresAdmin: true,
    })).toBe(false);
  });

  it('separates normal field releases from debug no-RDP releases', () => {
    const debugNoRdp = {
      ...release,
      id: 'debug-1',
      buildProfile: 'debug' as const,
      rdpPolicy: 'none' as const,
    };
    const debugPreserve = {
      ...debugNoRdp,
      id: 'debug-preserve',
      rdpPolicy: 'preserve' as const,
    };

    expect(isReleaseSelectableForMode(release, 'normal')).toBe(true);
    expect(isReleaseSelectableForMode(debugNoRdp, 'normal')).toBe(false);
    expect(isReleaseSelectableForMode(debugNoRdp, 'debug')).toBe(true);
    expect(isReleaseSelectableForMode(release, 'debug')).toBe(false);
    expect(isReleaseSelectableForMode(debugPreserve, 'debug')).toBe(false);
    expect(isReleaseSelectableForMode({
      ...release,
      id: 'production-1',
      buildProfile: 'production',
    }, 'normal')).toBe(false);
  });

  it('keeps older signed field releases selectable for user rollback', () => {
    const olderRelease = { ...release, id: 'older', latest: false, version: '1.0.0' };
    expect(isReleaseSelectableForMode(olderRelease, 'normal')).toBe(true);
  });

  it('describes empty release lists for the active selection mode', () => {
    expect(describeNoSelectableStm32Release('normal')).toContain('通常UI');
    expect(describeNoSelectableStm32Release('debug')).toContain('debug_no_rdp');
  });

  it('locks cancel after STM32 write has started', () => {
    expect(isStm32WriteLocked(status('ready_to_write'))).toBe(false);
    expect(isStm32WriteLocked(status('ready_to_write', {
      writeStartPending: true,
      bootloaderSessionActive: false,
    }))).toBe(true);
    expect(isStm32WriteLocked(status('writing'))).toBe(true);
    expect(isStm32WriteLocked(status('verifying_flash'))).toBe(true);
    expect(isStm32WriteLocked(status('restarting'))).toBe(true);
  });

  it('keeps the separated transfer, non-destructive probe, and write details explicit', () => {
    expect(describePackageTransferStepDetail(
      'upload', { loaded: 50, total: 100, percent: 50 }, false, true,
    )).toBe('送信 50%');
    expect(describePackageTransferStepDetail('idle', null, true, true)).toBe('ESP32へ転送・検証済み');
    expect(describeProbeStepDetail('probe', false, true)).toBe('消去せず接続確認中');
    expect(describeProbeStepDetail('idle', true, true)).toBe('非消去確認済み');
    expect(describeWriteStepDetail('write', status('ready_to_write'), true, false)).toBe('書込み開始中');
    expect(describeWriteStepDetail('idle', status('ready_to_write'), true, false))
      .toBe('明示書込み待機 / 開始後は中断不可');
    expect(describeWriteStepDetail('monitor', status('restarting'), false, false)).toBe('STM32起動・version確認中');
    expect(describeWriteStepDetail('idle', status('writing', { progress: 73 }), false, true))
      .toBe('writing 73% / 監視再開可能');
  });

  it('clears downloaded packages after terminal update states', () => {
    expect(shouldClearCachedPackageAfterStatus(status('complete'))).toBe(true);
    expect(shouldClearCachedPackageAfterStatus(status('error'))).toBe(true);
    expect(shouldClearCachedPackageAfterStatus(status('recovery_required'))).toBe(false);
    expect(shouldClearCachedPackageAfterStatus(status('ready_to_write'))).toBe(false);
  });

  it('keeps recovery packages reusable when ESP32 still has a verified scratch package', () => {
    const reusable = status('recovery_required', { packageReady: true, canWrite: true });
    const reupload = status('recovery_required', { packageReady: false, canWrite: false });

    expect(canReuseStoredStm32Package(reusable)).toBe(true);
    expect(describeStoppedUpdateMessage(reusable)).toContain('再書込みできます');
    expect(canReuseStoredStm32Package(reupload)).toBe(false);
    expect(describeStoppedUpdateMessage(reupload)).toContain('再upload');
  });

  it('explains a revision rollback rejection as a pre-erase safety decision', () => {
    const rejected = status('error', {
      packageReady: false,
      canWrite: false,
      error: 'stm32_revision_rollback',
      errorCode: 'revision_rollback',
    });

    expect(describeStoppedUpdateMessage(rejected)).toContain('STM32を消去する前に拒否');
    expect(describeStoppedUpdateMessage(rejected)).toContain('新しい更新データとして再package');
  });

  it('keeps timeout messaging explicit about unknown device state and retained package', () => {
    const lastStatus = status('writing');
    const monitorError = new Stm32WriteMonitorError('overall_timeout', lastStatus);
    expect(describeUnknownStm32WriteState(monitorError, true)).toContain('書込み状態は不明');
    expect(describeUnknownStm32WriteState(monitorError, true)).toContain('packageは保持');
    expect(describeUnknownStm32WriteState(
      new Stm32StatusRequestTimeoutError(2_500), false,
    )).toContain('status再確認後に再試行');
    expect(describeStm32StatusReadFailure(
      new Stm32StatusRequestTimeoutError(2_500),
    )).toContain('packageは保持');
    expect(describeUnknownStm32WriteState(
      new Stm32WriteStartTimeoutError(10_000), true,
    )).toContain('デバイス側の書込み状態は不明');
    expect(describeUnknownStm32WriteState(
      new Stm32PackageUploadTimeoutError(), false,
    )).toContain('packageは保持');
    expect(describeUnknownStm32WriteState(
      new Stm32PackageUploadConnectionError(), false,
    )).toContain('status再確認');
    expect(describeUnknownStm32CancelState(new Stm32CancelTimeoutError(5_000)))
      .toContain('中止結果は不明');
    expect(describeUnknownStm32CancelState(new Stm32CancelTimeoutError(5_000)))
      .toContain('packageは保持');
  });

  it('describes status reattachment without unlocking an active write', () => {
    expect(describeReattachedStm32Status(status('writing'))).toMatchObject({
      role: 'status',
      text: expect.stringContaining('書込み監視を再開'),
    });
    expect(describeReattachedStm32Status(status('recovery_required', {
      packageReady: true,
      canWrite: true,
    }))).toMatchObject({
      role: 'alert',
      text: expect.stringContaining('再書込みできます'),
    });
    expect(describeReattachedStm32Status(status('complete'))).toMatchObject({
      role: 'status',
      text: expect.stringContaining('完了状態'),
    });
    expect(describeReattachedStm32Status(status('error', {
      error: 'write_failed',
    }))).toMatchObject({ role: 'alert', text: 'write_failed' });
  });

  it('matches ESP32 STM32 update sessions against the selected release', () => {
    expect(statusSessionMatchesRelease(status('ready_to_write'), release)).toBe(true);
    expect(statusSessionMatchesRelease(status('ready_to_write', {
      sessionBound: true,
      sessionTarget: release.target,
      sessionReleaseTag: release.releaseTag,
    }), release)).toBe(true);
    expect(statusSessionMatchesRelease(status('ready_to_write', {
      sessionBound: true,
      sessionTarget: release.target,
      sessionReleaseTag: 'other-release',
    }), release)).toBe(false);
    expect(statusSessionMatchesRelease(status('ready_to_write', {
      sessionBound: false,
    }), release)).toBe(false);
    expect(statusSessionMatchesRelease(status('ready_to_write'), null)).toBe(false);
  });

  it('marks STM32 firmware version as confirmed only after the expected version appears', () => {
    expect(describeVersionConfirmation(status('complete'), release, version(20260708))).toBe('確認済み 20260708');
    expect(describeVersionConfirmation(status('complete'), release, version(20260707))).toBe('要確認 20260707 / 期待 20260708');
  });

  it('uses the ESP32 post-write I2C readback before BLE reconnect is available', () => {
    expect(describeVersionConfirmation(status('restarting'), release, null)).toBe('STM32起動・version確認中');
    expect(describeVersionConfirmation(status('complete', {
      currentFirmwareVersionRaw: 20260708,
      postWriteVersionCheckComplete: true,
      postWriteVersionRead: true,
      postWriteVersionMatchesPackage: true,
    }), release, null)).toBe('確認済み 20260708');
    expect(describeVersionConfirmation(status('complete', {
      postWriteVersionCheckComplete: true,
      postWriteVersionRead: false,
      postWriteVersionMatchesPackage: false,
    }), release, null)).toBe('I2C読出し未確認 / BLE再接続後に確認');
  });
});
