import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const esp32Root = resolve(process.env.ULSA_EVO_ESP32_ROOT ?? join(root, '..', 'ULSA_EVO_ESP32'));
const appPath = join(root, 'config', 'timezone_catalog.json');
const esp32Path = join(esp32Root, 'config', 'timezone_catalog.json');
const allowMissingFirmwareContracts = process.env.ULSA_ALLOW_MISSING_FIRMWARE_CONTRACTS === '1';

const fail = (message) => {
  console.error(`Timezone catalog verification failed: ${message}`);
  process.exit(1);
};

if (!existsSync(appPath)) fail(`app catalog missing: ${appPath}`);
if (!existsSync(esp32Path)) {
  if (allowMissingFirmwareContracts) {
    console.log(`Timezone catalog cross-check explicitly skipped: ${esp32Path} not found`);
    process.exit(0);
  }
  fail(`ESP32 catalog missing: ${esp32Path}`);
}

const appBytes = readFileSync(appPath);
const esp32Bytes = readFileSync(esp32Path);
if (!appBytes.equals(esp32Bytes)) fail('app and ESP32 catalogs are not byte-identical');

const catalog = JSON.parse(appBytes.toString('utf8'));
if (catalog.schemaVersion !== 1 || catalog.source !== 'AceTime/zonedbx/kZoneAndLinkRegistry') {
  fail('schema or registry source mismatch');
}
if (catalog.aceTimeVersion !== '4.1.0' ||
    catalog.aceTimeCommit !== '3dc2f58811e153e02bd16161da579dd201746372' ||
    catalog.tzdbVersion !== '2025b' || catalog.tzdbYear !== 2025 ||
    catalog.tzdbRevisionLetter !== 'b' || catalog.startYear !== 2000 ||
    catalog.untilYear !== 2200 || catalog.zoneAndLinkCount !== 597) {
  fail('AceTime/TZDB metadata mismatch');
}
if (!Array.isArray(catalog.zones) || catalog.zones.length !== 597) {
  fail('zone/link count mismatch');
}

const names = catalog.zones.map(({ name }) => name);
const ids = catalog.zones.map(({ zoneId }) => zoneId);
if (new Set(names).size !== names.length || new Set(ids).size !== ids.length) {
  fail('duplicate zone name or stable zone ID');
}
if (names.some((name, index) => index > 0 && names[index - 1] >= name)) {
  fail('zone names are not strictly sorted');
}

const fixtures = new Map([
  ['Africa/Casablanca', 0xc59f1b33],
  ['America/New_York', 0x1e2a7654],
  ['Asia/Kathmandu', 0x9a96ce6f],
  ['Asia/Tokyo', 0x15e606a8],
  ['Australia/Lord_Howe', 0xa748b67d],
  ['Europe/London', 0x5c6a84ae],
  ['Pacific/Chatham', 0x2f0de999],
  ['UTC', 0x0b882791],
]);
const byName = new Map(catalog.zones.map(({ name, zoneId }) => [name, zoneId]));
for (const [name, zoneId] of fixtures) {
  if (byName.get(name) !== zoneId) fail(`stable zone ID mismatch: ${name}`);
}

const digest = createHash('sha256').update(appBytes).digest('hex');
console.log(`Timezone catalog verified: 597 zones/links, SHA-256 ${digest}`);
