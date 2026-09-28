import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createServiceWorker } from './build-pwa-service-worker.mjs';

const fixture = async (run) => {
  const directory = mkdtempSync(join(tmpdir(), 'ulsa-pwa-test-'));
  try {
    mkdirSync(join(directory, 'assets'));
    writeFileSync(join(directory, 'index.html'), '<main>EVO APP</main>');
    writeFileSync(join(directory, 'assets', 'index-abc.js'), 'console.log("ULSA")');
    writeFileSync(join(directory, 'manifest.json'), '{"name":"EVO APP"}');
    return await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test('precache is deterministic, complete, and tied to bytes', () => fixture((directory) => {
  const first = createServiceWorker(directory);
  assert.equal(first, createServiceWorker(directory));
  assert.match(first, /\/index\.html/);
  assert.match(first, /\/assets\/index-abc\.js/);
  assert.match(first, /\/manifest\.json/);
  assert.doesNotMatch(first, /\/api\/firmware/);
  writeFileSync(join(directory, 'assets', 'index-abc.js'), 'console.log("CHANGED")');
  assert.notEqual(first, createServiceWorker(directory));
}));

test('unexpected files are rejected rather than published in an offline cache', () => fixture((directory) => {
  writeFileSync(join(directory, 'secret.pem'), 'private');
  assert.throws(() => createServiceWorker(directory), /Unexpected PWA asset/);
}));

test('offline navigation opens the cached shell; API and writes are never intercepted', async () => fixture(async (directory) => {
  const handlers = new Map();
  const cacheEntries = new Map();
  let networkCalls = 0;
  const cache = {
    async addAll(urls) {
      for (const url of urls) cacheEntries.set(url, { body: readFileSync(join(directory, url.slice(1)), 'utf8') });
    },
    async match(request) {
      const url = typeof request === 'string' ? request : new URL(request.url).pathname;
      return cacheEntries.get(url);
    },
  };
  const context = {
    self: {
      location: { origin: 'https://app.example' },
      addEventListener(type, handler) { handlers.set(type, handler); },
    },
    caches: {
      async open() { return cache; },
      async keys() { return []; },
      async delete() { return true; },
    },
    URL,
    Response,
    Set,
    async fetch() { networkCalls += 1; throw new Error('offline'); },
  };
  vm.runInNewContext(createServiceWorker(directory), context);
  let install;
  handlers.get('install')({ waitUntil(promise) { install = promise; } });
  await install;
  assert.ok(cacheEntries.has('/index.html'));

  const request = (path, method = 'GET', mode = 'navigate') => {
    let result;
    handlers.get('fetch')({
      request: { url: `https://app.example${path}`, method, mode },
      respondWith(promise) { result = promise; },
    });
    return result;
  };
  assert.equal((await request('/dashboard')).body, '<main>EVO APP</main>');
  assert.equal(networkCalls, 1);
  assert.equal(request('/api/firmware/releases'), undefined);
  assert.equal(request('/api/stm32-firmware/download', 'POST'), undefined);
  assert.equal(request('/other-page'), undefined);
  assert.equal((await request('/assets/index-abc.js', 'GET', 'same-origin')).body, 'console.log("ULSA")');
}));
