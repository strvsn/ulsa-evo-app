#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReleaseIdentity, validateReleaseIdentityPayload } from './release-identity.mjs';

export const PAGES_OUTPUT = 'build/cloudflare-pages';
export const PAGES_ROUTES = Object.freeze({ version: 1, include: ['/api/*'], exclude: [] });
export const PAGES_RELEASE_IDENTITY = 'release-identity.json';
const root = resolve(import.meta.dirname, '..');

export const regularFiles = (directory) => {
  const info = lstatSync(directory);
  if (info.isSymbolicLink()) throw new Error(`symlink is not allowed: ${directory}`);
  if (info.isFile()) return [directory];
  if (!info.isDirectory()) throw new Error(`unsupported artifact entry: ${directory}`);
  return readdirSync(directory).sort().flatMap((entry) => regularFiles(join(directory, entry)));
};

// Finder metadata is not an app asset. Never ship it, but keep rejecting all
// other hidden entries rather than silently hiding unexpected credentials.
const clientFiles = (directory) => regularFiles(directory).filter((file) => basename(file) !== '.DS_Store');

export const assertClientAssetPath = (path) => {
  const parts = path.replaceAll('\\', '/').split('/');
  if (parts.some((part) => part.startsWith('.') && part !== '.well-known') ||
      parts.some((part) => ['_worker.js', '_routes.json', PAGES_RELEASE_IDENTITY, 'node_modules', 'worker', 'functions'].includes(part)) ||
      /\.(?:p8|p12|pem|key|mobileprovision)$/i.test(path) || /(?:^|\/)wrangler\./.test(path)) {
    throw new Error(`server or private file must not be a client asset: ${path}`);
  }
};

const digestFiles = (base, files) => {
  const digest = createHash('sha256');
  for (const file of [...files].sort((left, right) => left.localeCompare(right))) {
    const path = relative(base, file).replaceAll('\\', '/');
    const payload = readFileSync(file);
    digest.update(`${path}\0${payload.length}\0`);
    digest.update(payload);
    digest.update('\0');
  }
  return digest.digest('hex');
};

const gitHead = (projectRoot) => execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: projectRoot,
  encoding: 'utf8',
}).trim();

const releaseMetadata = (projectRoot, files, options) => {
  const sourceSha = options.sourceSha || process.env.ULSA_RELEASE_SOURCE_SHA || gitHead(projectRoot);
  const releaseChannel = options.releaseChannel || process.env.ULSA_RELEASE_CHANNEL || 'development';
  const deploymentId = options.deploymentId || process.env.ULSA_RELEASE_DEPLOYMENT_ID || 'local';
  const stm32UpdaterEnabled = options.stm32UpdaterEnabled ??
    process.env.VITE_STM32_UPDATER_ENABLED === 'true';
  const appVersion = options.appVersion ||
    JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')).version;
  if (!options.sourceSha && process.env.ULSA_RELEASE_SOURCE_SHA && gitHead(projectRoot) !== sourceSha) {
    throw new Error('ULSA_RELEASE_SOURCE_SHA does not match the checked-out commit');
  }
  if ((releaseChannel === 'staging' || releaseChannel === 'production') && !stm32UpdaterEnabled) {
    throw new Error(`${releaseChannel} Pages builds must enable the public STM32 updater`);
  }
  return createReleaseIdentity({
    appVersion,
    sourceSha,
    clientAssetsSha256: digestFiles(join(projectRoot, 'dist'), files),
    stm32UpdaterEnabled,
    releaseChannel,
    deploymentId,
  });
};

export const buildPagesArtifact = async (projectRoot = root, options = {}) => {
  const client = join(projectRoot, 'dist');
  const output = join(projectRoot, PAGES_OUTPUT);
  const files = clientFiles(client);
  if (!files.includes(join(client, 'index.html'))) throw new Error('Build the Web app before packaging Pages');
  for (const file of files) assertClientAssetPath(relative(client, file));
  const identity = releaseMetadata(projectRoot, files, options);
  // Build into memory first. Never put the server entry into dist: Capacitor
  // copies dist into the iOS bundle, which must contain client assets only.
  const result = await build({
    absWorkingDir: projectRoot,
    entryPoints: ['worker/index.ts'],
    outfile: '_worker.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'inline',
    sourcemap: false,
    write: false,
    define: {
      'globalThis.__ULSA_RELEASE_IDENTITY__': JSON.stringify(identity),
    },
  });
  if (result.outputFiles.length !== 1) throw new Error('Pages requires one self-contained server bundle');
  if (existsSync(join(projectRoot, 'build')) && lstatSync(join(projectRoot, 'build')).isSymbolicLink()) {
    throw new Error('build must not be a symlink');
  }
  // This fixed path is generated output, never a caller-selected directory.
  if (existsSync(output)) regularFiles(output);
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const file of files) {
    const target = join(output, relative(client, file));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file, target);
  }
  writeFileSync(join(output, '_worker.js'), result.outputFiles[0].contents);
  writeFileSync(join(output, '_routes.json'), `${JSON.stringify(PAGES_ROUTES, null, 2)}\n`);
  writeFileSync(join(output, PAGES_RELEASE_IDENTITY), `${JSON.stringify(identity, null, 2)}\n`);
  return {
    output,
    clientFileCount: files.length,
    serverBytes: result.outputFiles[0].contents.length,
    identity,
  };
};

export const verifyPagesArtifact = (projectRoot = root) => {
  const client = join(projectRoot, 'dist');
  const output = join(projectRoot, PAGES_OUTPUT);
  const assets = clientFiles(client).map((file) => relative(client, file));
  for (const path of assets) {
    assertClientAssetPath(path);
    if (!readFileSync(join(client, path)).equals(readFileSync(join(output, path)))) {
      throw new Error(`Pages client asset differs from dist: ${path}`);
    }
  }
  const expected = [...assets, '_worker.js', '_routes.json', PAGES_RELEASE_IDENTITY].sort();
  const actual = regularFiles(output).map((file) => relative(output, file)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Unexpected file in Pages output');
  if (JSON.stringify(JSON.parse(readFileSync(join(output, '_routes.json'), 'utf8'))) !== JSON.stringify(PAGES_ROUTES)) {
    throw new Error('Pages must run the Function only for /api/*');
  }
  const serverBundle = readFileSync(join(output, '_worker.js'));
  if (serverBundle.length === 0) throw new Error('Pages server bundle is empty');
  const identity = JSON.parse(readFileSync(join(output, PAGES_RELEASE_IDENTITY), 'utf8'));
  const identityFailures = validateReleaseIdentityPayload(identity, {
    clientAssetsSha256: digestFiles(client, clientFiles(client)),
  });
  if (identityFailures.length > 0) {
    throw new Error(`Pages release identity is invalid: ${identityFailures.join('; ')}`);
  }
  if ((identity.releaseChannel === 'staging' || identity.releaseChannel === 'production') &&
      identity.stm32UpdaterEnabled !== true) {
    throw new Error('deployed Pages release identity must enable the public STM32 updater');
  }
  for (const marker of [identity.sourceSha, identity.clientAssetsSha256, identity.product]) {
    if (!serverBundle.includes(Buffer.from(marker))) {
      throw new Error(`Pages server bundle is not bound to release identity marker: ${marker}`);
    }
  }
  return { clientFileCount: assets.length, identity };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--verify')) {
    console.log('Pages artifact verified:', verifyPagesArtifact());
  } else {
    console.log('Pages artifact prepared:', await buildPagesArtifact());
    verifyPagesArtifact();
  }
}
