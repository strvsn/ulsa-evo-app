/** BLE経由の保守操作（OTA、STM32更新、デバイスReset）に関する型定義 */

// ============================================
// ESP32 OTA Control
// ============================================

export type OtaControlOp = 'read' | 'preparePortal' | 'activatePortal' | 'stopOrCancel';

export type OtaControlResult =
  | 'ok'
  | 'queued'
  | 'busy'
  | 'invalidLength'
  | 'invalidOp'
  | 'unavailable'
  | 'failed'
  | 'authorizationRequired'
  | 'authorizationExpired'
  | 'peerConflict'
  | 'unknown';

export interface OtaControlStatus {
  protocolVersion: number;
  lastOpCode: number;
  lastOp: OtaControlOp | 'unknown';
  resultCode: number;
  result: OtaControlResult;
  stateCode: number;
  progress: number;
  flags: number;
  portalActive: boolean;
  updating: boolean;
  hasCredentials: boolean;
  error: boolean;
  physicalAuthRequired?: boolean;
  physicalAuthGranted?: boolean;
  recoveryPortal?: boolean;
  reservedFlagSet?: boolean;
  uploadedBytes: number;
  totalBytes: number;
  remainingSeconds: number;
  nodeId?: number;
  ssid: string;
  password: string;
  token: string;
  ip: string;
}

// ============================================
// STM32 Update Control
// ============================================

export type Stm32UpdateControlOp = OtaControlOp;
export type Stm32UpdateControlResult = OtaControlResult;

export interface Stm32UpdateControlSessionBinding {
  /** Legacy wire field for Node label display only; never use as an OTA identity or security gate. */
  expectedNodeId?: number;
  target: string;
  releaseTag: string;
}

export interface Stm32UpdateControlStatus extends OtaControlStatus {
  result: Stm32UpdateControlResult;
  lastOp: Stm32UpdateControlOp | 'unknown';
}

// ============================================
// ESP32 / STM32 Reset Control
// ============================================

export type DeviceResetTarget = 'esp32' | 'stm32';

export type DeviceResetOp = 'read' | 'resetEsp32' | 'resetStm32';

export type DeviceResetResult =
  | 'ok'
  | 'queued'
  | 'busy'
  | 'invalidLength'
  | 'invalidOp'
  | 'unavailable'
  | 'failed'
  | 'unknown';

export interface DeviceResetStatus {
  protocolVersion: number;
  lastOpCode: number;
  lastOp: DeviceResetOp | 'unknown';
  resultCode: number;
  result: DeviceResetResult;
  flags: number;
  esp32ResetPending: boolean;
  stm32ResetPending: boolean;
  esp32Rebooting: boolean;
  stm32Resetting: boolean;
  targetCode: number;
  target: DeviceResetTarget | 'none' | 'unknown';
}
