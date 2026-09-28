import type { CardLogSettingsOp, CardLogSettingsResult, CardLogSettingsStatus, CardLogSettingsWriteRequest } from '../../types/ble';

export const CARD_LOG_SETTINGS_STATUS_LENGTH = 20;

export const CARD_LOG_SETTINGS_OP_CODES: Record<CardLogSettingsOp, number> = {
  read: 0x00,
  setIntervalMs: 0x01,
  restoreDefault: 0x02,
  setAutoStart: 0x03,
};

const OP_BY_CODE = new Map<number, CardLogSettingsOp>(
  Object.entries(CARD_LOG_SETTINGS_OP_CODES).map(([op, code]) => [code, op as CardLogSettingsOp])
);

const RESULT_BY_CODE = new Map<number, CardLogSettingsResult>([
  [0x00, 'ok'],
  [0x01, 'queued'],
  [0x02, 'busy'],
  [0x03, 'invalidLength'],
  [0x04, 'invalidOp'],
  [0x05, 'unavailable'],
  [0x06, 'failed'],
  [0x07, 'outOfRange'],
  [0x08, 'sourceIntervalUnknown'],
  [0x09, 'intervalNotAligned'],
  [0x0a, 'invalidValue'],
]);

const writeUint32LE = (payload: Uint8Array, offset: number, value: number): void => {
  const normalized = Math.trunc(value) >>> 0;
  payload[offset] = normalized & 0xff;
  payload[offset + 1] = (normalized >>> 8) & 0xff;
  payload[offset + 2] = (normalized >>> 16) & 0xff;
  payload[offset + 3] = (normalized >>> 24) & 0xff;
};

export const buildCardLogSettingsRequest = (request: CardLogSettingsWriteRequest): Uint8Array => {
  const opCode = CARD_LOG_SETTINGS_OP_CODES[request.op];
  if (opCode === undefined) {
    throw new Error(`未対応のカードログ設定操作です: ${request.op}`);
  }

  if (request.op === 'read' || request.op === 'restoreDefault') {
    return new Uint8Array([opCode]);
  }

  if (request.op === 'setAutoStart') {
    return new Uint8Array([opCode, request.autoStartEnabled ? 1 : 0]);
  }

  if (!Number.isFinite(request.intervalMs)) {
    throw new Error('カードログ周期が指定されていません');
  }
  const intervalMs = Math.trunc(request.intervalMs);
  if (intervalMs < 0) {
    throw new Error('カードログ周期が不正です');
  }

  const payload = new Uint8Array(5);
  payload[0] = opCode;
  writeUint32LE(payload, 1, intervalMs);
  return payload;
};

export const parseCardLogSettingsStatus = (value: DataView): CardLogSettingsStatus => {
  if (value.byteLength < CARD_LOG_SETTINGS_STATUS_LENGTH) {
    throw new Error(`カードログ設定ステータスが短すぎます: ${value.byteLength} bytes`);
  }

  const lastOpCode = value.getUint8(1);
  const resultCode = value.getUint8(2);
  const flags = value.getUint8(3);
  const stm32IntervalMs = value.getUint32(16, true);

  return {
    protocolVersion: value.getUint8(0),
    lastOpCode,
    lastOp: OP_BY_CODE.get(lastOpCode) ?? 'unknown',
    resultCode,
    result: RESULT_BY_CODE.get(resultCode) ?? 'unknown',
    flags,
    persisted: (flags & 0x01) !== 0,
    stmIntervalKnown: (flags & 0x02) !== 0,
    defaultInterval: (flags & 0x04) !== 0,
    autoStartEnabled: (flags & 0x08) !== 0,
    currentIntervalMs: value.getUint32(4, true),
    minIntervalMs: value.getUint32(8, true),
    maxIntervalMs: value.getUint32(12, true),
    stm32IntervalMs: stm32IntervalMs === 0 ? null : stm32IntervalMs,
  };
};
