#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distRoot = join(projectRoot, 'dist');
const output = join(distRoot, 'sw.js');
const cachePrefix = 'ulsa-evo-shell-';

const walk = (directory) => readdirSync(directory).sort().flatMap((name) => {
  const file = join(directory, name);
  const info = lstatSync(file);
  if (info.isSymbolicLink()) throw new Error(`PWA asset is a symlink: ${file}`);
  if (info.isDirectory()) return walk(file);
  if (!info.isFile()) throw new Error(`Unsupported PWA asset: ${file}`);
  return [file];
});

export const createServiceWorker = (directory) => {
  const files = walk(directory).filter((file) => {
    const path = relative(directory, file).replaceAll('\\', '/');
    if (path === '.DS_Store' || path === 'sw.js') return false;
    if (!/^(?:index\.html|manifest\.json|(?:assets\/)?[a-zA-Z0-9_./-]+\.(?:js|css|png|svg|webp|ico))$/.test(path)
        || path.split('/').some((part) => part.startsWith('.'))
        || path.includes('..')) {
      throw new Error(`Unexpected PWA asset: ${path}`);
    }
    return true;
  });
  if (!files.some((file) => relative(directory, file) === 'index.html')) {
    throw new Error('PWA shell has no index.html');
  }
  const digest = createHash('sha256');
  const urls = files.map((file) => {
    const path = relative(directory, file).replaceAll('\\', '/');
    const payload = readFileSync(file);
    digest.update(`${path}\0${payload.length}\0`);
    digest.update(payload);
    return `/${path}`;
  });
  const name = `${cachePrefix}${digest.digest('hex').slice(0, 16)}`;
  return `// Generated from the verified Web build. Do not edit dist/sw.js.\n`
    + `const CACHE_NAME = ${JSON.stringify(name)};\n`
    + `const CACHE_PREFIX = ${JSON.stringify(cachePrefix)};\n`
    + `const PRECACHE_URLS = ${JSON.stringify(urls)};\n`
    + `const PRECACHE_PATHS = new Set(PRECACHE_URLS);\n`
    + `self.addEventListener('install', (event) => {\n`
    + `  event.waitUntil((async () => {\n`
    + `    const cache = await caches.open(CACHE_NAME);\n`
    + `    try { await cache.addAll(PRECACHE_URLS); }\n`
    + `    catch (error) { await caches.delete(CACHE_NAME); throw error; }\n`
    + `  })());\n`
    + `});\n`
    + `self.addEventListener('activate', (event) => {\n`
    + `  event.waitUntil((async () => {\n`
    + `    for (const name of await caches.keys()) {\n`
    + `      if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);\n`
    + `    }\n`
    + `  })());\n`
    + `});\n`
    + `self.addEventListener('fetch', (event) => {\n`
    + `  const request = event.request;\n`
    + `  const url = new URL(request.url);\n`
    + `  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;\n`
    + `  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/dashboard')) {\n`
    + `    event.respondWith((async () => {\n`
    + `      try {\n`
    + `        const response = await fetch(request);\n`
    + `        if (response.ok) return response;\n`
    + `      } catch { /* Fall back to the last complete app shell. */ }\n`
    + `      return (await (await caches.open(CACHE_NAME)).match('/index.html')) || Response.error();\n`
    + `    })());\n`
    + `  } else if (PRECACHE_PATHS.has(url.pathname)) {\n`
    + `    event.respondWith((async () => (await (await caches.open(CACHE_NAME)).match(request)) || fetch(request))());\n`
    + `  }\n`
    + `});\n`;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const expected = createServiceWorker(distRoot);
  if (process.argv.includes('--verify')) {
    if (readFileSync(output, 'utf8') !== expected) throw new Error('PWA Service Worker does not match dist assets');
    console.log('PWA Service Worker matches the complete Web build');
  } else {
    writeFileSync(output, expected);
    console.log('PWA Service Worker generated');
  }
}
