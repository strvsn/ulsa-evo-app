import { spawnSync } from 'node:child_process';

export const RELEASE_IDENTITY_API_PATH = '/api/release-identity';
export const RELEASE_IDENTITY_PRODUCT = 'ulsa-evo-app';
export const RELEASE_IDENTITY_SCHEMA_VERSION = 1;

const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const DEPLOYMENT_ID_PATTERN = /^(?:[1-9]\d*|local|test)$/;
const RELEASE_CHANNELS = new Set(['development', 'test', 'staging', 'production']);
const REQUIRED_KEYS = Object.freeze([
  'schemaVersion',
  'product',
  'appVersion',
  'sourceSha',
  'clientAssetsSha256',
  'stm32UpdaterEnabled',
  'releaseChannel',
  'deploymentId',
  'esp32CatalogPath',
  'stm32CatalogPath',
]);
const STATUS_MARKER = '__ULSA_RELEASE_IDENTITY_HTTP_STATUS__:';

export function createReleaseIdentity(input) {
  const identity = {
    schemaVersion: RELEASE_IDENTITY_SCHEMA_VERSION,
    product: RELEASE_IDENTITY_PRODUCT,
    appVersion: input.appVersion,
    sourceSha: input.sourceSha,
    clientAssetsSha256: input.clientAssetsSha256,
    stm32UpdaterEnabled: input.stm32UpdaterEnabled,
    releaseChannel: input.releaseChannel,
    deploymentId: input.deploymentId,
    esp32CatalogPath: '/api/firmware/releases',
    stm32CatalogPath: '/api/stm32-firmware/releases',
  };
  const failures = validateReleaseIdentityPayload(identity);
  if (failures.length > 0) {
    throw new Error(`Invalid release identity: ${failures.join('; ')}`);
  }
  return Object.freeze(identity);
}

export function validateReleaseIdentityPayload(payload, expected = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['release identity must be an object'];
  }
  const failures = [];
  const keys = Object.keys(payload).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...REQUIRED_KEYS].sort())) {
    failures.push('release identity fields do not match schema version 1');
  }
  if (payload.schemaVersion !== RELEASE_IDENTITY_SCHEMA_VERSION) {
    failures.push('release identity schemaVersion must be 1');
  }
  if (payload.product !== RELEASE_IDENTITY_PRODUCT) {
    failures.push(`release identity product must be ${RELEASE_IDENTITY_PRODUCT}`);
  }
  if (typeof payload.appVersion !== 'string' || !VERSION_PATTERN.test(payload.appVersion)) {
    failures.push('release identity appVersion must be SemVer');
  }
  if (typeof payload.sourceSha !== 'string' || !SOURCE_SHA_PATTERN.test(payload.sourceSha)) {
    failures.push('release identity sourceSha must be a lowercase 40-character Git SHA');
  }
  if (typeof payload.clientAssetsSha256 !== 'string' || !SHA256_PATTERN.test(payload.clientAssetsSha256)) {
    failures.push('release identity clientAssetsSha256 must be lowercase SHA-256');
  }
  if (typeof payload.stm32UpdaterEnabled !== 'boolean') {
    failures.push('release identity stm32UpdaterEnabled must be boolean');
  }
  if (typeof payload.releaseChannel !== 'string' || !RELEASE_CHANNELS.has(payload.releaseChannel)) {
    failures.push('release identity releaseChannel is unsupported');
  }
  if (typeof payload.deploymentId !== 'string' || !DEPLOYMENT_ID_PATTERN.test(payload.deploymentId)) {
    failures.push('release identity deploymentId is invalid');
  }
  if (payload.esp32CatalogPath !== '/api/firmware/releases') {
    failures.push('release identity ESP32 catalog path is invalid');
  }
  if (payload.stm32CatalogPath !== '/api/stm32-firmware/releases') {
    failures.push('release identity STM32 catalog path is invalid');
  }

  for (const [field, value] of Object.entries(expected)) {
    if (value !== undefined && payload[field] !== value) {
      failures.push(`release identity ${field} does not match the release candidate`);
    }
  }
  return failures;
}

export function releaseIdentityOriginFromCatalogUrls(esp32Url, stm32Url) {
  try {
    const esp32 = new URL(esp32Url);
    const stm32 = new URL(stm32Url);
    if (esp32.protocol !== 'https:' || stm32.protocol !== 'https:') {
      return { origin: '', error: 'firmware catalogs and release identity must use HTTPS' };
    }
    if (esp32.origin !== stm32.origin) {
      return { origin: '', error: 'ESP32 and STM32 catalogs must use the same release-candidate origin' };
    }
    return { origin: esp32.origin, error: '' };
  } catch {
    return { origin: '', error: 'firmware catalog URL is invalid' };
  }
}

export function probeReleaseIdentitySync({
  origin,
  expected = {},
  run = spawnSync,
  timeoutSeconds = 10,
}) {
  let url;
  try {
    const parsed = new URL(RELEASE_IDENTITY_API_PATH, origin);
    if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
      return { failures: ['release identity endpoint must use HTTPS'], identity: null, url: '' };
    }
    if (expected.sourceSha) parsed.searchParams.set('source', expected.sourceSha);
    if (expected.clientAssetsSha256) parsed.searchParams.set('content', expected.clientAssetsSha256);
    url = parsed.toString();
  } catch {
    return { failures: ['release identity origin is invalid'], identity: null, url: '' };
  }

  const result = run('curl', [
    '--silent',
    '--show-error',
    '--max-time',
    String(timeoutSeconds),
    '--header',
    'Accept: application/json',
    '--header',
    'Cache-Control: no-cache',
    '--write-out',
    `\n${STATUS_MARKER}%{http_code}\n`,
    url,
  ], {
    encoding: 'utf8',
    timeout: (timeoutSeconds + 2) * 1000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || String(result.stderr || '').trim() || `exit ${result.status}`;
    return { failures: [`release identity probe failed: ${detail}`], identity: null, url };
  }
  const markerIndex = result.stdout.lastIndexOf(`\n${STATUS_MARKER}`);
  if (markerIndex < 0) {
    return { failures: ['release identity probe returned no HTTP status'], identity: null, url };
  }
  const status = Number.parseInt(
    result.stdout.slice(markerIndex + STATUS_MARKER.length + 1).trim(),
    10,
  );
  if (status !== 200) {
    return {
      failures: [`release identity is unavailable: HTTP ${Number.isFinite(status) ? status : 'unknown'}`],
      identity: null,
      url,
    };
  }
  let identity;
  try {
    identity = JSON.parse(result.stdout.slice(0, markerIndex));
  } catch {
    return { failures: ['release identity response is not JSON'], identity: null, url };
  }
  const failures = validateReleaseIdentityPayload(identity, expected);
  return { failures, identity: failures.length === 0 ? identity : null, url };
}
