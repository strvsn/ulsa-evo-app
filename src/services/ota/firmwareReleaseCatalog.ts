export interface FirmwareReleaseNotes {
  ja: string[];
  en: string[];
}

export interface Esp32FirmwareReleaseOption {
  id: string;
  tagName: string;
  title: string;
  publishedAt: string;
  assetName?: string;
  size: number;
  firmwareSha256?: string;
  downloadUrl: string;
  latest: boolean;
  prerelease?: boolean;
  releaseNotes?: FirmwareReleaseNotes;
}

interface FirmwareProxyRelease {
  id: string | number;
  tagName: string;
  title: string;
  publishedAt: string;
  assetName: string;
  size: number;
  firmwareSha256?: string;
  downloadUrl: string;
  latest?: boolean;
  prerelease?: boolean;
  releaseNotes?: FirmwareReleaseNotes;
}

interface FirmwareProxyResponse {
  releases: FirmwareProxyRelease[];
}

interface GitHubReleaseAsset {
  id: number;
  name: string;
  size: number;
  url: string;
  browser_download_url: string;
  digest?: string;
}

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  body?: string | null;
  assets: GitHubReleaseAsset[];
}

const DEFAULT_RELEASES_API_URL = '/api/firmware/releases';
const FIRMWARE_ASSET_NAME = 'firmware.bin';
const FIRMWARE_RELEASE_ASSET_NAMES = [
  'ulsa-evo-esp32-demo-firmware.bin',
  FIRMWARE_ASSET_NAME,
];

const getReleasesApiUrl = (): string => {
  const overrideUrl = import.meta.env.VITE_ESP32_FIRMWARE_RELEASES_URL;
  return overrideUrl || DEFAULT_RELEASES_API_URL;
};

const formatReleaseTitle = (release: GitHubRelease): string =>
  release.name?.trim() || release.tag_name;

const findFirmwareAsset = (release: GitHubRelease): GitHubReleaseAsset | undefined =>
  FIRMWARE_RELEASE_ASSET_NAMES
    .map((assetName) => release.assets.find((asset) => asset.name === assetName))
    .find((asset): asset is GitHubReleaseAsset => Boolean(asset));

const parseGitHubReleaseNotes = (body: string | null | undefined): FirmwareReleaseNotes | undefined => {
  if (!body) return undefined;
  const section = (heading: string): string[] => {
    const marker = `### ${heading}`;
    const start = body.indexOf(marker);
    if (start < 0) return [];
    const contentStart = body.indexOf('\n', start);
    if (contentStart < 0) return [];
    const nextHeading = body.indexOf('\n### ', contentStart + 1);
    const content = body.slice(contentStart + 1, nextHeading < 0 ? body.length : nextHeading);
    return content.split(/\r?\n/)
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim())
      .filter(Boolean);
  };
  const ja = section('日本語');
  const en = section('English');
  return ja.length > 0 && en.length > 0 ? { ja, en } : undefined;
};

export const formatFirmwareReleaseLabel = (release: Esp32FirmwareReleaseOption): string => {
  const sizeKb = Math.ceil(release.size / 1024);
  const markers = [
    release.latest ? 'latest' : '',
    release.prerelease ? 'prerelease' : '',
  ].filter(Boolean);
  const suffix = markers.length > 0 ? ` / ${markers.join(' / ')}` : '';
  const version = release.tagName.match(/v?(\d+\.\d+\.\d+)/)?.[1];
  const displayName = version ? `v${version}` : release.title;
  return `${displayName}${suffix} (${sizeKb} KB)`;
};

const normalizeProxyReleases = (payload: FirmwareProxyResponse): Esp32FirmwareReleaseOption[] =>
  payload.releases.map((release, index) => ({
    id: String(release.id),
    tagName: release.tagName,
    title: release.title,
    publishedAt: release.publishedAt,
    assetName: release.assetName,
    size: release.size,
    firmwareSha256: release.firmwareSha256 || '',
    downloadUrl: release.downloadUrl,
    prerelease: release.prerelease === true,
    latest: release.latest ?? index === 0,
    releaseNotes: release.releaseNotes,
  }));

const normalizeGitHubReleases = (releases: GitHubRelease[]): Esp32FirmwareReleaseOption[] =>
  releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => ({ release, asset: findFirmwareAsset(release) }))
    .filter((item): item is { release: GitHubRelease; asset: GitHubReleaseAsset } =>
      Boolean(item.asset)
    )
    .map(({ release, asset }, index) => ({
      id: String(release.id),
      tagName: release.tag_name,
      title: formatReleaseTitle(release),
      publishedAt: release.published_at || '',
      assetName: asset.name,
      size: asset.size,
      firmwareSha256: String(asset.digest || '').replace(/^sha256:/, '').toLowerCase(),
      downloadUrl: asset.browser_download_url || asset.url,
      prerelease: false,
      latest: index === 0,
      releaseNotes: parseGitHubReleaseNotes(release.body),
    }));

const normalizeReleasePayload = (payload: unknown): Esp32FirmwareReleaseOption[] => {
  const options = Array.isArray(payload)
    ? normalizeGitHubReleases(payload as GitHubRelease[])
    : normalizeProxyReleases(payload as FirmwareProxyResponse);

  if (options.length === 0) {
    throw new Error('対応するESP32 OTA firmwareを含むReleaseが見つかりません');
  }

  return options;
};

export const fetchEsp32FirmwareReleases = async (
  signal?: AbortSignal
): Promise<Esp32FirmwareReleaseOption[]> => {
  const response = await fetch(getReleasesApiUrl(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`ESP32 firmware release取得に失敗しました: HTTP ${response.status}`);
  }

  return normalizeReleasePayload(await response.json());
};

export const downloadEsp32FirmwareRelease = async (
  release: Esp32FirmwareReleaseOption,
  signal?: AbortSignal
): Promise<File> => {
  const response = await fetch(release.downloadUrl, {
    cache: 'no-store',
    headers: { Accept: 'application/octet-stream' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`firmware.bin取得に失敗しました: HTTP ${response.status}`);
  }

  const data = await response.arrayBuffer();
  return new File([data], FIRMWARE_ASSET_NAME, { type: 'application/octet-stream' });
};
