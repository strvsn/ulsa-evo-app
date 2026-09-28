import { describe, expect, it } from 'vitest';
import { inspectEsp32FirmwareArtifact } from './esp32FirmwareIdentity';

const encode = (value: string, target: Uint8Array, offset: number, length: number) => {
  target.set(new TextEncoder().encode(value).slice(0, length - 1), offset);
};

const firmware = (profileCode = 1, flags = 0): File => {
  const bytes = new Uint8Array(220);
  const offset = 31;
  bytes.set(new TextEncoder().encode('ULSAE32V'), offset);
  const view = new DataView(bytes.buffer);
  view.setUint8(offset + 8, 1);
  view.setUint8(offset + 9, profileCode);
  view.setUint16(offset + 10, flags, true);
  view.setUint32(offset + 12, 0x7e010000, true);
  view.setUint32(offset + 16, 123, true);
  encode('0123456789abcdef0123456789abcdef01234567', bytes, offset + 20, 41);
  encode('1.0.0', bytes, offset + 61, 12);
  encode('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', bytes, offset + 73, 65);
  return new File([bytes], 'firmware.bin');
};

const readFile = (file: File): Promise<ArrayBuffer> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as ArrayBuffer);
  reader.onerror = () => reject(reader.error);
  reader.readAsArrayBuffer(file);
});

describe('ESP32 firmware artifact identity', () => {
  it('reads the embedded Demo identity and SHA-256', async () => {
    const identity = await inspectEsp32FirmwareArtifact(firmware());
    expect(identity).toMatchObject({
      profile: 'demo',
      version: '1.0.0',
      revision: 123,
      commit: '0123456789abcdef0123456789abcdef01234567',
      dirty: false,
    });
    expect(identity.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('distinguishes Initial and dirty artifacts', async () => {
    await expect(inspectEsp32FirmwareArtifact(firmware(2, 1))).resolves.toMatchObject({
      profile: 'initial',
      dirty: true,
    });
  });

  it('rejects missing or duplicate descriptors', async () => {
    await expect(inspectEsp32FirmwareArtifact(new File([new Uint8Array(20)], 'bad.bin')))
      .rejects.toThrow('must occur once');
    const one = new Uint8Array(await readFile(firmware()));
    await expect(inspectEsp32FirmwareArtifact(new File([one, one], 'duplicate.bin')))
      .rejects.toThrow('found 2');
  });
});
