#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const roots = [
  'build/cloudflare-pages', 'worker', 'package.json', 'package-lock.json',
  'cloudflare/staging/wrangler.jsonc', 'cloudflare/production/wrangler.jsonc',
  'scripts/build-cloudflare-pages.mjs',
  'scripts/release-identity.mjs',
];

const walk = (path) => {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink()) throw new Error(`symlink is not allowed in deployment input: ${path}`);
  if (metadata.isFile()) return [path];
  if (!metadata.isDirectory()) return [];
  return readdirSync(path).sort().flatMap((name) => walk(join(path, name)));
};

const files = roots.flatMap((path) => {
  const absolute = join(root, path);
  if (!existsSync(absolute)) throw new Error(`deployment input is missing: ${path}`);
  return walk(absolute);
}).sort((left, right) => left.localeCompare(right));

const digest = createHash('sha256');
for (const file of files) {
  const path = relative(root, file).replaceAll('\\', '/');
  const payload = readFileSync(file);
  digest.update(`${path}\0${payload.length}\0`);
  digest.update(payload);
  digest.update('\0');
}

console.log(digest.digest('hex'));
