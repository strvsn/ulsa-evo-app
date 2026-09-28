#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, treeDigest, walkFiles } from './common.mjs';
import { validatePublicPayload } from './secret-scan.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestName = 'public-source-manifest.json';
const required = [
  'README.md', 'LICENSE', 'ASSET_LICENSE.md', 'THIRD_PARTY_NOTICES.md',
  'THIRD_PARTY_LICENSES.txt', 'package.json', 'package-lock.json',
  'src', 'ios/App/App.xcodeproj/project.pbxproj', manifestName,
  'worker/index.ts', 'worker/index.test.ts', 'worker/releaseIdentity.ts', 'wrangler.jsonc',
  'worker-configuration.d.ts', 'tsconfig.worker.json', 'vitest.worker.config.ts',
  'cloudflare/staging/wrangler.jsonc', 'cloudflare/production/wrangler.jsonc',
  'scripts/build-cloudflare-pages.mjs', 'scripts/release-identity.mjs',
  'scripts/build-pwa-service-worker.mjs', 'scripts/pwa-offline.node-test.mjs',
  'scripts/release-identity.node-test.mjs', 'scripts/verify-live-release-identity.mjs',
  'scripts/cloudflare-pages-dev.mjs', 'scripts/cloudflare-pages-smoke.mjs',
  'contracts/ulsa-evo-ble-contract.json', 'sbom/runtime.cdx.json',
  'sbom/development.cdx.json',
];
const forbiddenPrefixes = [
  'api/', 'public_templates/', 'config/public_', 'docs/app-store/', 'data/',
  '.testflight-receipts/', '.public-source-receipts/', '.cert/',
];
const forbiddenNames = new Set([
  'AGENTS.md', '.env.testflight', 'docs/RELEASE_READINESS_AUDIT.md',
  'docs/OPEN_SOURCE_SNAPSHOT_TODO.md', 'docs/PUBLIC_RELEASE_REPOSITORY_SEPARATION.md',
  'scripts/testflight-upload.mjs', 'scripts/testflight-entry.mjs',
]);
const generatedPrefixes = [
  '.git/', 'node_modules/', 'dist/', 'build/', 'coverage/',
  '.wrangler/', 'cloudflare/staging/.wrangler/', 'cloudflare/production/.wrangler/',
  'cypress/screenshots/', 'cypress/videos/',
  'ios/App/build/', 'ios/App/Pods/', 'ios/App/output/', 'ios/App/App/public/',
  'ios/DerivedData/', 'ios/xcuserdata/', 'ios/capacitor-cordova-ios-plugins/',
];
const generatedFiles = new Set([
  'ios/App/App/capacitor.config.json',
  'ios/App/App/config.xml',
]);
const publicScripts = new Set([
  'dev', 'dev:host', 'dev:https', 'build', 'build:release-web', 'preview', 'test.e2e', 'test.unit',
  'lint', 'verify:docs', 'verify:ios-assets', 'verify:pwa-offline', 'verify:wind-rose-parity',
  'verify:public-source', 'cap:sync:ios', 'sync:ios', 'verify', 'build:ios',
  'worker:types', 'worker:types:check', 'worker:typecheck', 'worker:test',
  'worker:dry-run', 'worker:verify', 'cloudflare:deployment-digest',
  'pages:package', 'pages:package:release', 'pages:verify', 'pages:dev', 'pages:smoke',
]);

const fail = (message) => { throw new Error(message); };
const rel = (path) => relative(root, path).replaceAll('\\', '/');
const parseJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));

export const verifyPublicSnapshot = (snapshotRoot = root) => {
  for (const path of required) {
    if (!existsSync(join(snapshotRoot, path))) fail(`required public source path is missing: ${path}`);
  }
  const files = walkFiles(snapshotRoot)
    .filter((path) => !generatedFiles.has(relFrom(snapshotRoot, path)))
    .filter((path) => !generatedPrefixes.some((prefix) => relFrom(snapshotRoot, path).startsWith(prefix)));
  for (const path of files) {
    const pathRelative = relFrom(snapshotRoot, path);
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`public tree contains a non-regular file: ${pathRelative}`);
    const isPrivateEnvironmentFile = pathRelative === '.env' ||
      pathRelative === '.dev.vars' ||
      (pathRelative.startsWith('.env.') && pathRelative !== '.env.example');
    if (forbiddenNames.has(pathRelative) || forbiddenPrefixes.some((prefix) => pathRelative.startsWith(prefix)) ||
        isPrivateEnvironmentFile) {
      fail(`private path escaped into public snapshot: ${pathRelative}`);
    }
    validatePublicPayload(pathRelative, readFileSync(path), [
      ['APP_STORE_CONNECT', 'API_KEY_PATH='].join('_'),
      ['CLOUDFLARE', 'API_TOKEN='].join('_'),
      ['STM32_FIRMWARE', 'DOWNLOAD_TOKEN_SECRET='].join('_'),
      ['VITE_STM32', 'FIRMWARE_ADMIN_TOKEN='].join('_'),
    ]);
  }

  const manifest = JSON.parse(readFileSync(join(snapshotRoot, manifestName), 'utf8'));
  if (manifest.schemaVersion !== 1 || !['release', 'preview-unbound'].includes(manifest.status)) {
    fail('unsupported public source manifest');
  }
  const actual = files
    .filter((path) => relFrom(snapshotRoot, path) !== manifestName)
    .map((path) => {
      const payload = readFileSync(path);
      return { path: relFrom(snapshotRoot, path), size: payload.length, sha256: sha256(payload) };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) fail('public manifest file inventory/hash mismatch');
  if (treeDigest(actual) !== manifest.sourceSnapshotSha256) fail('public manifest tree SHA-256 mismatch');

  // A clean working directory can still contain ignored files that are absent
  // from the commit. Release verification must attest the committed snapshot,
  // not only the files currently visible in its checkout.
  if (existsSync(join(snapshotRoot, '.git'))) {
    let committedPaths;
    try {
      committedPaths = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', 'HEAD'], {
        cwd: snapshotRoot,
      }).toString('utf8').split('\0').filter(Boolean).sort();
    } catch {
      fail('public source Git checkout must have a readable HEAD before verification');
    }
    const manifestPaths = [...manifest.files.map(({ path }) => path), manifestName].sort();
    if (JSON.stringify(committedPaths) !== JSON.stringify(manifestPaths)) {
      fail('public manifest file inventory does not match the committed Git tree');
    }
  }

  const contractPath = 'contracts/ulsa-evo-ble-contract.json';
  const contractPayload = readFileSync(join(snapshotRoot, contractPath));
  const contract = JSON.parse(contractPayload.toString('utf8'));
  if (contract.schemaVersion !== 1 || contract.name !== 'ulsa-evo-ble' || contract.uuids.length < 20) {
    fail('public BLE contract is incomplete');
  }
  if (contract.uuids.some(({ name, uuid }) => name.startsWith('PRIVATE_') || !/^[0-9a-f-]{36}$/.test(uuid))) {
    fail('public BLE contract contains invalid/private UUIDs');
  }
  if (manifest.contracts?.length !== 1 || manifest.contracts[0].sha256 !== sha256(contractPayload)) {
    fail('public BLE contract manifest binding mismatch');
  }
  if (manifest.status === 'release' && (!contract.esp32PublicReleaseTag || !/^[0-9a-f]{64}$/.test(contract.esp32SourceSnapshotSha256))) {
    fail('release manifest is not bound to a public ESP32 snapshot');
  }

  const packageJson = JSON.parse(readFileSync(join(snapshotRoot, 'package.json'), 'utf8'));
  const packageLockJson = JSON.parse(readFileSync(join(snapshotRoot, 'package-lock.json'), 'utf8'));
  if (packageJson.license !== 'MIT' || packageJson.repository?.url !== 'https://github.com/strvsn/ulsa-evo-app.git') {
    fail('public package identity/license mismatch');
  }
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(packageJson.version)
      || packageLockJson.version !== packageJson.version
      || packageLockJson.packages?.['']?.version !== packageJson.version) {
    fail('public package and lockfile must share one MAJOR.MINOR.PATCH app version');
  }
  const project = readFileSync(join(snapshotRoot, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  const marketingVersions = [...project.matchAll(/\bMARKETING_VERSION\s*=\s*([^;]+);/g)]
    .map((match) => match[1].trim().replace(/^"|"$/g, ''));
  if (marketingVersions.length !== 2 || marketingVersions.some((version) => version !== packageJson.version)) {
    fail('public iOS Debug/Release MARKETING_VERSION must match package.json');
  }
  const scriptNames = Object.keys(packageJson.scripts ?? {});
  if (scriptNames.some((name) => !publicScripts.has(name)) || [...publicScripts].some((name) => !scriptNames.includes(name))) {
    fail('public package scripts are not the approved set');
  }
  if (JSON.stringify(packageJson.scripts).match(/testflight|public:/i)) fail('private workflow leaked into public package scripts');

  for (const sbomPath of ['sbom/runtime.cdx.json', 'sbom/development.cdx.json']) {
    const sbom = JSON.parse(readFileSync(join(snapshotRoot, sbomPath), 'utf8'));
    if (sbom.bomFormat !== 'CycloneDX' || sbom.specVersion !== '1.5' || !/^urn:uuid:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(sbom.serialNumber)) {
      fail(`invalid CycloneDX document: ${sbomPath}`);
    }
    if (!sbom.components?.length || sbom.components.some((component) => !component.licenses?.length)) {
      fail(`incomplete dependency license data: ${sbomPath}`);
    }
  }
  const assetLicense = readFileSync(join(snapshotRoot, 'ASSET_LICENSE.md'), 'utf8');
  for (const asset of manifest.files.map(({ path }) => path).filter((path) => /(?:logo|favicon|product|AppIcon|Splash|assets\/icon).+\.png$/i.test(path))) {
    if (!assetLicense.includes(`\`${asset}\``)) fail(`asset is absent from ASSET_LICENSE.md: ${asset}`);
  }
  return { manifest, fileCount: actual.length };
};

const relFrom = (base, path) => relative(base, path).replaceAll('\\', '/');

const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyPublicSnapshot(root);
    if (process.argv.includes('--build-web')) {
      run('npm', ['ci']);
      run('npm', ['run', 'verify']);
    }
    if (process.argv.includes('--build-ios')) {
      if (process.platform !== 'darwin') fail('--build-ios requires macOS');
      run('npm', ['ci']);
      run('npm', ['run', 'build:ios']);
    }
    console.log(`Public source verified: status=${result.manifest.status} files=${result.fileCount} sha256=${result.manifest.sourceSnapshotSha256}`);
  } catch (error) {
    console.error(`Public source verification failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
