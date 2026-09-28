import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const POLICY_PATH = join(ROOT, 'config', 'public_source_policy.json');
export const RELEASE_IDENTITY_PATH = join(ROOT, 'config', 'public_release_identity.json');
export const MANIFEST_NAME = 'public-source-manifest.json';

export const normalizePath = (value) => {
  const normalized = String(value).replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized.startsWith('/') || normalized.startsWith('../')) {
    throw new Error(`invalid public source path: ${value}`);
  }
  return normalized;
};

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const fileSha256 = (path) => sha256(readFileSync(path));

export const runGit = (args, cwd = ROOT) => execFileSync('git', args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

export const trackedAndUntrackedFiles = (root = ROOT) => {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root },
  );
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map(normalizePath)
    .filter((path) => existsSync(join(root, path)) && lstatSync(join(root, path)).isFile())
    .sort();
};

export const loadPolicy = (root = ROOT) => {
  const path = join(root, 'config', 'public_source_policy.json');
  const policy = readJson(path);
  const expectedKeys = [
    'assetFiles',
    'excludeFiles',
    'forbiddenContent',
    'generatedFiles',
    'includeFiles',
    'schemaVersion',
  ].sort();
  if (JSON.stringify(Object.keys(policy).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error('unsupported public source policy schema');
  }
  if (policy.schemaVersion !== 1) throw new Error('public source policy schemaVersion must be 1');
  const includeFiles = policy.includeFiles.map(normalizePath);
  const excludeFiles = policy.excludeFiles.map(normalizePath);
  const generatedFiles = Object.fromEntries(
    Object.entries(policy.generatedFiles).map(([output, source]) => [
      normalizePath(output),
      normalizePath(source),
    ]),
  );
  const assetFiles = policy.assetFiles.map(normalizePath);
  if (includeFiles.length !== new Set(includeFiles).size) throw new Error('duplicate includeFiles path');
  if (excludeFiles.length !== new Set(excludeFiles).size) throw new Error('duplicate excludeFiles path');
  const overlap = includeFiles.filter((path) => excludeFiles.includes(path));
  if (overlap.length) throw new Error(`public include/exclude overlap: ${overlap.join(', ')}`);
  const templatesNotExcluded = Object.values(generatedFiles).filter((path) => !excludeFiles.includes(path));
  if (templatesNotExcluded.length) {
    throw new Error(`generated templates must be excluded: ${templatesNotExcluded.join(', ')}`);
  }
  const unapprovedAssets = assetFiles.filter((path) => !includeFiles.includes(path));
  if (unapprovedAssets.length) throw new Error(`asset files must be included: ${unapprovedAssets.join(', ')}`);
  if (!policy.forbiddenContent.every((value) => typeof value === 'string' && value)) {
    throw new Error('forbiddenContent entries must be non-empty strings');
  }
  return { ...policy, includeFiles, excludeFiles, generatedFiles, assetFiles };
};

export const classifyPath = (path, policy) => {
  const normalized = normalizePath(path);
  if (policy.includeFiles.includes(normalized)) return 'public_candidate';
  if (policy.excludeFiles.includes(normalized)) return 'exclude';
  return 'review';
};

export const buildBoundaryReport = (paths, policy) => {
  const groups = { public_candidate: [], review: [], exclude: [] };
  for (const path of paths) groups[classifyPath(path, policy)].push(path);
  return {
    schemaVersion: 1,
    decision: 'separate-public-repository-history-free-snapshot',
    status: groups.review.length ? 'review_required' : 'approved',
    counts: Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, values.length])),
    generatedFiles: Object.keys(policy.generatedFiles).sort(),
    groups,
  };
};

export const gitDirty = (root = ROOT) => Boolean(runGit(
  ['status', '--porcelain', '--untracked-files=all'],
  root,
));

export const rejectSubmodules = (root = ROOT) => {
  const output = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: root });
  const submodules = output.toString('utf8').split('\0').filter(Boolean).flatMap((record) => {
    const [metadata, path = ''] = record.split('\t');
    return metadata.split(' ')[0] === '160000' ? [path] : [];
  });
  if (submodules.length) throw new Error(`public source contains submodules: ${submodules.join(', ')}`);
};

export const treeDigest = (files) => {
  const hash = createHash('sha256');
  for (const entry of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(entry.path);
    hash.update('\0');
    hash.update(String(entry.size));
    hash.update('\0');
    hash.update(entry.sha256);
    hash.update('\0');
  }
  return hash.digest('hex');
};

export const walkFiles = (root) => {
  const result = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else result.push(path);
    }
  };
  walk(root);
  return result.sort();
};

export const relativeTo = (root, path) => normalizePath(relative(root, path));

export const loadReleaseIdentity = (root = ROOT) => {
  const identity = readJson(join(root, 'config', 'public_release_identity.json'));
  const required = [
    'bleProtocolVersion',
    'esp32PublicReleaseTag',
    'esp32SourceSnapshotSha256',
    'iosMarketingVersion',
    'product',
    'publicRepository',
    'releaseTag',
    'schemaVersion',
    'version',
  ];
  if (JSON.stringify(Object.keys(identity).sort()) !== JSON.stringify(required.sort())) {
    throw new Error('unsupported public release identity schema');
  }
  if (identity.schemaVersion !== 1 || identity.product !== 'ulsa-evo-app') {
    throw new Error('public release identity product/schema mismatch');
  }
  const packageJson = readJson(join(root, 'package.json'));
  if (packageJson.version !== identity.version) throw new Error('package/public version mismatch');
  if (identity.iosMarketingVersion !== identity.version) {
    throw new Error('public iOS marketing version must match the package app version');
  }
  if (identity.releaseTag !== `ulsa-evo-app-v${identity.version}`) {
    throw new Error('public release tag must match app version');
  }
  const project = readFileSync(join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8');
  const versions = [...project.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((match) => match[1]);
  if (!versions.length || new Set(versions).size !== 1 || versions[0] !== identity.iosMarketingVersion) {
    throw new Error('Xcode/public iOS marketing version mismatch');
  }
  return identity;
};
