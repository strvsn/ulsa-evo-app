import type { Esp32CatalogEntry, Stm32CatalogEntry } from './catalog';
import type { RuntimeEnv } from './environment';
import { ApiError, apiHeaders } from './http';

type DownloadEntry = Esp32CatalogEntry | Stm32CatalogEntry;

interface ParsedRange {
  offset: number;
  length: number;
}

const parseRange = (value: string | null, size: number): ParsedRange | null => {
  if (!value) return null;
  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) {
    throw new ApiError(416, 'range_not_satisfiable', 'Requested range is not satisfiable');
  }
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) {
      throw new ApiError(416, 'range_not_satisfiable', 'Requested range is not satisfiable');
    }
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const offset = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(requestedEnd) ||
      offset < 0 || requestedEnd < offset || offset >= size) {
    throw new ApiError(416, 'range_not_satisfiable', 'Requested range is not satisfiable');
  }
  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1 };
};

const matchesEtag = (request: Request, etag: string): boolean => (
  (request.headers.get('If-None-Match') || '')
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === '*' || value === etag || value === `W/${etag}`)
);

const checksumHex = (value: ArrayBuffer): string => (
  [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
);

const verifyObjectMetadata = (object: R2Object, entry: DownloadEntry): void => {
  if (object.size !== entry.size) {
    throw new ApiError(502, 'artifact_size_mismatch', 'Firmware artifact failed integrity validation');
  }
  const storedSha256 = object.customMetadata?.sha256?.toLowerCase();
  if (storedSha256 && storedSha256 !== entry.sha256) {
    throw new ApiError(502, 'artifact_sha256_mismatch', 'Firmware artifact failed integrity validation');
  }
  if (object.checksums.sha256 && checksumHex(object.checksums.sha256) !== entry.sha256) {
    throw new ApiError(502, 'artifact_sha256_mismatch', 'Firmware artifact failed integrity validation');
  }
};

const artifactName = (entry: DownloadEntry): string => (
  'assetName' in entry
    ? entry.assetName
    : entry.objectKey.slice(entry.objectKey.lastIndexOf('/') + 1)
);

export const streamFirmwareObject = async (
  request: Request,
  env: RuntimeEnv,
  entry: DownloadEntry,
): Promise<Response> => {
  const metadata = await env.FIRMWARE_BUCKET.head(entry.objectKey);
  if (!metadata) throw new ApiError(502, 'artifact_missing', 'Firmware artifact is unavailable');
  verifyObjectMetadata(metadata, entry);

  const etag = `"${entry.sha256}"`;
  const headers = apiHeaders(request, env, 'application/octet-stream');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Content-Disposition', `attachment; filename="${artifactName(entry).replace(/["\r\n]/g, '')}"`);
  headers.set('ETag', etag);
  if (matchesEtag(request, etag)) return new Response(null, { status: 304, headers });

  let range: ParsedRange | null;
  try {
    range = parseRange(request.headers.get('Range'), metadata.size);
  } catch (error) {
    if (error instanceof ApiError && error.status === 416) {
      headers.set('Content-Range', `bytes */${metadata.size}`);
      return new Response(null, { status: 416, headers });
    }
    throw error;
  }
  const status = range ? 206 : 200;
  const responseLength = range?.length ?? metadata.size;
  headers.set('Content-Length', String(responseLength));
  if (range) {
    headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`);
  }
  if (request.method === 'HEAD') return new Response(null, { status, headers });

  const object = await env.FIRMWARE_BUCKET.get(entry.objectKey, range ? { range } : undefined);
  if (!object) throw new ApiError(502, 'artifact_missing', 'Firmware artifact is unavailable');
  verifyObjectMetadata(object, entry);
  return new Response(object.body, { status, headers });
};
