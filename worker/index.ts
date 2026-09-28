import { CatalogError } from './catalog';
import type { RuntimeEnv } from './environment';
import { ApiError, assertAllowedOrigin, errorResponse, jsonResponse } from './http';
import { handleReleaseIdentity } from './releaseIdentity';
import {
  handleEsp32Download,
  handleEsp32Releases,
  handleStm32Download,
  handleStm32DownloadToken,
  handleStm32Releases,
} from './routes';

type ApiHandler = (request: Request, env: RuntimeEnv) => Promise<Response>;

const routes: Readonly<Record<string, ApiHandler>> = Object.freeze({
  '/api/release-identity': handleReleaseIdentity,
  '/api/firmware/releases': handleEsp32Releases,
  '/api/firmware/download': handleEsp32Download,
  '/api/stm32-firmware/releases': handleStm32Releases,
  '/api/stm32-firmware/download-token': handleStm32DownloadToken,
  '/api/stm32-firmware/download': handleStm32Download,
});

const handleApiRequest = async (request: Request, env: RuntimeEnv): Promise<Response> => {
  assertAllowedOrigin(request, env);
  if (request.method === 'OPTIONS') return jsonResponse(request, env, null, 204);
  const handler = routes[new URL(request.url).pathname];
  if (!handler) throw new ApiError(404, 'route_not_found', 'API route was not found');
  return await handler(request, env);
};

export default {
  async fetch(request: Request, env: RuntimeEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handleApiRequest(request, env);
    } catch (error) {
      if (error instanceof CatalogError) {
        console.error(JSON.stringify({ event: 'firmware_catalog_error', path, code: error.name }));
        return errorResponse(
          request,
          env,
          new ApiError(502, 'catalog_invalid', 'Firmware catalog is unavailable'),
        );
      }
      if (!(error instanceof ApiError)) {
        console.error(JSON.stringify({ event: 'firmware_api_error', path, code: 'unhandled' }));
      }
      return errorResponse(request, env, error);
    }
  },
} satisfies ExportedHandler<RuntimeEnv>;
