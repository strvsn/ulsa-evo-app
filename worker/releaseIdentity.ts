import type { RuntimeEnv } from './environment';
import { ApiError, jsonResponse, requireMethod } from './http';

export interface PublicReleaseIdentity {
  readonly schemaVersion: 1;
  readonly product: 'ulsa-evo-app';
  readonly appVersion: string;
  readonly sourceSha: string;
  readonly clientAssetsSha256: string;
  readonly stm32UpdaterEnabled: boolean;
  readonly releaseChannel: 'development' | 'test' | 'staging' | 'production';
  readonly deploymentId: string;
  readonly esp32CatalogPath: '/api/firmware/releases';
  readonly stm32CatalogPath: '/api/stm32-firmware/releases';
}

type ReleaseIdentityGlobal = typeof globalThis & {
  readonly __ULSA_RELEASE_IDENTITY__?: unknown;
};

const isPublicReleaseIdentity = (value: unknown): value is PublicReleaseIdentity => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const identity = value as Partial<PublicReleaseIdentity>;
  return identity.schemaVersion === 1 &&
    identity.product === 'ulsa-evo-app' &&
    typeof identity.appVersion === 'string' && /^\d+\.\d+\.\d+$/.test(identity.appVersion) &&
    typeof identity.sourceSha === 'string' && /^[0-9a-f]{40}$/.test(identity.sourceSha) &&
    typeof identity.clientAssetsSha256 === 'string' && /^[0-9a-f]{64}$/.test(identity.clientAssetsSha256) &&
    typeof identity.stm32UpdaterEnabled === 'boolean' &&
    (identity.releaseChannel === 'development' || identity.releaseChannel === 'test' ||
      identity.releaseChannel === 'staging' || identity.releaseChannel === 'production') &&
    typeof identity.deploymentId === 'string' && /^(?:[1-9]\d*|local|test)$/.test(identity.deploymentId) &&
    identity.esp32CatalogPath === '/api/firmware/releases' &&
    identity.stm32CatalogPath === '/api/stm32-firmware/releases';
};

export const handleReleaseIdentity = async (
  request: Request,
  env: RuntimeEnv,
): Promise<Response> => {
  requireMethod(request, ['GET']);
  const identity = (globalThis as ReleaseIdentityGlobal).__ULSA_RELEASE_IDENTITY__;
  if (!isPublicReleaseIdentity(identity)) {
    throw new ApiError(503, 'release_identity_unavailable', 'Release identity is unavailable');
  }
  return jsonResponse(request, env, identity);
};
