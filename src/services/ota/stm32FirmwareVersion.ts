export interface Stm32SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

export const STM32_INITIAL_VERSION = '1.0.0';
export const STM32_VERSION_CODE_MARKER = 0x7e000000;
export const STM32_INITIAL_VERSION_CODE = 0x7e010000;
export const STM32_MIN_REVISION = 1;
export const STM32_UPDATE_CONTRACT_VERSION = 3;

const validComponent = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value <= 255;

export function formatCanonicalStm32Version(version: Stm32SemanticVersion): string {
  if (!validComponent(version.major) || !validComponent(version.minor) ||
      !validComponent(version.patch)) {
    throw new Error('STM32 FW version components must be integers in 0..255');
  }
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function parseCanonicalStm32Version(text: string): Stm32SemanticVersion {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(text)) {
    throw new Error('STM32 FW version must be canonical MAJOR.MINOR.PATCH');
  }
  const [major, minor, patch] = text.split('.').map(Number);
  const parsed = { major, minor, patch };
  if (!validComponent(major) || !validComponent(minor) || !validComponent(patch) ||
      formatCanonicalStm32Version(parsed) !== text) {
    throw new Error('STM32 FW version is not canonical');
  }
  return parsed;
}

export function packStm32VersionCode(version: Stm32SemanticVersion | string): number {
  const parsed = typeof version === 'string'
    ? parseCanonicalStm32Version(version)
    : parseCanonicalStm32Version(formatCanonicalStm32Version(version));
  return (STM32_VERSION_CODE_MARKER |
    (parsed.major << 16) |
    (parsed.minor << 8) |
    parsed.patch) >>> 0;
}

export function decodeStm32VersionCode(code: number): Stm32SemanticVersion {
  if (!Number.isInteger(code) || code < 0 || code > 0xffffffff ||
      ((code >>> 24) & 0xff) !== 0x7e) {
    throw new Error('STM32 FW version code marker is invalid');
  }
  return {
    major: (code >>> 16) & 0xff,
    minor: (code >>> 8) & 0xff,
    patch: code & 0xff,
  };
}

export function formatStm32VersionCode(code: number): string {
  return formatCanonicalStm32Version(decodeStm32VersionCode(code));
}

export function compareStm32Versions(
  left: Stm32SemanticVersion | string,
  right: Stm32SemanticVersion | string,
): number {
  const a = typeof left === 'string' ? parseCanonicalStm32Version(left) : left;
  const b = typeof right === 'string' ? parseCanonicalStm32Version(right) : right;
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return 0;
}
