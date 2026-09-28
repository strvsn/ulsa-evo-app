import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const derivedDataPath = mkdtempSync(join(tmpdir(), 'ulsa_evo_ios_app_verify_derived_data-'));
const builtAppPath = join(derivedDataPath, 'Build', 'Products', 'Debug-iphoneos', 'App.app');

const readPlistValue = (path, keyPath) => execFileSync(
  'plutil',
  ['-extract', keyPath, 'raw', '-o', '-', path],
  { encoding: 'utf8' },
).trim();

const assertPlistValue = (path, keyPath, expected) => {
  const actual = readPlistValue(path, keyPath);
  if (actual !== expected) {
    throw new Error(`${path} ${keyPath}=${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
  }
};

console.log(`[build:ios] Using fresh DerivedData: ${derivedDataPath}`);

try {
  execFileSync('xcodebuild', [
    '-project',
    'ios/App/App.xcodeproj',
    '-scheme',
    'App',
    '-configuration',
    'Debug',
    '-destination',
    'generic/platform=iOS',
    '-derivedDataPath',
    derivedDataPath,
    'CODE_SIGNING_ALLOWED=NO',
    'build',
  ], {
    stdio: 'inherit',
  });

  const builtInfoPlistPath = join(builtAppPath, 'Info.plist');
  const builtPrivacyManifestPath = join(builtAppPath, 'PrivacyInfo.xcprivacy');
  for (const requiredPath of [builtInfoPlistPath, builtPrivacyManifestPath]) {
    if (!existsSync(requiredPath)) {
      throw new Error(`Built iOS app is missing required release artifact: ${requiredPath}`);
    }
  }

  const expectedAppVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
  assertPlistValue(builtInfoPlistPath, 'CFBundleShortVersionString', expectedAppVersion);

  const motionPurpose = readPlistValue(builtInfoPlistPath, 'NSMotionUsageDescription');
  if (!/ULSA|上下逆さ|画面の向き|端末の動き/.test(motionPurpose)) {
    throw new Error('Built iOS app must include the ULSA motion/orientation purpose string.');
  }
  assertPlistValue(builtPrivacyManifestPath, 'NSPrivacyTracking', 'false');
  assertPlistValue(
    builtPrivacyManifestPath,
    'NSPrivacyAccessedAPITypes.0.NSPrivacyAccessedAPIType',
    'NSPrivacyAccessedAPICategorySystemBootTime',
  );
  assertPlistValue(
    builtPrivacyManifestPath,
    'NSPrivacyAccessedAPITypes.0.NSPrivacyAccessedAPITypeReasons.0',
    '35F9.1',
  );
  console.log('[build:ios] Verified App.app motion purpose string and privacy manifest.');
} finally {
  try {
    rmSync(derivedDataPath, { recursive: true, force: true, maxRetries: 3 });
    console.log(`[build:ios] Removed temporary DerivedData: ${derivedDataPath}`);
  } catch (error) {
    console.warn(`[build:ios] Could not remove temporary DerivedData: ${derivedDataPath}`, error);
  }
}
