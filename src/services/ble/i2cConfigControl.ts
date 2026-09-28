import type { I2cConfigOp, I2cConfigResult, I2cConfigStatus, I2cConfigWriteRequest } from '../../types/ble';

export const I2C_CONFIG_STATUS_V1_LENGTH = 16;
export const I2C_CONFIG_STATUS_V2_LENGTH = 18;
export const I2C_CONFIG_CLIENT_CONTRACT_VERSION = 2;

export const I2C_CONFIG_OP_CODES: Record<I2cConfigOp, number> = {
  read: 0x00,
  setNodeId: 0x10,
  setAvgCycle: 0x11,
  setWindDirInstallMode: 0x12,
  setI2cAddress: 0x13,
  save: 0x20,
  discard: 0x21,
  restoreDefaults: 0x22,
  clearError: 0x23,
};

const OP_BY_CODE = new Map<number, I2cConfigOp>(
  Object.entries(I2C_CONFIG_OP_CODES).map(([op, code]) => [code, op as I2cConfigOp])
);

const RESULT_BY_CODE = new Map<number, I2cConfigResult>([
  [0x00, 'ok'],
  [0x01, 'queued'],
  [0x02, 'busy'],
  [0x03, 'invalidLength'],
  [0x04, 'invalidOp'],
  [0x05, 'unavailable'],
  [0x06, 'i2cFailed'],
  [0x07, 'unsupported'],
]);

const OPS_REQUIRING_VALUE = new Set<I2cConfigOp>([
  'setNodeId',
  'setAvgCycle',
  'setWindDirInstallMode',
  'setI2cAddress',
]);

export const isValidI2cConfigValue = (request: I2cConfigWriteRequest): boolean => {
  const value = request.value;
  switch (request.op) {
    case 'setNodeId':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;
    case 'setAvgCycle':
      return value === 1 || value === 4 || value === 8 || value === 16 || value === 32 || value === 64;
    case 'setWindDirInstallMode':
      return value === 0 || value === 1;
    case 'setI2cAddress':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0x08 && value <= 0x77;
    default:
      return value === undefined;
  }
};

export const buildI2cConfigRequest = (request: I2cConfigWriteRequest): Uint8Array => {
  const opCode = I2C_CONFIG_OP_CODES[request.op];
  if (opCode === undefined) {
    throw new Error(`未対応のI2C設定操作です: ${request.op}`);
  }

  if (!isValidI2cConfigValue(request)) {
    throw new Error('I2C設定値が範囲外です');
  }

  if (OPS_REQUIRING_VALUE.has(request.op)) {
    return new Uint8Array([opCode, request.value ?? 0]);
  }

  return new Uint8Array([opCode]);
};

export const parseI2cConfigStatus = (value: DataView): I2cConfigStatus => {
  if (value.byteLength < I2C_CONFIG_STATUS_V1_LENGTH) {
    throw new Error(`I2C設定ステータスが短すぎます: ${value.byteLength} bytes`);
  }

  const protocolVersion = value.getUint8(0);
  if (protocolVersion >= 2 && value.byteLength < I2C_CONFIG_STATUS_V2_LENGTH) {
    throw new Error(`I2C設定ステータスv2が短すぎます: ${value.byteLength} bytes`);
  }

  const lastOpCode = value.getUint8(1);
  const resultCode = value.getUint8(2);
  const flags = value.getUint8(15);
  const windMode = value.getUint8(8);

  return {
    protocolVersion,
    lastOpCode,
    lastOp: OP_BY_CODE.get(lastOpCode) ?? 'unknown',
    resultCode,
    result: RESULT_BY_CODE.get(resultCode) ?? 'unknown',
    remoteCommandStatus: value.getUint8(3),
    remoteLastError: value.getUint8(4),
    configFlags: value.getUint8(5),
    nodeId: value.getUint8(6),
    avgCycle: value.getUint8(7),
    windDirInstallMode: windMode === 1 ? 1 : 0,
    i2cAddress: value.getUint8(9),
    i2cSlaveEnabled: value.getUint8(10) !== 0,
    measurementIntervalMs: value.getUint8(11),
    localI2cError: value.getUint8(12),
    remoteRegisterVersion: value.getUint8(13),
    currentTargetI2cAddress: value.getUint8(14),
    rebootRequired: (flags & 0x01) !== 0,
    detected: (flags & 0x02) !== 0,
    configWriteSupported: (flags & 0x04) !== 0,
    operationSeq: protocolVersion >= 2 ? value.getUint8(16) : undefined,
    remoteCommandResultSeq: protocolVersion >= 2 ? value.getUint8(17) : undefined,
  };
};

export const isI2cConfigOperationComplete = (
  status: I2cConfigStatus,
  requestedOp: I2cConfigOp,
  baseline: I2cConfigStatus
): boolean => {
  // ESP32 publishes QUEUED only for an accepted request that will later
  // receive another status. BUSY rejects this request immediately because
  // another operation owns the single request slot, so it is terminal here.
  const terminal = status.result !== 'queued';
  if (status.lastOp !== requestedOp || !terminal) return false;
  if (status.protocolVersion < 2) return true;
  return baseline.operationSeq !== undefined
    && status.operationSeq !== undefined
    && status.operationSeq !== baseline.operationSeq;
};

export const formatI2cAddress = (address: number): string =>
  `0x${address.toString(16).toUpperCase().padStart(2, '0')}`;
