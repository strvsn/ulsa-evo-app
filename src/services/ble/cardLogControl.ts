import type { CardLogControlOp, CardLogControlResult, CardLogControlStatus } from '../../types/ble';

export const CARD_LOG_CONTROL_STATUS_LENGTH = 6;

export const CARD_LOG_OP_CODES: Record<CardLogControlOp, number> = {
  read: 0x00,
  start: 0x01,
  stop: 0x02,
};

const OP_BY_CODE = new Map<number, CardLogControlOp>(
  Object.entries(CARD_LOG_OP_CODES).map(([op, code]) => [code, op as CardLogControlOp])
);

const RESULT_BY_CODE = new Map<number, CardLogControlResult>([
  [0x00, 'ok'],
  [0x01, 'queued'],
  [0x02, 'busy'],
  [0x03, 'invalidLength'],
  [0x04, 'invalidOp'],
  [0x05, 'unavailable'],
  [0x06, 'failed'],
  [0x07, 'wrongMode'],
]);

export const buildCardLogControlRequest = (op: CardLogControlOp): Uint8Array => {
  const opCode = CARD_LOG_OP_CODES[op];
  if (opCode === undefined) {
    throw new Error(`未対応のカードログ操作です: ${op}`);
  }
  return new Uint8Array([opCode]);
};

export const parseCardLogControlStatus = (value: DataView): CardLogControlStatus => {
  if (value.byteLength < CARD_LOG_CONTROL_STATUS_LENGTH) {
    throw new Error(`カードログ制御ステータスが短すぎます: ${value.byteLength} bytes`);
  }

  const lastOpCode = value.getUint8(1);
  const resultCode = value.getUint8(2);
  const flags = value.getUint8(4);

  return {
    protocolVersion: value.getUint8(0),
    lastOpCode,
    lastOp: OP_BY_CODE.get(lastOpCode) ?? 'unknown',
    resultCode,
    result: RESULT_BY_CODE.get(resultCode) ?? 'unknown',
    cardState: value.getUint8(3),
    flags,
    cardAvailable: (flags & 0x01) !== 0,
    loggingEnabled: (flags & 0x02) !== 0,
    canLog: (flags & 0x04) !== 0,
    stopReasonCode: value.getUint8(5),
  };
};
