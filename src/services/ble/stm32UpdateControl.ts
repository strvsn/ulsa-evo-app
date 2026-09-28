import type {
  Stm32UpdateControlOp,
  Stm32UpdateControlSessionBinding,
  Stm32UpdateControlStatus,
} from '../../types/ble';
import { buildOtaControlRequest, parseOtaControlStatus } from './otaControl';

const PREPARE_PORTAL_OP = 1;
const EXPECTED_NODE_ID_FLAG = 0x01;
const TARGET_FLAG = 0x02;
const RELEASE_TAG_FLAG = 0x04;
const TARGET_MAX_BYTES = 32;
const RELEASE_TAG_MAX_BYTES = 64;
const textEncoder = new TextEncoder();

const encodeBoundedString = (value: string, maxBytes: number, label: string): Uint8Array => {
  const encoded = textEncoder.encode(value);
  if (encoded.length === 0 || encoded.length > maxBytes) {
    throw new Error(`${label} must be 1..${maxBytes} UTF-8 bytes`);
  }
  return encoded;
};

export const buildStm32UpdateControlRequest = (
  op: Stm32UpdateControlOp,
  binding?: Stm32UpdateControlSessionBinding
): Uint8Array => {
  if (op !== 'preparePortal' || !binding) return buildOtaControlRequest(op);

  const target = encodeBoundedString(binding.target, TARGET_MAX_BYTES, 'STM32 update target');
  const releaseTag = encodeBoundedString(binding.releaseTag, RELEASE_TAG_MAX_BYTES, 'STM32 update releaseTag');
  const hasExpectedNodeId = Number.isInteger(binding.expectedNodeId) &&
    binding.expectedNodeId !== undefined &&
    binding.expectedNodeId >= 0 &&
    binding.expectedNodeId <= 255;
  const payload = new Uint8Array(5 + target.length + releaseTag.length);
  payload[0] = PREPARE_PORTAL_OP;
  payload[1] = TARGET_FLAG | RELEASE_TAG_FLAG | (hasExpectedNodeId ? EXPECTED_NODE_ID_FLAG : 0);
  payload[2] = hasExpectedNodeId ? (binding.expectedNodeId as number) : 0;
  payload[3] = target.length;
  payload[4] = releaseTag.length;
  payload.set(target, 5);
  payload.set(releaseTag, 5 + target.length);
  return payload;
};

export const parseStm32UpdateControlStatus = (value: DataView): Stm32UpdateControlStatus => {
  const status = parseOtaControlStatus(value);
  return {
    ...status,
    lastOp: status.lastOp,
    result: status.result,
  };
};
