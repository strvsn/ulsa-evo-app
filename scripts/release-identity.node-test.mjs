import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createReleaseIdentity,
  probeReleaseIdentitySync,
  releaseIdentityOriginFromCatalogUrls,
  validateReleaseIdentityPayload,
} from './release-identity.mjs';

const identity = () => createReleaseIdentity({
  appVersion: '1.0.0',
  sourceSha: 'a'.repeat(40),
  clientAssetsSha256: 'b'.repeat(64),
  stm32UpdaterEnabled: true,
  releaseChannel: 'staging',
  deploymentId: '12345',
});

test('creates and strictly validates the public release identity', () => {
  const value = identity();
  assert.deepEqual(validateReleaseIdentityPayload(value, {
    sourceSha: 'a'.repeat(40),
    stm32UpdaterEnabled: true,
  }), []);
  assert.match(
    validateReleaseIdentityPayload({ ...value, sourceSha: 'c'.repeat(40) }, {
      sourceSha: 'a'.repeat(40),
    })[0],
    /does not match/,
  );
  assert.ok(validateReleaseIdentityPayload({ ...value, extra: true }).length > 0);
});

test('requires both firmware catalogs to share one HTTPS origin', () => {
  assert.deepEqual(releaseIdentityOriginFromCatalogUrls(
    'https://app.example/api/firmware/releases',
    'https://app.example/api/stm32-firmware/releases',
  ), { origin: 'https://app.example', error: '' });
  assert.match(releaseIdentityOriginFromCatalogUrls(
    'https://one.example/api/firmware/releases',
    'https://two.example/api/stm32-firmware/releases',
  ).error, /same/);
});

test('probes identity without accepting HTTP or schema mismatches', () => {
  const value = identity();
  const run = (_command, args) => ({
    status: 0,
    stdout: `${JSON.stringify(value)}\n__ULSA_RELEASE_IDENTITY_HTTP_STATUS__:200\n`,
    stderr: '',
    args,
  });
  const result = probeReleaseIdentitySync({
    origin: 'https://app.example',
    expected: value,
    run,
  });
  assert.deepEqual(result.failures, []);
  assert.equal(result.identity.sourceSha, value.sourceSha);

  const unavailable = probeReleaseIdentitySync({
    origin: 'https://app.example',
    run: () => ({ status: 0, stdout: '\n__ULSA_RELEASE_IDENTITY_HTTP_STATUS__:503\n', stderr: '' }),
  });
  assert.match(unavailable.failures[0], /HTTP 503/);
});
