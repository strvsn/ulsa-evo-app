import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimInitialDemoSession, createInitialDemoClientNonce } from './initialDemoOta';

const identity = {
  profile: 'demo' as const,
  version: '1.0.0',
  revision: 123,
  commit: '0123456789abcdef0123456789abcdef01234567',
  dirty: false,
  sha256: 'a'.repeat(64),
};

describe('Initial Demo OTA session', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a 32-byte hexadecimal nonce', () => {
    expect(createInitialDemoClientNonce()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('claims and validates the fixed Initial session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        contractVersion: 1,
        purpose: 'esp32_ota',
        sessionOrigin: 'initial_setup',
        firmwareProfile: 'initial',
        targetProfile: 'demo',
        ssid: 'ULSA-EVO-INITIAL',
        password: 'ulsa-evo-initial',
        token: 'token',
        ip: '192.168.4.1',
        remainingSeconds: 300,
      }),
    }));
    await expect(claimInitialDemoSession(identity, 'b'.repeat(64)))
      .resolves.toMatchObject({ sessionOrigin: 'initial_setup', targetProfile: 'demo' });
    expect(fetch).toHaveBeenCalledWith(
      'http://192.168.4.1/initial/ota-session',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('rejects a mismatched session response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ contractVersion: 1, sessionOrigin: 'initial_setup' }),
    }));
    await expect(claimInitialDemoSession(identity, 'b'.repeat(64)))
      .rejects.toThrow('応答が不正');
  });

  it('identifies a non-JSON Initial response instead of treating it as a Wi-Fi failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    }));
    await expect(claimInitialDemoSession(identity, 'b'.repeat(64)))
      .rejects.toThrow('JSONではありません');
  });
});
