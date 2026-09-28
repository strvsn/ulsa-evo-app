#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(import.meta.dirname, '..');
const plainVarNames = ['ALLOWED_ORIGINS', 'ESP32_INCLUDE_PRERELEASES', 'STM32_ACCESS_MODE',
  'STM32_INCLUDE_PRERELEASES', 'STM32_DOWNLOAD_TOKEN_TTL_SECONDS'];

export const localPagesArgs = (root = projectRoot) => {
  const config = JSON.parse(readFileSync(join(root, 'cloudflare/staging/wrangler.jsonc'), 'utf8'));
  // Pages dev's nested runtime does not reliably retain config bindings in
  // Wrangler 4.129.0. Pass the documented local binding flags from the same
  // config. Never read or pass secrets through process arguments.
  if (Object.keys(config.vars).some((name) => !plainVarNames.includes(name))) {
    throw new Error('Review new Pages vars before exposing them as local CLI arguments');
  }
  const buckets = config.r2_buckets.map(({ binding, bucket_name, remote }) => {
    if (remote || binding !== 'FIRMWARE_BUCKET' || bucket_name !== 'your-evo-firmware-staging') {
      throw new Error('Pages development must use only the local staging bucket');
    }
    return ['--r2', `${binding}=${bucket_name}`];
  }).flat();
  return [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'pages', 'dev',
    '--cwd', join(root, 'cloudflare/staging'), ...buckets,
    ...Object.entries(config.vars).flatMap(([name, value]) => ['--binding', `${name}=${value}`])];
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const child = spawn(process.execPath, [...localPagesArgs(), ...process.argv.slice(2)], { stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
}
