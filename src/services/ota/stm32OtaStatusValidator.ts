import type {
  Stm32RecoveryReason,
  Stm32RecoveryStage,
  Stm32UpdateHttpStatus,
  Stm32UpdatePhase,
} from './stm32OtaTransfer';

const STM32_UPDATE_PHASES = new Set<Stm32UpdatePhase>([
  'idle', 'receiving', 'package_stored', 'verifying', 'ready_to_write',
  'writing', 'verifying_flash', 'restarting', 'complete', 'error', 'recovery_required',
]);
const STM32_RECOVERY_REASONS = new Set<Stm32RecoveryReason>([
  'restart_unknown', 'write_failed',
]);
const STM32_RECOVERY_STAGES = new Set<Stm32RecoveryStage>([
  'package_verified', 'write_scheduled', 'writer_starting',
  'destructive_command_sent', 'firmware_transferred', 'restart_confirming',
]);

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
const isUint32 = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffff_ffff;
const isOptionalUint32 = (value: unknown): value is number | undefined =>
  value === undefined || isUint32(value);
const isOptionalNullableUint32 = (value: unknown): value is number | null | undefined =>
  value === undefined || value === null || isUint32(value);
const isOptionalBoolean = (value: unknown): value is boolean | undefined =>
  value === undefined || typeof value === 'boolean';
const isOptionalNullableString = (value: unknown): value is string | null | undefined =>
  value === undefined || isNullableString(value);

export const isStm32UpdateHttpStatus = (value: unknown): value is Stm32UpdateHttpStatus => {
  if (!value || typeof value !== 'object') return false;
  const status = value as Record<string, unknown>;
  return typeof status.phase === 'string' && STM32_UPDATE_PHASES.has(status.phase as Stm32UpdatePhase) &&
    typeof status.packageReady === 'boolean' && typeof status.canCancel === 'boolean' &&
    typeof status.canWrite === 'boolean' && isUint32(status.scratchBytes) &&
    isUint32(status.totalBytes) && isUint32(status.packageBytes) &&
    (status.packageSha256 === null ||
      (typeof status.packageSha256 === 'string' && /^[0-9a-f]{64}$/i.test(status.packageSha256))) &&
    isUint32(status.writtenBytes) && isOptionalUint32(status.packageVerifiedBytes) &&
    isUint32(status.verifiedBytes) && isUint32(status.progress) && status.progress <= 100 &&
    isOptionalUint32(status.nodeId) &&
    isNullableString(status.target) && isNullableString(status.version) &&
    isNullableString(status.releaseTag) && isNullableString(status.buildProfile) &&
    isNullableString(status.rdpPolicy) && isNullableString(status.error) &&
    isOptionalUint32(status.payloadBytes) && isOptionalUint32(status.firmwareBytes) &&
    isOptionalNullableUint32(status.antiRollback) &&
    isOptionalUint32(status.antiRollbackFloor) &&
    isOptionalNullableUint32(status.currentFirmwareVersionRaw) &&
    isOptionalUint32(status.currentFirmwareVersionFloor) &&
    isOptionalBoolean(status.postWriteVersionCheckComplete) &&
    isOptionalBoolean(status.postWriteVersionRead) &&
    isOptionalBoolean(status.postWriteVersionMatchesPackage) &&
    isOptionalUint32(status.postWriteVersionCheckAttempts) &&
    isOptionalUint32(status.effectiveAntiRollbackFloor) &&
    (status.bootloaderSyncOk === null || typeof status.bootloaderSyncOk === 'boolean') &&
    isUint32(status.bootloaderSyncAttempts) && isUint32(status.bootloaderSyncResponse) &&
    isNullableString(status.bootloaderSyncError) &&
    isOptionalBoolean(status.bootloaderSessionActive) &&
    isOptionalBoolean(status.writeStartPending) &&
    isOptionalNullableUint32(status.writerStackMinFreeBytes) &&
    isOptionalUint32(status.espResetReason) &&
    (status.espResetReasonName === undefined || typeof status.espResetReasonName === 'string') &&
    isOptionalUint32(status.espBootCount) &&
    (status.recoveryReason === undefined || status.recoveryReason === null ||
      (typeof status.recoveryReason === 'string' &&
        STM32_RECOVERY_REASONS.has(status.recoveryReason as Stm32RecoveryReason))) &&
    (status.recoveryStage === undefined || status.recoveryStage === null ||
      (typeof status.recoveryStage === 'string' &&
        STM32_RECOVERY_STAGES.has(status.recoveryStage as Stm32RecoveryStage))) &&
    isOptionalNullableString(status.errorCode) &&
    isOptionalBoolean(status.sessionBound) &&
    isOptionalNullableUint32(status.sessionExpectedNodeId) &&
    isOptionalNullableString(status.sessionTarget) &&
    isOptionalNullableString(status.sessionReleaseTag);
};
