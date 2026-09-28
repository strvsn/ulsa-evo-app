#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { probeReleaseIdentitySync, validateReleaseIdentityPayload } from './release-identity.mjs';

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name} is required`);
  return args[index + 1];
};
const origin = value('--origin');
const expectedPath = resolve(value('--expected-file'));
const timeoutSeconds = Number(args.includes('--timeout-seconds') ? value('--timeout-seconds') : '120');
if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 600) {
  throw new Error('--timeout-seconds must be an integer from 1 to 600');
}
const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
const expectedFailures = validateReleaseIdentityPayload(expected);
if (expectedFailures.length > 0) {
  throw new Error(`local release identity is invalid: ${expectedFailures.join('; ')}`);
}

const startedAt = Date.now();
let lastFailures = [];
while (Date.now() - startedAt < timeoutSeconds * 1000) {
  const result = probeReleaseIdentitySync({ origin, expected, timeoutSeconds: 10 });
  if (result.failures.length === 0) {
    console.log(`Live release identity verified: source=${expected.sourceSha} content=${expected.clientAssetsSha256} deployment=${expected.deploymentId}`);
    process.exit(0);
  }
  lastFailures = result.failures;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
}
throw new Error(`live release identity did not converge: ${lastFailures.join('; ')}`);
