const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const ESP32_TAG_PATTERN = /^esp32-fw-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-r[1-9]\d*$/;
const STM32_TAG_PATTERN = /^stm32-fw-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-r[1-9]\d*$/;
const STM32_RELEASE_TAG_PATTERN = /^stm32-(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-field\.[1-9]\d*$/;
const ESP32_OBJECT_PREFIX = 'esp32/';
const STM32_OBJECT_PREFIX = 'stm32/';
const CATALOG_MAX_BYTES = 256 * 1024;
const MAX_RELEASES = 50;

export const ESP32_CATALOG_KEY = 'catalog/esp32.json';
export const STM32_CATALOG_KEY = 'catalog/stm32.json';

export interface Esp32CatalogEntry {
  tag: string;
  title: string;
  profile: 'demo';
  prerelease: boolean;
  publishedAt: string;
  size: number;
  sha256: string;
  objectKey: string;
  releaseNotes?: ReleaseNotes;
}

export interface ReleaseNotes {
  ja: string[];
  en: string[];
}

export interface Stm32CatalogEntry {
  tag: string;
  title: string;
  assetName: string;
  target: 'ULSA_EVO_STM32_F411';
  version: string;
  releaseTag: string;
  buildProfile: 'field';
  rdpPolicy: 'preserve';
  requiresAdmin: false;
  versionScheme: 'semver';
  minClientContract: 3;
  prerelease: boolean;
  publishedAt: string;
  size: number;
  sha256: string;
  objectKey: string;
  releaseNotes?: ReleaseNotes;
}

export interface FirmwareCatalog<T> {
  schemaVersion: 1;
  releases: T[];
}

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const readString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CatalogError(`${field} must be a non-empty string`);
  }
  return value;
};

const readReleaseNotes = (value: unknown, field: string): ReleaseNotes => {
  if (!isRecord(value) || !Array.isArray(value.ja) || !Array.isArray(value.en) ||
      value.ja.length === 0 || value.en.length === 0) {
    throw new CatalogError(`${field} must contain non-empty ja and en arrays`);
  }
  const notes = { ja: value.ja, en: value.en } as const;
  for (const language of ['ja', 'en'] as const) {
    if (notes[language].some((note) => typeof note !== 'string' || note.trim() === '' || note.length > 2000)) {
      throw new CatalogError(`${field}.${language} contains an invalid summary`);
    }
  }
  return {
    ja: notes.ja.map((note) => note.trim()),
    en: notes.en.map((note) => note.trim()),
  };
};

const readBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== 'boolean') throw new CatalogError(`${field} must be boolean`);
  return value;
};

const readPositiveInteger = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new CatalogError(`${field} must be a positive integer`);
  }
  return Number(value);
};

const readSha256 = (value: unknown, field: string): string => {
  const sha256 = readString(value, field);
  if (!SHA256_PATTERN.test(sha256)) throw new CatalogError(`${field} must be lowercase SHA-256`);
  return sha256;
};

const readPublishedAt = (value: unknown, field: string): string => {
  const publishedAt = readString(value, field);
  if (Number.isNaN(Date.parse(publishedAt))) throw new CatalogError(`${field} must be an ISO date`);
  return publishedAt;
};

const readObjectKey = (value: unknown, field: string, prefix: string): string => {
  const objectKey = readString(value, field);
  if (!objectKey.startsWith(prefix) || objectKey.startsWith('/') || objectKey.includes('..')) {
    throw new CatalogError(`${field} is outside the approved prefix`);
  }
  return objectKey;
};

const readEnvelope = (value: unknown): Record<string, unknown>[] => {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.releases)) {
    throw new CatalogError('catalog must use schemaVersion 1 with a releases array');
  }
  if (value.releases.length > MAX_RELEASES) throw new CatalogError('catalog has too many releases');
  return value.releases.map((release, index) => {
    if (!isRecord(release)) throw new CatalogError(`releases[${index}] must be an object`);
    return release;
  });
};

const requireExactFields = (
  value: Record<string, unknown>,
  expected: readonly string[],
  field: string,
): void => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((name, index) => name !== wanted[index])) {
    throw new CatalogError(`${field} fields are incomplete or unexpected`);
  }
};

export const parseEsp32Catalog = (value: unknown): FirmwareCatalog<Esp32CatalogEntry> => ({
  schemaVersion: 1,
  releases: readEnvelope(value).map((entry, index) => {
    const prefix = `releases[${index}]`;
    const hasReleaseNotes = Object.prototype.hasOwnProperty.call(entry, 'releaseNotes');
    requireExactFields(entry, [
      'tag', 'title', 'profile', 'prerelease', 'publishedAt', 'size', 'sha256', 'objectKey',
      ...(hasReleaseNotes ? ['releaseNotes'] : []),
    ], prefix);
    if (entry.profile !== 'demo') throw new CatalogError(`${prefix}.profile must be demo`);
    const tag = readString(entry.tag, `${prefix}.tag`);
    if (!ESP32_TAG_PATTERN.test(tag)) throw new CatalogError(`${prefix}.tag is not canonical`);
    const objectKey = readObjectKey(entry.objectKey, `${prefix}.objectKey`, ESP32_OBJECT_PREFIX);
    if (objectKey !== `esp32/${tag}/ulsa-evo-esp32-demo-firmware.bin`) {
      throw new CatalogError(`${prefix}.objectKey is not the canonical Demo artifact`);
    }
    return {
      tag,
      title: readString(entry.title, `${prefix}.title`),
      profile: 'demo',
      prerelease: readBoolean(entry.prerelease, `${prefix}.prerelease`),
      publishedAt: readPublishedAt(entry.publishedAt, `${prefix}.publishedAt`),
      size: readPositiveInteger(entry.size, `${prefix}.size`),
      sha256: readSha256(entry.sha256, `${prefix}.sha256`),
      objectKey,
      ...(hasReleaseNotes ? {
        releaseNotes: readReleaseNotes(entry.releaseNotes, `${prefix}.releaseNotes`),
      } : {}),
    };
  }),
});

export const parseStm32Catalog = (value: unknown): FirmwareCatalog<Stm32CatalogEntry> => ({
  schemaVersion: 1,
  releases: readEnvelope(value).map((entry, index) => {
    const prefix = `releases[${index}]`;
    const hasReleaseNotes = Object.prototype.hasOwnProperty.call(entry, 'releaseNotes');
    requireExactFields(entry, [
      'tag', 'title', 'assetName', 'target', 'version', 'releaseTag', 'buildProfile',
      'rdpPolicy', 'requiresAdmin', 'versionScheme', 'minClientContract', 'prerelease',
      'publishedAt', 'size', 'sha256', 'objectKey',
      ...(hasReleaseNotes ? ['releaseNotes'] : []),
    ], prefix);
    const version = readString(entry.version, `${prefix}.version`);
    const assetName = readString(entry.assetName, `${prefix}.assetName`);
    const tag = readString(entry.tag, `${prefix}.tag`);
    const releaseTag = readString(entry.releaseTag, `${prefix}.releaseTag`);
    if (entry.target !== 'ULSA_EVO_STM32_F411') throw new CatalogError(`${prefix}.target must be F411`);
    if (!SEMVER_PATTERN.test(version)) throw new CatalogError(`${prefix}.version must be SemVer`);
    if (!STM32_TAG_PATTERN.test(tag)) throw new CatalogError(`${prefix}.tag is not canonical`);
    if (!STM32_RELEASE_TAG_PATTERN.test(releaseTag)) {
      throw new CatalogError(`${prefix}.releaseTag is not canonical`);
    }
    if (assetName !== `ULSA_EVO_STM32_F411-${version}-${releaseTag}-field-preserve.ulsa-stm32pkg`) {
      throw new CatalogError(`${prefix}.assetName is not canonical`);
    }
    if (entry.buildProfile !== 'field' || entry.rdpPolicy !== 'preserve') {
      throw new CatalogError(`${prefix} must use field/preserve`);
    }
    if (entry.requiresAdmin !== false || entry.versionScheme !== 'semver' || entry.minClientContract !== 3) {
      throw new CatalogError(`${prefix} must use the public contract 3 metadata`);
    }
    const objectKey = readObjectKey(entry.objectKey, `${prefix}.objectKey`, STM32_OBJECT_PREFIX);
    if (objectKey !== `stm32/${tag}/f411/${assetName}`) {
      throw new CatalogError(`${prefix}.objectKey is not the canonical F411 package`);
    }
    return {
      tag,
      title: readString(entry.title, `${prefix}.title`),
      assetName,
      target: 'ULSA_EVO_STM32_F411',
      version,
      releaseTag,
      buildProfile: 'field',
      rdpPolicy: 'preserve',
      requiresAdmin: false,
      versionScheme: 'semver',
      minClientContract: 3,
      prerelease: readBoolean(entry.prerelease, `${prefix}.prerelease`),
      publishedAt: readPublishedAt(entry.publishedAt, `${prefix}.publishedAt`),
      size: readPositiveInteger(entry.size, `${prefix}.size`),
      sha256: readSha256(entry.sha256, `${prefix}.sha256`),
      objectKey,
      ...(hasReleaseNotes ? {
        releaseNotes: readReleaseNotes(entry.releaseNotes, `${prefix}.releaseNotes`),
      } : {}),
    };
  }),
});

export const loadCatalog = async <T>(
  bucket: R2Bucket,
  key: string,
  parser: (value: unknown) => FirmwareCatalog<T>,
): Promise<FirmwareCatalog<T>> => {
  const object = await bucket.get(key);
  if (!object) throw new CatalogError('catalog is missing');
  if (object.size > CATALOG_MAX_BYTES) throw new CatalogError('catalog is too large');
  try {
    return parser(JSON.parse(await object.text()));
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    throw new CatalogError('catalog is not valid JSON');
  }
};
