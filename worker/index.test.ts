// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import worker from './index';
import type { RuntimeEnv } from './environment';
import { createStm32DownloadToken, verifyStm32DownloadToken } from './token';

const ESP32_KEY = 'esp32/esp32-fw-v1.0.0-r1/ulsa-evo-esp32-demo-firmware.bin';
const STM32_RELEASE_TAG = 'stm32-1.0.0-field.1';
const STM32_ASSET = `ULSA_EVO_STM32_F411-1.0.0-${STM32_RELEASE_TAG}-field-preserve.ulsa-stm32pkg`;
const STM32_KEY = `stm32/stm32-fw-v1.0.0-r1/f411/${STM32_ASSET}`;
const TOKEN_SECRET = 'worker-test-download-token-secret-32-bytes-minimum';

const esp32Catalog = {
  schemaVersion: 1,
  releases: [{
    tag: 'esp32-fw-v1.0.0-r1',
    title: 'ULSA EVO ESP32 1.0.0',
    profile: 'demo',
    prerelease: true,
    publishedAt: '2026-09-04T00:00:00Z',
    size: 4,
    sha256: 'a'.repeat(64),
    objectKey: ESP32_KEY,
    releaseNotes: { ja: ['日本語のテスト変更'], en: ['English test change'] },
  }],
};

const stm32Catalog = {
  schemaVersion: 1,
  releases: [{
    tag: 'stm32-fw-v1.0.0-r1',
    title: 'ULSA EVO STM32 1.0.0',
    assetName: STM32_ASSET,
    target: 'ULSA_EVO_STM32_F411',
    version: '1.0.0',
    releaseTag: STM32_RELEASE_TAG,
    buildProfile: 'field',
    rdpPolicy: 'preserve',
    requiresAdmin: false,
    versionScheme: 'semver',
    minClientContract: 3,
    prerelease: true,
    publishedAt: '2026-09-04T00:00:00Z',
    size: 5,
    sha256: 'b'.repeat(64),
    objectKey: STM32_KEY,
  }],
};

type MockEntry = {
  bytes: Uint8Array;
  sha256?: string;
};

class MockBucket {
  private readonly entries = new Map<string, MockEntry>();

  put(key: string, value: string | Uint8Array, sha256?: string): void {
    this.entries.set(key, {
      bytes: typeof value === 'string' ? new TextEncoder().encode(value) : value,
      sha256,
    });
  }

  setSha256(key: string, sha256: string): void {
    const entry = this.entries.get(key);
    if (entry) entry.sha256 = sha256;
  }

  async head(key: string) {
    const entry = this.entries.get(key);
    return entry ? this.metadata(key, entry) : null;
  }

  async get(key: string, options?: { range?: { offset?: number; length?: number } }) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const range = options?.range;
    const offset = range?.offset ?? 0;
    const length = range?.length ?? entry.bytes.byteLength;
    const bytes = entry.bytes.slice(offset, offset + length);
    return {
      ...this.metadata(key, entry),
      body: new Blob([bytes]).stream(),
      bodyUsed: false,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      text: async () => new TextDecoder().decode(bytes),
      json: async () => JSON.parse(new TextDecoder().decode(bytes)),
      blob: async () => new Blob([bytes]),
    };
  }

  private metadata(key: string, entry: MockEntry) {
    return {
      key,
      version: '1',
      size: entry.bytes.byteLength,
      etag: 'mock-etag',
      httpEtag: '"mock-etag"',
      uploaded: new Date('2026-09-04T00:00:00Z'),
      customMetadata: entry.sha256 ? { sha256: entry.sha256 } : undefined,
      storageClass: 'Standard',
      checksums: {},
      writeHttpMetadata: () => undefined,
    };
  }
}

const createTestEnv = (overrides: Partial<RuntimeEnv> = {}) => {
  const bucket = new MockBucket();
  bucket.put('catalog/esp32.json', JSON.stringify(esp32Catalog));
  bucket.put('catalog/stm32.json', JSON.stringify(stm32Catalog));
  bucket.put(ESP32_KEY, new Uint8Array([1, 2, 3, 4]), 'a'.repeat(64));
  bucket.put(STM32_KEY, new Uint8Array([5, 6, 7, 8, 9]), 'b'.repeat(64));
  const assetFetch = vi.fn(async () => new Response('spa', { status: 200 }));
  const env = {
    FIRMWARE_BUCKET: bucket,
    ASSETS: { fetch: assetFetch },
    ALLOWED_ORIGINS: '*',
    ESP32_INCLUDE_PRERELEASES: 'true',
    STM32_ACCESS_MODE: 'public',
    STM32_INCLUDE_PRERELEASES: 'true',
    STM32_DOWNLOAD_TOKEN_TTL_SECONDS: '300',
    STM32_DOWNLOAD_TOKEN_SECRET: TOKEN_SECRET,
    ...overrides,
  } as RuntimeEnv;
  return { env, bucket, assetFetch };
};

const fetchWorker = (request: Request, env: RuntimeEnv): Promise<Response> => (
  worker.fetch(request, env)
);

describe('ULSA EVO Cloudflare Worker', () => {
  it('serves non-API paths through the Static Assets binding', async () => {
    const { env, assetFetch } = createTestEnv();
    const response = await fetchWorker(new Request('https://app.example/dashboard'), env);
    expect(await response.text()).toBe('spa');
    expect(assetFetch).toHaveBeenCalledOnce();
  });

  it('returns the compiled release identity without caching and fails closed when absent', async () => {
    const { env } = createTestEnv();
    const identity = {
      schemaVersion: 1,
      product: 'ulsa-evo-app',
      appVersion: '1.0.0',
      sourceSha: 'c'.repeat(40),
      clientAssetsSha256: 'd'.repeat(64),
      stm32UpdaterEnabled: true,
      releaseChannel: 'staging',
      deploymentId: '12345',
      esp32CatalogPath: '/api/firmware/releases',
      stm32CatalogPath: '/api/stm32-firmware/releases',
    };
    Object.defineProperty(globalThis, '__ULSA_RELEASE_IDENTITY__', {
      configurable: true,
      value: identity,
    });
    try {
      const response = await fetchWorker(new Request('https://app.example/api/release-identity'), env);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toEqual(identity);
      expect((await fetchWorker(new Request('https://app.example/api/release-identity', {
        method: 'POST',
      }), env)).status).toBe(405);
    } finally {
      Reflect.deleteProperty(globalThis, '__ULSA_RELEASE_IDENTITY__');
    }
    expect((await fetchWorker(new Request('https://app.example/api/release-identity'), env)).status).toBe(503);
  });

  it('maps the private ESP32 catalog to the existing client response without object keys', async () => {
    const { env } = createTestEnv();
    const response = await fetchWorker(new Request('https://app.example/api/firmware/releases'), env);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ releases: [expect.objectContaining({
      id: 'esp32-fw-v1.0.0-r1',
      tagName: 'esp32-fw-v1.0.0-r1',
      firmwareSha256: 'a'.repeat(64),
      downloadUrl: 'https://app.example/api/firmware/download?tag=esp32-fw-v1.0.0-r1',
      latest: true,
      prerelease: true,
    })] });
    expect(JSON.stringify(payload)).not.toContain('objectKey');
  });

  it('accepts the existing ESP32 catalog without release notes', async () => {
    const { env, bucket } = createTestEnv();
    const legacyEntry = { ...esp32Catalog.releases[0], releaseNotes: undefined };
    bucket.put('catalog/esp32.json', JSON.stringify({ schemaVersion: 1, releases: [legacyEntry] }));
    const response = await fetchWorker(new Request('https://app.example/api/firmware/releases'), env);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.releases[0]).toMatchObject({ id: legacyEntry.tag });
    expect(payload.releases[0]).not.toHaveProperty('releaseNotes');
  });

  it('rejects malformed release notes when the field is present', async () => {
    const { env, bucket } = createTestEnv();
    bucket.put('catalog/esp32.json', JSON.stringify({
      schemaVersion: 1,
      releases: [{ ...esp32Catalog.releases[0], releaseNotes: null }],
    }));
    const response = await fetchWorker(new Request('https://app.example/api/firmware/releases'), env);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: 'catalog_invalid' });
  });

  it('passes bilingual STM32 notes through while accepting older catalogs without them', async () => {
    const { env, bucket } = createTestEnv();
    const entry = stm32Catalog.releases[0];
    bucket.put('catalog/stm32.json', JSON.stringify({ schemaVersion: 1, releases: [{
      ...entry, releaseNotes: { ja: ['計測を改善しました'], en: ['Improved measurement'] },
    }] }));
    const url = 'https://app.example/api/stm32-firmware/releases';
    const headers = { 'X-ULSA-STM32-Client-Contract': '3' };
    const current = await fetchWorker(new Request(url, { headers }), env);
    expect(current.status).toBe(200);
    expect((await current.json()).releases[0].releaseNotes.ja).toEqual(['計測を改善しました']);

    bucket.put('catalog/stm32.json', JSON.stringify(stm32Catalog));
    const legacy = await fetchWorker(new Request(url, { headers }), env);
    expect(legacy.status).toBe(200);
    expect((await legacy.json()).releases[0]).not.toHaveProperty('releaseNotes');
  });

  it('rejects malformed STM32 release notes when present', async () => {
    const { env, bucket } = createTestEnv();
    bucket.put('catalog/stm32.json', JSON.stringify({ schemaVersion: 1, releases: [{
      ...stm32Catalog.releases[0], releaseNotes: { ja: ['概要'], en: [] },
    }] }));
    const response = await fetchWorker(new Request('https://app.example/api/stm32-firmware/releases', {
      headers: { 'X-ULSA-STM32-Client-Contract': '3' },
    }), env);
    expect(response.status).toBe(502);
  });

  it('streams full, HEAD, ranged, and conditional ESP32 downloads', async () => {
    const { env } = createTestEnv();
    const url = 'https://app.example/api/firmware/download?tag=esp32-fw-v1.0.0-r1';
    const full = await fetchWorker(new Request(url), env);
    expect(full.status).toBe(200);
    expect([...new Uint8Array(await full.arrayBuffer())]).toEqual([1, 2, 3, 4]);
    expect(full.headers.get('ETag')).toBe(`"${'a'.repeat(64)}"`);
    expect(full.headers.get('Accept-Ranges')).toBe('bytes');

    const head = await fetchWorker(new Request(url, { method: 'HEAD' }), env);
    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Length')).toBe('4');
    expect(await head.text()).toBe('');

    const range = await fetchWorker(new Request(url, { headers: { Range: 'bytes=1-2' } }), env);
    expect(range.status).toBe(206);
    expect(range.headers.get('Content-Range')).toBe('bytes 1-2/4');
    expect([...new Uint8Array(await range.arrayBuffer())]).toEqual([2, 3]);

    const cached = await fetchWorker(new Request(url, {
      headers: { 'If-None-Match': `"${'a'.repeat(64)}"` },
    }), env);
    expect(cached.status).toBe(304);
  });

  it('returns 416 for invalid ranges and rejects artifact metadata mismatch', async () => {
    const { env, bucket } = createTestEnv();
    const url = 'https://app.example/api/firmware/download?tag=esp32-fw-v1.0.0-r1';
    const range = await fetchWorker(new Request(url, { headers: { Range: 'bytes=9-10' } }), env);
    expect(range.status).toBe(416);
    expect(range.headers.get('Content-Range')).toBe('bytes */4');

    bucket.setSha256(ESP32_KEY, 'c'.repeat(64));
    const mismatch = await fetchWorker(new Request(url), env);
    expect(mismatch.status).toBe(502);
    expect(await mismatch.json()).toMatchObject({ code: 'artifact_sha256_mismatch' });
  });

  it('does not expose arbitrary bucket keys through query parameters', async () => {
    const { env, bucket } = createTestEnv();
    bucket.put('private/secret.bin', new Uint8Array([42]));
    const response = await fetchWorker(new Request(
      'https://app.example/api/firmware/download?tag=private%2Fsecret.bin&key=private%2Fsecret.bin',
    ), env);
    expect(response.status).toBe(404);
  });

  it('rejects catalog entries that redirect a valid tag to a non-canonical object key', async () => {
    const { env, bucket } = createTestEnv();
    bucket.put('private/secret.bin', new Uint8Array([42]));
    bucket.put('catalog/esp32.json', JSON.stringify({
      ...esp32Catalog,
      releases: [{ ...esp32Catalog.releases[0], objectKey: 'esp32/private/secret.bin' }],
    }));
    const response = await fetchWorker(new Request(
      'https://app.example/api/firmware/download?tag=esp32-fw-v1.0.0-r1',
    ), env);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: 'catalog_invalid' });
  });

  it('filters STM32 by client contract and keeps the production-disabled catalog empty', async () => {
    const { env } = createTestEnv();
    const oldClient = await fetchWorker(new Request(
      'https://app.example/api/stm32-firmware/releases',
      { headers: { 'X-ULSA-STM32-Client-Contract': '2' } },
    ), env);
    expect(await oldClient.json()).toEqual({ releases: [] });

    const currentClient = await fetchWorker(new Request(
      'https://app.example/api/stm32-firmware/releases',
      { headers: { 'X-ULSA-STM32-Client-Contract': '3' } },
    ), env);
    const payload = await currentClient.json();
    expect(payload.releases[0]).toMatchObject({
      target: 'ULSA_EVO_STM32_F411',
      packageSha256: 'b'.repeat(64),
      minClientContract: 3,
    });
    expect(JSON.stringify(payload)).not.toContain('objectKey');

    const { env: disabled } = createTestEnv({ STM32_ACCESS_MODE: 'disabled' });
    const production = await fetchWorker(new Request(
      'https://app.example/api/stm32-firmware/releases',
      { headers: { 'X-ULSA-STM32-Client-Contract': '3' } },
    ), disabled);
    expect(await production.json()).toEqual({ releases: [] });
  });

  it('issues a five-minute STM32 token and enforces its device/session binding', async () => {
    const { env } = createTestEnv();
    const tokenResponse = await fetchWorker(new Request(
      'https://app.example/api/stm32-firmware/download-token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ULSA-Device-Id': 'device-1',
          'X-ULSA-Session-Id': 'session-1',
          'X-ULSA-STM32-Client-Contract': '3',
        },
        body: JSON.stringify({
          tagName: 'stm32-fw-v1.0.0-r1',
          assetName: STM32_ASSET,
          releaseTag: STM32_RELEASE_TAG,
        }),
      },
    ), env);
    expect(tokenResponse.status).toBe(200);
    const tokenPayload = await tokenResponse.json();
    expect(tokenPayload.expiresInSeconds).toBe(300);
    expect(tokenPayload.downloadToken).toMatch(/^v1\./);

    const download = await fetchWorker(new Request(tokenPayload.downloadUrl, {
      headers: {
        'X-ULSA-Device-Id': 'device-1',
        'X-ULSA-Session-Id': 'session-1',
        'X-ULSA-STM32-Client-Contract': '3',
        'X-ULSA-STM32-Download-Token': tokenPayload.downloadToken,
      },
    }), env);
    expect(download.status).toBe(200);
    expect([...new Uint8Array(await download.arrayBuffer())]).toEqual([5, 6, 7, 8, 9]);

    const mismatch = await fetchWorker(new Request(tokenPayload.downloadUrl, {
      headers: {
        'X-ULSA-Device-Id': 'different-device',
        'X-ULSA-Session-Id': 'session-1',
        'X-ULSA-STM32-Client-Contract': '3',
        'X-ULSA-STM32-Download-Token': tokenPayload.downloadToken,
      },
    }), env);
    expect(mismatch.status).toBe(401);
    expect(await mismatch.json()).toMatchObject({ code: 'download_token_binding_mismatch' });
  });

  it('rejects expired tokens without maintaining isolate-local replay state', async () => {
    const issued = await createStm32DownloadToken({
      tagName: 'stm32-fw-v1.0.0-r1',
      assetName: STM32_ASSET,
      deviceId: 'device-1',
      sessionId: 'session-1',
      releaseTag: STM32_RELEASE_TAG,
      clientContract: 3,
    }, TOKEN_SECRET, 300, 1_000_000);
    await expect(verifyStm32DownloadToken(issued.token, TOKEN_SECRET, {
      deviceId: 'device-1', sessionId: 'session-1', clientContract: 3,
    }, 1_301_000)).rejects.toMatchObject({ code: 'download_token_expired' });
  });

  it('enforces CORS, method handling, request size, and catalog validation', async () => {
    const { env, bucket } = createTestEnv({ ALLOWED_ORIGINS: 'https://app.example' });
    const denied = await fetchWorker(new Request('https://app.example/api/firmware/releases', {
      headers: { Origin: 'https://evil.example' },
    }), env);
    expect(denied.status).toBe(403);
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const preflight = await fetchWorker(new Request('https://app.example/api/firmware/releases', {
      method: 'OPTIONS', headers: { Origin: 'https://app.example' },
    }), env);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');

    const method = await fetchWorker(new Request('https://app.example/api/firmware/releases', {
      method: 'POST',
    }), env);
    expect(method.status).toBe(405);

    const oversized = await fetchWorker(new Request(
      'https://app.example/api/stm32-firmware/download-token',
      { method: 'POST', headers: { 'Content-Length': '5000' }, body: '{}' },
    ), env);
    expect(oversized.status).toBe(413);

    bucket.put('catalog/esp32.json', '{bad json');
    const invalid = await fetchWorker(new Request('https://app.example/api/firmware/releases'), env);
    expect(invalid.status).toBe(502);
    expect(await invalid.json()).toMatchObject({ code: 'catalog_invalid' });
  });
});
