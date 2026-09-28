#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { getPlatformProxy } from 'wrangler';
import { localPagesArgs, projectRoot } from './cloudflare-pages-dev.mjs';
import { PAGES_RELEASE_IDENTITY, verifyPagesArtifact } from './build-cloudflare-pages.mjs';

verifyPagesArtifact();
const scratch = mkdtempSync(join(tmpdir(), 'ulsa-pages-smoke-'));
const persist = join(scratch, 'state');
const bytes = new Uint8Array([10, 20, 30, 40]);
const hash = createHash('sha256').update(bytes).digest('hex');
const tag = 'esp32-fw-v1.0.0-r1';
const key = `esp32/${tag}/ulsa-evo-esp32-demo-firmware.bin`;
let proxy;
let child;
let output = '';
try {
  proxy = await getPlatformProxy({ configPath: join(projectRoot, 'cloudflare/staging/wrangler.jsonc'),
    // The CLI adds /v3 to --persist-to; getPlatformProxy expects the final path.
    persist: { path: join(persist, 'v3') }, remoteBindings: false });
  await proxy.env.FIRMWARE_BUCKET.put(key, bytes, { sha256: hash });
  await proxy.env.FIRMWARE_BUCKET.put('catalog/esp32.json', JSON.stringify({ schemaVersion: 1, releases: [{
    tag, title: 'Local test fixture', profile: 'demo', prerelease: true, publishedAt: '2026-09-05T00:00:00Z',
    size: bytes.length, sha256: hash, objectKey: key,
    releaseNotes: { ja: ['ローカル検証用の変更概要'], en: ['Local verification change summary'] },
  }] }));
  await proxy.env.FIRMWARE_BUCKET.put('catalog/stm32.json', JSON.stringify({ schemaVersion: 1, releases: [] }));
  await proxy.dispose();
  proxy = undefined;
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  child = spawn(process.execPath, [...localPagesArgs(), '--ip', '127.0.0.1', '--port', String(port),
    '--inspector-port', '0', '--persist-to', persist, '--show-interactive-dev-session=false'], {
    cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(scratch, 'wrangler.log') },
  });
  child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-12000); });
  child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-12000); });
  const base = `http://127.0.0.1:${port}`;
  const request = (path, options = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(5000) });
  let ready = false;
  for (let attempt = 0; attempt < 60 && child.exitCode === null; attempt++) {
    try { ready = (await request('/api/missing')).status === 404; } catch { /* Startup only. */ }
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, `Pages did not start: ${output}`);
  const index = readFileSync(join(projectRoot, 'dist/index.html'), 'utf8');
  for (const path of ['/', '/dashboard', '/_worker.js', '/_routes.json']) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.equal(await response.text(), index, `${path}: SPA, never server source`);
  }
  const assetPath = index.match(/src="(\/assets\/[^"<>]+\.js)"/)[1];
  const asset = await request(assetPath);
  assert.deepEqual(Buffer.from(await asset.arrayBuffer()), readFileSync(join(projectRoot, 'dist', assetPath)));
  const expectedIdentity = JSON.parse(readFileSync(
    join(projectRoot, 'build/cloudflare-pages', PAGES_RELEASE_IDENTITY),
    'utf8',
  ));
  const identity = await request('/api/release-identity');
  assert.equal(identity.status, 200);
  assert.equal(identity.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await identity.json(), expectedIdentity);
  const releases = await request('/api/firmware/releases');
  assert.equal(releases.status, 200, `Local R2 catalog response: ${output}`);
  assert.ok((await releases.text()).includes(tag));
  const download = `/api/firmware/download?tag=${tag}`;
  const full = await request(download);
  assert.equal(full.status, 200);
  assert.equal(createHash('sha256').update(Buffer.from(await full.arrayBuffer())).digest('hex'), hash);
  const head = await request(download, { method: 'HEAD' });
  assert.equal(head.headers.get('content-length'), '4');
  assert.equal(await head.text(), '');
  const range = await request(download, { headers: { Range: 'bytes=1-2' } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), 'bytes 1-2/4');
  assert.deepEqual(new Uint8Array(await range.arrayBuffer()), bytes.slice(1, 3));
  assert.equal((await request(download, { headers: { 'If-None-Match': head.headers.get('etag') } })).status, 304);
  const options = await request(download, { method: 'OPTIONS', headers: { Origin: 'capacitor://localhost' } });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-origin'), '*');
  assert.equal((await request(download, { method: 'POST' })).status, 405);
  assert.equal((await request('/api/missing')).status, 404);
  console.log('Pages local smoke PASS: SPA, release identity, static bytes, server-source isolation, local R2 catalog, download SHA, HEAD, Range, ETag, CORS, 404/405');
} finally {
  await proxy?.dispose();
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit');
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
    await Promise.race([exited, delay(5000)]);
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
      await exited;
    }
  }
  rmSync(scratch, { recursive: true, force: true });
}
