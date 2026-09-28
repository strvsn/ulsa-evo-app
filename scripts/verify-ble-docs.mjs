import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const constantsPath = join(root, 'src/services/ble/bleConstants.ts');
const specPath = join(root, 'docs/BLE_SPECIFICATION.md');
const docsToCheckForObsoleteUuids = [
  specPath,
  join(root, 'docs/PROJECT_OVERVIEW.md'),
  join(root, 'docs/FIRMWARE_INQUIRY.md'),
  join(root, 'docs/IOS_COMPATIBILITY_REPORT.md'),
];

const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const constantsText = readFileSync(constantsPath, 'utf8');
const specText = readFileSync(specPath, 'utf8');
const privateNonPublicUuids = new Set();
const expectedUuids = [...new Set(constantsText.match(uuidPattern) ?? [])]
  .map((uuid) => uuid.toLowerCase())
  .filter((uuid) => !privateNonPublicUuids.has(uuid));
const failures = [];

const policyChecks = [
  {
    paths: [
      join(root, 'public_templates/README.md'),
      join(root, 'README.md'),
    ],
    required: [
      '## 日本語',
      '## English',
      'ULSA EVO超音波風速計',
      'ULSA EVO ultrasonic anemometer',
    ],
  },
  {
    paths: [
      join(root, 'public_templates/docs/FIRMWARE_UPDATE_BOUNDARY.md'),
      join(root, 'docs/FIRMWARE_UPDATE_BOUNDARY.md'),
    ],
    required: [
      'include the user-facing STM32 updater UI',
      'production STM32 API and catalog provide signed production firmware',
    ],
    forbidden: ['keeps the STM32 updater UI off'],
  },
  {
    paths: [join(root, 'docs/CLOUDFLARE_FIRMWARE_DELIVERY_RUNBOOK.md')],
    required: [
      'public/TestFlight application includes the STM32 updater',
      'production `STM32_ACCESS_MODE` is `public`',
    ],
  },
  {
    paths: [join(root, 'docs/PUBLIC_RELEASE_REPOSITORY_SEPARATION.md')],
    required: [
      '一般向けSTM32 updater UIはON',
      '署名済みproduction packageだけをproduction STM32 catalogから取得',
    ],
  },
  {
    paths: [join(root, 'docs/APP_STORE_ACCEPTANCE_AUDIT_2026-09-05.md')],
    required: [
      '現行方針ではSTM32 updater UIとproduction STM32 API／catalogを公開',
      'production APIは署名済みproduction packageだけを提供',
    ],
    forbidden: ['Review Notesは一般向けでOFFのSTM32更新UI'],
  },
];

for (const check of policyChecks) {
  const existingPaths = check.paths.filter((path) => existsSync(path));
  for (const existing of existingPaths) {
    const text = readFileSync(existing, 'utf8');
    for (const phrase of check.required ?? []) {
      if (!text.includes(phrase)) {
        failures.push(`${existing.replace(`${root}/`, '')} is missing current STM32 release-policy phrase: ${phrase}`);
      }
    }
    for (const phrase of check.forbidden ?? []) {
      if (text.includes(phrase)) {
        failures.push(`${existing.replace(`${root}/`, '')} contains superseded STM32 release-policy phrase: ${phrase}`);
      }
    }
  }
}

const historicalPlanPath = join(root, 'docs/STM32_FW_VIA_ESP32_UPDATE_PLAN.md');
if (existsSync(historicalPlanPath)) {
  const historicalPlan = readFileSync(historicalPlanPath, 'utf8');
  for (const phrase of [
    'current implementation',
    'productionのSTM32 API／catalog設定は`public`',
    'App Attestは未実装',
    'Historical, superseded',
    '現行のpublic／TestFlight UIとproduction STM32 API／catalogはON',
  ]) {
    if (!historicalPlan.includes(phrase)) {
      failures.push(`docs/STM32_FW_VIA_ESP32_UPDATE_PLAN.md must identify superseded policy and current boundary: ${phrase}`);
    }
  }
}

for (const uuid of expectedUuids) {
  if (!specText.toLowerCase().includes(uuid)) {
    failures.push(`BLE_SPECIFICATION.md is missing UUID from bleConstants.ts: ${uuid}`);
  }
}

if (!specText.includes('src/services/ble/bleConstants.ts')) {
  failures.push('BLE_SPECIFICATION.md must name src/services/ble/bleConstants.ts as the UUID source of truth.');
}

const obsoleteUuids = [
  '00002000-0000-1000-8000-00805f9b34fb',
  '00002001-0000-1000-8000-00805f9b34fb',
  '00002002-0000-1000-8000-00805f9b34fb',
  '00002003-0000-1000-8000-00805f9b34fb',
  '00002004-0000-1000-8000-00805f9b34fb',
];

for (const docPath of docsToCheckForObsoleteUuids.filter(existsSync)) {
  const text = readFileSync(docPath, 'utf8').toLowerCase();
  for (const uuid of obsoleteUuids) {
    if (text.includes(uuid)) {
      failures.push(`${docPath.replace(`${root}/`, '')} contains obsolete UUID: ${uuid}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`BLE docs and STM32 release-policy docs verified: ${expectedUuids.length} UUIDs match bleConstants.ts`);
