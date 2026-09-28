import type {
  DeviceResetOp,
  DeviceResetResult,
  DeviceResetStatus,
  DeviceResetTarget,
} from '../../types/ble';

const STATUS_SIZE = 6;

const OP_TO_CODE: Record<DeviceResetOp, number> = {
  read: 0,
  resetEsp32: 1,
  resetStm32: 2,
};

const TARGET_TO_OP: Record<DeviceResetTarget, DeviceResetOp> = {
  esp32: 'resetEsp32',
  stm32: 'resetStm32',
};

const CODE_TO_OP = new Map<number, DeviceResetOp>([
  [0, 'read'],
  [1, 'resetEsp32'],
  [2, 'resetStm32'],
]);

const CODE_TO_RESULT = new Map<number, DeviceResetResult>([
  [0, 'ok'],
  [1, 'queued'],
  [2, 'busy'],
  [3, 'invalidLength'],
  [4, 'invalidOp'],
  [5, 'unavailable'],
  [6, 'failed'],
]);

const TARGET_CODE_TO_TARGET = new Map<number, DeviceResetStatus['target']>([
  [0, 'none'],
  [1, 'esp32'],
  [2, 'stm32'],
]);

export const deviceResetOpForTarget = (target: DeviceResetTarget): DeviceResetOp =>
  TARGET_TO_OP[target];

export const buildDeviceResetRequest = (op: DeviceResetOp): Uint8Array =>
  new Uint8Array([OP_TO_CODE[op]]);

export const parseDeviceResetStatus = (value: DataView): DeviceResetStatus => {
  if (value.byteLength < STATUS_SIZE) {
    throw new Error(`Reset Control status requires ${STATUS_SIZE} bytes, got ${value.byteLength}`);
  }

  const lastOpCode = value.getUint8(1);
  const resultCode = value.getUint8(2);
  const flags = value.getUint8(3);
  const targetCode = value.getUint8(4);

  return {
    protocolVersion: value.getUint8(0),
    lastOpCode,
    lastOp: CODE_TO_OP.get(lastOpCode) ?? 'unknown',
    resultCode,
    result: CODE_TO_RESULT.get(resultCode) ?? 'unknown',
    flags,
    esp32ResetPending: (flags & 0x01) !== 0,
    stm32ResetPending: (flags & 0x02) !== 0,
    esp32Rebooting: (flags & 0x04) !== 0,
    stm32Resetting: (flags & 0x08) !== 0,
    targetCode,
    target: TARGET_CODE_TO_TARGET.get(targetCode) ?? 'unknown',
  };
};

export const createOptimisticDeviceResetStatus = (
  target: DeviceResetTarget
): DeviceResetStatus => {
  const op = deviceResetOpForTarget(target);
  const flags = target === 'esp32' ? 0x04 : 0x08;
  return {
    protocolVersion: 1,
    lastOpCode: OP_TO_CODE[op],
    lastOp: op,
    resultCode: 0,
    result: 'ok',
    flags,
    esp32ResetPending: false,
    stm32ResetPending: false,
    esp32Rebooting: target === 'esp32',
    stm32Resetting: target === 'stm32',
    targetCode: target === 'esp32' ? 1 : 2,
    target,
  };
};
