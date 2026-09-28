import type { OtaControlOp, OtaControlResult, OtaControlStatus } from '../../types/ble';

const V1_HEADER_SIZE = 22;
const V2_HEADER_SIZE = 23;

const OP_TO_CODE: Record<OtaControlOp, number> = {
  read: 0,
  preparePortal: 1,
  activatePortal: 2,
  stopOrCancel: 3,
};

const CODE_TO_OP = new Map<number, OtaControlOp>([
  [0, 'read'],
  [1, 'preparePortal'],
  [2, 'activatePortal'],
  [3, 'stopOrCancel'],
]);

const CODE_TO_RESULT = new Map<number, OtaControlResult>([
  [0, 'ok'],
  [1, 'queued'],
  [2, 'busy'],
  [3, 'invalidLength'],
  [4, 'invalidOp'],
  [5, 'unavailable'],
  [6, 'failed'],
  [7, 'authorizationRequired'],
  [8, 'authorizationExpired'],
  [9, 'peerConflict'],
]);

const textDecoder = new TextDecoder('utf-8');

const readString = (value: DataView, offset: number, length: number): string => {
  if (length <= 0) return '';
  if (offset + length > value.byteLength) {
    throw new Error(`OTA status string exceeds payload length: offset=${offset}, length=${length}, bytes=${value.byteLength}`);
  }
  return textDecoder.decode(new Uint8Array(value.buffer, value.byteOffset + offset, length));
};

const parseNodeIdFromSsid = (ssid: string): number | undefined => {
  const match = ssid.match(/-(\d{1,3})$/);
  if (!match) return undefined;
  const nodeId = Number.parseInt(match[1], 10);
  return Number.isInteger(nodeId) && nodeId >= 0 && nodeId <= 255 ? nodeId : undefined;
};

export const buildOtaControlRequest = (op: OtaControlOp): Uint8Array =>
  new Uint8Array([OP_TO_CODE[op]]);

export const parseOtaControlStatus = (value: DataView): OtaControlStatus => {
  if (value.byteLength < V1_HEADER_SIZE) {
    throw new Error(`OTA status requires ${V1_HEADER_SIZE} bytes, got ${value.byteLength}`);
  }

  const protocolVersion = value.getUint8(0);
  const headerSize = protocolVersion >= 2 ? V2_HEADER_SIZE : V1_HEADER_SIZE;
  if (value.byteLength < headerSize) {
    throw new Error(`OTA status v${protocolVersion} requires ${headerSize} bytes, got ${value.byteLength}`);
  }

  const lastOpCode = value.getUint8(1);
  const resultCode = value.getUint8(2);
  const flags = value.getUint8(5);
  const nodeIdFromPayload = protocolVersion >= 2 ? value.getUint8(18) : undefined;
  const lengthOffset = protocolVersion >= 2 ? 19 : 18;
  const ssidLength = value.getUint8(lengthOffset);
  const passwordLength = value.getUint8(lengthOffset + 1);
  const tokenLength = value.getUint8(lengthOffset + 2);
  const ipLength = value.getUint8(lengthOffset + 3);
  let offset = headerSize;
  const ssid = readString(value, offset, ssidLength);
  offset += ssidLength;
  const password = readString(value, offset, passwordLength);
  offset += passwordLength;
  const token = readString(value, offset, tokenLength);
  offset += tokenLength;
  const ip = readString(value, offset, ipLength);

  return {
    protocolVersion,
    lastOpCode,
    lastOp: CODE_TO_OP.get(lastOpCode) ?? 'unknown',
    resultCode,
    result: CODE_TO_RESULT.get(resultCode) ?? 'unknown',
    stateCode: value.getUint8(3),
    progress: value.getUint8(4),
    flags,
    portalActive: (flags & 0x01) !== 0,
    updating: (flags & 0x02) !== 0,
    hasCredentials: (flags & 0x04) !== 0,
    error: (flags & 0x08) !== 0,
    physicalAuthRequired: (flags & 0x10) !== 0,
    physicalAuthGranted: (flags & 0x20) !== 0,
    recoveryPortal: (flags & 0x40) !== 0,
    reservedFlagSet: (flags & 0x80) !== 0,
    uploadedBytes: value.getUint32(6, true),
    totalBytes: value.getUint32(10, true),
    remainingSeconds: value.getUint32(14, true),
    nodeId: nodeIdFromPayload ?? parseNodeIdFromSsid(ssid),
    ssid,
    password,
    token,
    ip,
  };
};
