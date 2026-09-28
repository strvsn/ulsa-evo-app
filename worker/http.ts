import type { RuntimeEnv } from './environment';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const ALLOWED_REQUEST_HEADERS = [
  'Accept',
  'Content-Type',
  'X-ULSA-Device-Id',
  'X-ULSA-Session-Id',
  'X-ULSA-STM32-Download-Token',
  'X-ULSA-STM32-Client-Contract',
].join(', ');

const EXPOSED_RESPONSE_HEADERS = [
  'Content-Disposition',
  'Content-Length',
  'Content-Range',
  'ETag',
].join(', ');

const allowedOrigins = (env: RuntimeEnv): Set<string> => new Set(
  env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
);

export const resolveAllowedOrigin = (request: Request, env: RuntimeEnv): string | null => {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = allowedOrigins(env);
  if (allowed.has('*')) return '*';
  if (origin === new URL(request.url).origin || allowed.has(origin)) return origin;
  return null;
};

export const assertAllowedOrigin = (request: Request, env: RuntimeEnv): void => {
  if (request.headers.has('Origin') && resolveAllowedOrigin(request, env) === null) {
    throw new ApiError(403, 'origin_denied', 'Origin is not allowed');
  }
};

export const apiHeaders = (
  request: Request,
  env: RuntimeEnv,
  contentType = 'application/json; charset=utf-8',
): Headers => {
  const headers = new Headers({
    'Access-Control-Allow-Headers': ALLOWED_REQUEST_HEADERS,
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Expose-Headers': EXPOSED_RESPONSE_HEADERS,
    'Cache-Control': 'private, no-store',
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  const origin = resolveAllowedOrigin(request, env);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    if (origin !== '*') headers.append('Vary', 'Origin');
  }
  return headers;
};

export const jsonResponse = (
  request: Request,
  env: RuntimeEnv,
  body: unknown,
  status = 200,
): Response => new Response(status === 204 ? null : JSON.stringify(body), {
  status,
  headers: apiHeaders(request, env),
});

export const errorResponse = (request: Request, env: RuntimeEnv, error: unknown): Response => {
  if (error instanceof ApiError) {
    return jsonResponse(request, env, { error: error.message, code: error.code }, error.status);
  }
  return jsonResponse(request, env, {
    error: 'Firmware service is temporarily unavailable',
    code: 'service_unavailable',
  }, 502);
};

export const requireMethod = (request: Request, allowed: string[]): void => {
  if (!allowed.includes(request.method)) {
    throw new ApiError(405, 'method_not_allowed', 'Method not allowed');
  }
};

export const readClientContract = (request: Request): number => {
  const value = request.headers.get('X-ULSA-STM32-Client-Contract') || '';
  if (!/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
};

export const readBoundIdentifier = (request: Request, name: string): string => (
  (request.headers.get(name) || '').trim().slice(0, 96)
);

export const readLimitedJson = async (request: Request, limit = 4096): Promise<unknown> => {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(declared) && declared > limit) {
    throw new ApiError(413, 'request_too_large', 'Request body is too large');
  }
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > limit) throw new ApiError(413, 'request_too_large', 'Request body is too large');
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const payload = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(payload));
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body is not valid JSON');
  }
};
