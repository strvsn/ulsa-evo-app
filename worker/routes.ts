import {
  ESP32_CATALOG_KEY,
  STM32_CATALOG_KEY,
  loadCatalog,
  parseEsp32Catalog,
  parseStm32Catalog,
  type Esp32CatalogEntry,
  type Stm32CatalogEntry,
} from './catalog';
import { streamFirmwareObject } from './download';
import type { RuntimeEnv } from './environment';
import {
  ApiError,
  jsonResponse,
  readBoundIdentifier,
  readClientContract,
  readLimitedJson,
  requireMethod,
} from './http';
import { createStm32DownloadToken, verifyStm32DownloadToken } from './token';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const origin = (request: Request): string => new URL(request.url).origin;
const includePrereleases = (value: string): boolean => value === 'true';

const esp32ReleaseResponse = (request: Request, entry: Esp32CatalogEntry, index: number) => ({
  id: entry.tag,
  tagName: entry.tag,
  title: entry.title,
  publishedAt: entry.publishedAt,
  assetName: entry.objectKey.slice(entry.objectKey.lastIndexOf('/') + 1),
  size: entry.size,
  firmwareSha256: entry.sha256,
  releaseNotes: entry.releaseNotes,
  downloadUrl: `${origin(request)}/api/firmware/download?tag=${encodeURIComponent(entry.tag)}`,
  prerelease: entry.prerelease,
  latest: index === 0,
});

const stm32ReleaseResponse = (request: Request, entry: Stm32CatalogEntry, index: number) => ({
  id: `${entry.tag}:${entry.assetName}`,
  tagName: entry.tag,
  title: entry.title,
  publishedAt: entry.publishedAt,
  assetName: entry.assetName,
  target: entry.target,
  version: entry.version,
  releaseTag: entry.releaseTag,
  buildProfile: entry.buildProfile,
  rdpPolicy: entry.rdpPolicy,
  requiresAdmin: entry.requiresAdmin,
  size: entry.size,
  packageSha256: entry.sha256,
  releaseNotes: entry.releaseNotes,
  downloadUrl: `${origin(request)}/api/stm32-firmware/download?tag=${encodeURIComponent(entry.tag)}&asset=${encodeURIComponent(entry.assetName)}`,
  downloadTokenUrl: `${origin(request)}/api/stm32-firmware/download-token`,
  prerelease: entry.prerelease,
  latest: index === 0,
  versionScheme: entry.versionScheme,
  minClientContract: entry.minClientContract,
});

const loadEsp32Entries = async (env: RuntimeEnv): Promise<Esp32CatalogEntry[]> => {
  const catalog = await loadCatalog(env.FIRMWARE_BUCKET, ESP32_CATALOG_KEY, parseEsp32Catalog);
  return catalog.releases.filter((entry) => (
    !entry.prerelease || includePrereleases(env.ESP32_INCLUDE_PRERELEASES)
  ));
};

const loadStm32Entries = async (env: RuntimeEnv, clientContract: number): Promise<Stm32CatalogEntry[]> => {
  if (env.STM32_ACCESS_MODE === 'disabled') return [];
  const catalog = await loadCatalog(env.FIRMWARE_BUCKET, STM32_CATALOG_KEY, parseStm32Catalog);
  return catalog.releases.filter((entry) => (
    entry.minClientContract <= clientContract &&
    (!entry.prerelease || includePrereleases(env.STM32_INCLUDE_PRERELEASES))
  ));
};

const findEsp32Entry = async (request: Request, env: RuntimeEnv): Promise<Esp32CatalogEntry> => {
  const tag = new URL(request.url).searchParams.get('tag') || '';
  if (!tag) throw new ApiError(400, 'tag_required', 'tag is required');
  const entry = (await loadEsp32Entries(env)).find((release) => release.tag === tag);
  if (!entry) throw new ApiError(404, 'release_not_found', 'Firmware release was not found');
  return entry;
};

const findStm32Entry = async (
  env: RuntimeEnv,
  clientContract: number,
  tagName: string,
  assetName: string,
  releaseTag = '',
): Promise<Stm32CatalogEntry> => {
  const entry = (await loadStm32Entries(env, clientContract)).find((release) => (
    release.tag === tagName && release.assetName === assetName &&
    (!releaseTag || release.releaseTag === releaseTag)
  ));
  if (!entry) throw new ApiError(403, 'package_not_allowed', 'STM32 firmware package is not allowed by policy');
  return entry;
};

export const handleEsp32Releases = async (request: Request, env: RuntimeEnv): Promise<Response> => {
  requireMethod(request, ['GET']);
  const releases = (await loadEsp32Entries(env)).map((entry, index) => (
    esp32ReleaseResponse(request, entry, index)
  ));
  return jsonResponse(request, env, { releases });
};

export const handleEsp32Download = async (request: Request, env: RuntimeEnv): Promise<Response> => {
  requireMethod(request, ['GET', 'HEAD']);
  return streamFirmwareObject(request, env, await findEsp32Entry(request, env));
};

export const handleStm32Releases = async (request: Request, env: RuntimeEnv): Promise<Response> => {
  requireMethod(request, ['GET']);
  const clientContract = readClientContract(request);
  const releases = (await loadStm32Entries(env, clientContract)).map((entry, index) => (
    stm32ReleaseResponse(request, entry, index)
  ));
  return jsonResponse(request, env, { releases });
};

export const handleStm32DownloadToken = async (request: Request, env: RuntimeEnv): Promise<Response> => {
  requireMethod(request, ['POST']);
  if (env.STM32_ACCESS_MODE !== 'public') {
    throw new ApiError(403, 'stm32_updates_disabled', 'STM32 firmware API is disabled');
  }
  const body = await readLimitedJson(request);
  if (!isRecord(body)) throw new ApiError(400, 'invalid_request', 'Request body must be an object');
  const tagName = typeof body.tagName === 'string' ? body.tagName : '';
  const assetName = typeof body.assetName === 'string' ? body.assetName : '';
  const releaseTag = typeof body.releaseTag === 'string' ? body.releaseTag : tagName;
  const deviceId = readBoundIdentifier(request, 'X-ULSA-Device-Id') ||
    (typeof body.deviceId === 'string' ? body.deviceId.slice(0, 96) : '');
  const sessionId = readBoundIdentifier(request, 'X-ULSA-Session-Id') ||
    (typeof body.sessionId === 'string' ? body.sessionId.slice(0, 96) : '');
  if (!tagName || !assetName || !deviceId || !sessionId) {
    throw new ApiError(400, 'required_fields_missing', 'tagName, assetName, deviceId, and sessionId are required');
  }
  const clientContract = readClientContract(request);
  const entry = await findStm32Entry(env, clientContract, tagName, assetName, releaseTag);
  const ttl = Number(env.STM32_DOWNLOAD_TOKEN_TTL_SECONDS || 300);
  const issued = await createStm32DownloadToken({
    tagName: entry.tag,
    assetName: entry.assetName,
    deviceId,
    sessionId,
    releaseTag: entry.releaseTag,
    clientContract,
  }, env.STM32_DOWNLOAD_TOKEN_SECRET, ttl);
  return jsonResponse(request, env, {
    downloadUrl: `${origin(request)}/api/stm32-firmware/download?token=${encodeURIComponent(issued.token)}`,
    downloadToken: issued.token,
    expiresAt: issued.expiresAt,
    expiresInSeconds: issued.expiresInSeconds,
  });
};

export const handleStm32Download = async (request: Request, env: RuntimeEnv): Promise<Response> => {
  requireMethod(request, ['GET', 'HEAD']);
  if (env.STM32_ACCESS_MODE !== 'public') {
    throw new ApiError(403, 'stm32_updates_disabled', 'STM32 firmware API is disabled');
  }
  const url = new URL(request.url);
  const token = request.headers.get('X-ULSA-STM32-Download-Token') || url.searchParams.get('token') || '';
  if (!token) throw new ApiError(401, 'download_token_required', 'STM32 firmware download token is required');
  const clientContract = readClientContract(request);
  const binding = {
    deviceId: readBoundIdentifier(request, 'X-ULSA-Device-Id'),
    sessionId: readBoundIdentifier(request, 'X-ULSA-Session-Id'),
    clientContract,
  };
  const payload = await verifyStm32DownloadToken(token, env.STM32_DOWNLOAD_TOKEN_SECRET, binding);
  const entry = await findStm32Entry(
    env,
    clientContract,
    payload.tagName,
    payload.assetName,
    payload.releaseTag,
  );
  console.log(JSON.stringify({
    event: 'stm32_firmware_download_audit',
    releaseTag: entry.releaseTag,
    result: 'authorized',
  }));
  return streamFirmwareObject(request, env, entry);
};
