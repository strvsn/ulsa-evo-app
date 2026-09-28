import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const webDir = 'dist';
const iosPublicDir = 'ios/App/App/public';
const allowedIosOnlyFiles = new Set(['cordova.js', 'cordova_plugins.js']);
const failures = [];

const webRoot = join(root, webDir);
const iosPublicRoot = join(root, iosPublicDir);

const toPosix = (value) => value.split(sep).join('/');

const collectFiles = (dir) => {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walk(path);
      } else {
        files.push(path);
      }
    }
  };
  walk(dir);
  return files.sort();
};

const hashFile = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

if (!existsSync(webRoot)) {
  failures.push(`${webDir} is missing. Run npm run build before syncing iOS assets.`);
}

if (!existsSync(iosPublicRoot)) {
  failures.push(`${iosPublicDir} is missing. Run npm run cap:sync:ios after npm run build.`);
}

if (failures.length === 0) {
  const webFiles = collectFiles(webRoot);
  const iosFiles = collectFiles(iosPublicRoot);
  const webRelFiles = new Set(webFiles.map((file) => toPosix(relative(webRoot, file))));

  for (const webFile of webFiles) {
    const relPath = toPosix(relative(webRoot, webFile));
    const iosFile = join(iosPublicRoot, relPath);
    if (!existsSync(iosFile)) {
      failures.push(`${iosPublicDir}/${relPath} is missing but ${webDir}/${relPath} exists.`);
      continue;
    }
    const webHash = hashFile(webFile);
    const iosHash = hashFile(iosFile);
    if (webHash !== iosHash) {
      failures.push(`${iosPublicDir}/${relPath} differs from ${webDir}/${relPath}.`);
    }
  }

  for (const iosFile of iosFiles) {
    const relPath = toPosix(relative(iosPublicRoot, iosFile));
    if (allowedIosOnlyFiles.has(relPath)) continue;
    if (!webRelFiles.has(relPath)) {
      failures.push(`${iosPublicDir}/${relPath} is stale or unexpected; it is not present in ${webDir}.`);
    }
  }
}

if (failures.length > 0) {
  console.error([
    'iOS web assets are not synchronized with the current Web build.',
    'Run: npm run cap:sync:ios',
    '',
    ...failures,
  ].join('\n'));
  process.exit(1);
}

console.log(`iOS web assets verified: ${webDir} matches ${iosPublicDir}`);
