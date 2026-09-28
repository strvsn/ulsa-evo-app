export interface Esp32FirmwareArtifactIdentity {
  profile: 'demo' | 'initial';
  version: string;
  revision: number;
  commit: string;
  dirty: boolean;
  sha256: string;
}

const MAGIC = new TextEncoder().encode('ULSAE32V');
const DESCRIPTOR_SIZE = 138;
const DEMO_PROFILE_CODE = 1;
const INITIAL_PROFILE_CODE = 2;

const bytesEqual = (data: Uint8Array, offset: number, expected: Uint8Array): boolean =>
  expected.every((value, index) => data[offset + index] === value);

const decodeNullTerminated = (data: Uint8Array, offset: number, length: number): string => {
  const field = data.slice(offset, offset + length);
  const nullIndex = field.indexOf(0);
  if (nullIndex < 0) throw new Error('ESP32 firmware identity string is not terminated');
  return new TextDecoder().decode(field.slice(0, nullIndex));
};

const toHex = (data: ArrayBuffer): string =>
  Array.from(new Uint8Array(data), (value) => value.toString(16).padStart(2, '0')).join('');

const readFile = (file: File): Promise<ArrayBuffer> => {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error('firmware.binを読み取れません'));
    reader.readAsArrayBuffer(file);
  });
};

export const inspectEsp32FirmwareArtifact = async (
  file: File
): Promise<Esp32FirmwareArtifactIdentity> => {
  const buffer = await readFile(file);
  const data = new Uint8Array(buffer);
  const offsets: number[] = [];
  for (let offset = 0; offset + DESCRIPTOR_SIZE <= data.length; offset += 1) {
    if (bytesEqual(data, offset, MAGIC)) offsets.push(offset);
  }
  if (offsets.length !== 1) {
    throw new Error(`ESP32 firmware identity must occur once, found ${offsets.length}`);
  }

  const offset = offsets[0];
  const view = new DataView(buffer, offset, DESCRIPTOR_SIZE);
  if (view.getUint8(8) !== 1) throw new Error('Unsupported ESP32 firmware identity schema');
  const profileCode = view.getUint8(9);
  if (profileCode !== DEMO_PROFILE_CODE && profileCode !== INITIAL_PROFILE_CODE) {
    throw new Error('Invalid ESP32 firmware profile');
  }
  const flags = view.getUint16(10, true);
  const commit = decodeNullTerminated(data, offset + 20, 41);
  const version = decodeNullTerminated(data, offset + 61, 12);
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version) || !/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error('Invalid ESP32 firmware identity fields');
  }

  return {
    profile: profileCode === DEMO_PROFILE_CODE ? 'demo' : 'initial',
    version,
    revision: view.getUint32(16, true),
    commit,
    dirty: (flags & 0x0001) !== 0,
    sha256: toHex(await crypto.subtle.digest('SHA-256', buffer)),
  };
};

export const verifyDemoFirmwareArtifact = async (
  file: File,
  expectedSha256: string
): Promise<Esp32FirmwareArtifactIdentity> => {
  const identity = await inspectEsp32FirmwareArtifact(file);
  if (identity.profile !== 'demo') throw new Error('Demo firmwareではありません');
  if (identity.dirty) throw new Error('dirty buildはInitialへ導入できません');
  if (!/^[0-9a-f]{64}$/.test(expectedSha256) || identity.sha256 !== expectedSha256) {
    throw new Error('Demo firmwareのSHA-256がRelease情報と一致しません');
  }
  return identity;
};
