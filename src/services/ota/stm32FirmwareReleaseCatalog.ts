import { STM32_UPDATE_CONTRACT_VERSION } from './stm32FirmwareVersion';
import type { FirmwareReleaseNotes } from './firmwareReleaseCatalog';

export interface Stm32FirmwareReleaseOption {
  id: string;
  tagName: string;
  title: string;
  publishedAt: string;
  assetName: string;
  target: string;
  version: string;
  releaseTag: string;
  buildProfile: 'debug' | 'field' | 'production';
  rdpPolicy: 'none' | 'preserve' | 'enable_rdp1';
  requiresAdmin: boolean;
  size: number;
  packageSha256: string;
  downloadUrl: string;
  downloadTokenUrl: string;
  latest: boolean;
  versionScheme?: 'calver' | 'semver';
  minClientContract?: number;
  prerelease?: boolean;
  releaseNotes?: FirmwareReleaseNotes;
}

interface Stm32FirmwareProxyRelease {
  id: string | number;
  tagName: string;
  title: string;
  publishedAt: string;
  assetName: string;
  target: string;
  version: string;
  releaseTag: string;
  buildProfile: 'debug' | 'field' | 'production';
  rdpPolicy: 'none' | 'preserve' | 'enable_rdp1';
  requiresAdmin: boolean;
  size: number;
  packageSha256?: string;
  downloadUrl: string;
  downloadTokenUrl?: string;
  latest?: boolean;
  versionScheme?: 'calver' | 'semver';
  minClientContract?: number;
  prerelease?: boolean;
  releaseNotes?: FirmwareReleaseNotes;
}

interface Stm32FirmwareProxyResponse {
  releases: Stm32FirmwareProxyRelease[];
}

interface Stm32FirmwareDownloadTokenResponse {
  downloadUrl: string;
  downloadToken?: string;
  expiresAt: number;
  expiresInSeconds: number;
}

const DEFAULT_RELEASES_API_URL = '/api/stm32-firmware/releases';
const DEFAULT_DOWNLOAD_TOKEN_API_URL = '/api/stm32-firmware/download-token';
const STM32_PACKAGE_EXTENSION = '.ulsa-stm32pkg';
const STM32_FIRMWARE_CLIENT_CONTRACT = STM32_UPDATE_CONTRACT_VERSION;

const getReleasesApiUrl = (): string => {
  const overrideUrl = import.meta.env.VITE_STM32_FIRMWARE_RELEASES_URL;
  return overrideUrl || DEFAULT_RELEASES_API_URL;
};

const buildStm32FirmwareApiHeaders = (accept: string): Record<string, string> => ({
  Accept: accept,
  'X-ULSA-STM32-Client-Contract': String(STM32_FIRMWARE_CLIENT_CONTRACT),
});

const createEphemeralDownloadId = (kind: 'client' | 'session'): string => {
  if (globalThis.crypto?.randomUUID) return `stm32-${kind}-${globalThis.crypto.randomUUID()}`;
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const randomHex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `stm32-${kind}-${randomHex}`;
  }
  throw new Error('安全な一時download IDを生成できません');
};

export const getStm32FirmwareDownloadUrl = (downloadUrl: string, downloadToken?: string): string => {
  if (!downloadToken) return downloadUrl;
  const url = new URL(downloadUrl, globalThis.location?.origin || 'https://local.ulsa-evo');
  url.searchParams.delete('token');
  return url.toString();
};

export const formatStm32FirmwareReleaseLabel = (release: Stm32FirmwareReleaseOption): string => {
  const sizeKb = Math.ceil(release.size / 1024);
  const markers = [
    release.latest ? 'latest' : '',
    release.prerelease ? 'prerelease' : '',
  ].filter(Boolean);
  const suffix = markers.length > 0 ? ` / ${markers.join(' / ')}` : '';
  return `${release.target} v${release.version}${suffix} (${sizeKb} KB)`;
};

const normalizeProxyReleases = (
  payload: Stm32FirmwareProxyResponse
): Stm32FirmwareReleaseOption[] =>
  payload.releases.map((release, index) => ({
    id: String(release.id),
    tagName: release.tagName,
    title: release.title,
    publishedAt: release.publishedAt,
    assetName: release.assetName,
    target: release.target,
    version: release.version,
    releaseTag: release.releaseTag,
    buildProfile: release.buildProfile,
    rdpPolicy: release.rdpPolicy,
    requiresAdmin: release.requiresAdmin,
    size: release.size,
    packageSha256: release.packageSha256 || '',
    downloadUrl: release.downloadUrl,
    downloadTokenUrl: release.downloadTokenUrl || DEFAULT_DOWNLOAD_TOKEN_API_URL,
    latest: release.latest ?? index === 0,
    versionScheme: release.versionScheme,
    minClientContract: release.minClientContract,
    prerelease: release.prerelease === true,
    releaseNotes: release.releaseNotes,
  }));

export const fetchStm32FirmwareReleases = async (
  signal?: AbortSignal
): Promise<Stm32FirmwareReleaseOption[]> => {
  const releasesApiUrl = getReleasesApiUrl();
  const response = await fetch(releasesApiUrl, {
    cache: 'no-store',
    headers: buildStm32FirmwareApiHeaders('application/json'),
    signal,
  });

  if (!response.ok) {
    throw new Error(`STM32 firmware package release取得に失敗しました: HTTP ${response.status}`);
  }

  const releases = normalizeProxyReleases((await response.json()) as Stm32FirmwareProxyResponse);
  if (releases.length === 0) {
    throw new Error('STM32 firmware package releaseが見つかりません');
  }
  return releases;
};

export const downloadStm32FirmwarePackage = async (
  release: Stm32FirmwareReleaseOption,
  signal?: AbortSignal,
): Promise<File> => {
  // Worker field names are legacy API names. Both values are random per-download
  // correlation IDs, never a Node ID, BLE peripheral UUID, or hardware identity.
  const deviceId = createEphemeralDownloadId('client');
  const sessionId = createEphemeralDownloadId('session');
  const tokenHeaders = {
    ...buildStm32FirmwareApiHeaders('application/json'),
    'Content-Type': 'application/json',
    'X-ULSA-Device-Id': deviceId,
    'X-ULSA-Session-Id': sessionId,
  };
  const tokenResponse = await fetch(release.downloadTokenUrl, {
    method: 'POST',
    cache: 'no-store',
    headers: tokenHeaders,
    body: JSON.stringify({
      tagName: release.tagName,
      assetName: release.assetName,
      releaseTag: release.releaseTag,
      deviceId,
      sessionId,
    }),
    signal,
  });

  if (!tokenResponse.ok) {
    throw new Error(`STM32 firmware package download token取得に失敗しました: HTTP ${tokenResponse.status}`);
  }

  const tokenPayload = (await tokenResponse.json()) as Stm32FirmwareDownloadTokenResponse;
  const downloadUrl = getStm32FirmwareDownloadUrl(tokenPayload.downloadUrl, tokenPayload.downloadToken);
  const response = await fetch(downloadUrl, {
    cache: 'no-store',
    headers: {
      ...buildStm32FirmwareApiHeaders('application/octet-stream'),
      'X-ULSA-Device-Id': deviceId,
      'X-ULSA-Session-Id': sessionId,
      ...(tokenPayload.downloadToken ? { 'X-ULSA-STM32-Download-Token': tokenPayload.downloadToken } : {}),
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`STM32 firmware package取得に失敗しました: HTTP ${response.status}`);
  }

  const data = await response.arrayBuffer();
  const fileName = release.assetName.endsWith(STM32_PACKAGE_EXTENSION)
    ? release.assetName
    : `${release.target}-${release.version}${STM32_PACKAGE_EXTENSION}`;
  return new File([data], fileName, { type: 'application/octet-stream' });
};
