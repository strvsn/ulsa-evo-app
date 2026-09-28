import type { Stm32FirmwareReleaseOption } from '../src/services/ota/stm32FirmwareReleaseCatalog';
import type { Stm32UpdateControlStatus } from '../src/types/ble';
import type { Stm32UpdateHttpStatus } from '../src/services/ota/stm32OtaTransfer';
export const release: Stm32FirmwareReleaseOption = {
  id: 'release-1',
  tagName: 'stm32-1.0.0-field.1',
  title: 'STM32 1.0.0',
  publishedAt: '2026-09-03T00:00:00Z',
  assetName: 'ULSA_EVO_STM32_F411-1.0.0-stm32-1.0.0-field.1-field-preserve.ulsa-stm32pkg',
  target: 'ULSA_EVO_STM32_F411',
  version: '1.0.0',
  releaseTag: 'stm32-1.0.0-field.1',
  buildProfile: 'field',
  rdpPolicy: 'preserve',
  requiresAdmin: false,
  size: 3,
  packageSha256: 'a'.repeat(64),
  downloadUrl: '/api/stm32-firmware/download',
  downloadTokenUrl: '/api/stm32-firmware/download-token',
  latest: true,
};

export const controlStatus = {
  protocolVersion: 3,
  lastOpCode: 0,
  lastOp: 'read',
  resultCode: 0,
  result: 'ok',
  stateCode: 3,
  progress: 0,
  flags: 0,
  portalActive: true,
  updating: false,
  hasCredentials: true,
  error: false,
  uploadedBytes: 0,
  totalBytes: 0,
  remainingSeconds: 240,
  nodeId: 7,
  ssid: 'ULSA-EVO-OTA-7',
  password: 'password',
  token: 'token',
  ip: '192.168.4.1',
} satisfies Stm32UpdateControlStatus;

export const readyStatus: Stm32UpdateHttpStatus = {
  phase: 'ready_to_write',
  packageReady: true,
  canCancel: true,
  canWrite: true,
  scratchBytes: 3,
  totalBytes: 3,
  packageBytes: 3,
  packageSha256: release.packageSha256,
  writtenBytes: 0,
  verifiedBytes: 3,
  progress: 100,
  nodeId: 7,
  target: release.target,
  version: release.version,
  releaseTag: release.releaseTag,
  buildProfile: release.buildProfile,
  rdpPolicy: release.rdpPolicy,
  payloadBytes: 3,
  firmwareBytes: 3,
  bootloaderSyncOk: null,
  bootloaderSyncAttempts: 0,
  bootloaderSyncResponse: 0,
  bootloaderSyncError: null,
  bootloaderSessionActive: false,
  sessionBound: true,
  sessionExpectedNodeId: 7,
  sessionTarget: release.target,
  sessionReleaseTag: release.releaseTag,
  error: null,
};

export const emptyStatus: Stm32UpdateHttpStatus = {
  ...readyStatus,
  phase: 'idle',
  packageReady: false,
  canWrite: false,
  packageBytes: 0,
  packageSha256: null,
  verifiedBytes: 0,
  progress: 0,
};

export const probedStatus: Stm32UpdateHttpStatus = {
  ...readyStatus,
  bootloaderSyncOk: true,
  bootloaderSyncAttempts: 1,
};

export const failedProbeStatus: Stm32UpdateHttpStatus = {
  ...readyStatus,
  bootloaderSyncOk: false,
  bootloaderSyncAttempts: 5,
  bootloaderSyncError: 'secure_loader_hello_timeout',
};

export const writingStatus: Stm32UpdateHttpStatus = {
  ...probedStatus,
  phase: 'writing',
  canCancel: false,
  canWrite: false,
  progress: 73,
  writtenBytes: 2,
  bootloaderSessionActive: true,
};

export const completeStatus: Stm32UpdateHttpStatus = {
  ...writingStatus,
  phase: 'complete',
  packageReady: false,
  packageBytes: 0,
  packageSha256: null,
  progress: 100,
  writtenBytes: 3,
  verifiedBytes: 3,
  bootloaderSessionActive: false,
  postWriteVersionMatchesPackage: true,
  currentFirmwareVersionRaw: 100,
};
