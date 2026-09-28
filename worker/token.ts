import { ApiError } from './http';

export interface Stm32DownloadTokenPayload {
  v: 1;
  tagName: string;
  assetName: string;
  deviceId: string;
  sessionId: string;
  releaseTag: string;
  clientContract: number;
  exp: number;
  jti: string;
}

const encoder = new TextEncoder();

const toBase64Url = (value: Uint8Array): string => {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const fromBase64Url = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const importHmacKey = (secret: string): Promise<CryptoKey> => {
  if (secret.length < 32) throw new ApiError(500, 'token_secret_invalid', 'Download token service is not configured');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
};

export const createStm32DownloadToken = async (
  values: Omit<Stm32DownloadTokenPayload, 'v' | 'exp' | 'jti'>,
  secret: string,
  ttlSeconds: number,
  nowMs = Date.now(),
): Promise<{ token: string; expiresAt: number; expiresInSeconds: number }> => {
  const expiresInSeconds = Math.min(Math.max(Math.trunc(ttlSeconds), 1), 300);
  const payload: Stm32DownloadTokenPayload = {
    v: 1,
    ...values,
    exp: Math.floor(nowMs / 1000) + expiresInSeconds,
    jti: crypto.randomUUID(),
  };
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(encodedPayload));
  return {
    token: `v1.${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`,
    expiresAt: payload.exp,
    expiresInSeconds,
  };
};

const isPayload = (value: unknown): value is Stm32DownloadTokenPayload => {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  return payload.v === 1 &&
    typeof payload.tagName === 'string' && payload.tagName.length > 0 &&
    typeof payload.assetName === 'string' && payload.assetName.length > 0 &&
    typeof payload.deviceId === 'string' &&
    typeof payload.sessionId === 'string' &&
    typeof payload.releaseTag === 'string' &&
    Number.isSafeInteger(payload.clientContract) && Number(payload.clientContract) > 0 &&
    Number.isSafeInteger(payload.exp) &&
    typeof payload.jti === 'string' && payload.jti.length > 0;
};

export const verifyStm32DownloadToken = async (
  token: string,
  secret: string,
  binding: { deviceId: string; sessionId: string; clientContract: number },
  nowMs = Date.now(),
): Promise<Stm32DownloadTokenPayload> => {
  const [version, encodedPayload, encodedSignature, extra] = token.split('.');
  if (version !== 'v1' || !encodedPayload || !encodedSignature || extra) {
    throw new ApiError(401, 'download_token_invalid', 'STM32 firmware download token is invalid');
  }
  try {
    const key = await importHmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      new Uint8Array(fromBase64Url(encodedSignature)),
      encoder.encode(encodedPayload),
    );
    if (!valid) throw new Error('signature');
    const payload: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload)));
    if (!isPayload(payload)) throw new Error('payload');
    if (payload.exp <= Math.floor(nowMs / 1000)) {
      throw new ApiError(401, 'download_token_expired', 'STM32 firmware download token has expired');
    }
    if (payload.deviceId !== binding.deviceId || payload.sessionId !== binding.sessionId ||
        payload.clientContract !== binding.clientContract) {
      throw new ApiError(401, 'download_token_binding_mismatch', 'STM32 firmware download token binding does not match');
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'download_token_invalid', 'STM32 firmware download token is invalid');
  }
};
