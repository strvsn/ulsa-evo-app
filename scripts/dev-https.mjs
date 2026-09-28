import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const certDir = resolve(root, '.cert');
const keyPath = resolve(certDir, 'ulsa-evo-dev.key');
const certPath = resolve(certDir, 'ulsa-evo-dev.crt');
const sanPath = resolve(certDir, 'ulsa-evo-dev.san');
const viteBin = resolve(root, 'node_modules/.bin/vite');

const getLanIPv4Addresses = () => {
  const addresses = new Set(['127.0.0.1']);
  for (const netIfaces of Object.values(networkInterfaces())) {
    for (const iface of netIfaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.add(iface.address);
      }
    }
  }
  return [...addresses];
};

const createSan = () => {
  const dnsEntries = ['DNS:localhost'];
  const ipEntries = getLanIPv4Addresses().map((address) => `IP:${address}`);
  return [...dnsEntries, ...ipEntries].join(',');
};

const ensureCertificate = () => {
  mkdirSync(certDir, { recursive: true });
  const san = createSan();
  const previousSan = existsSync(sanPath) ? readFileSync(sanPath, 'utf8').trim() : '';
  const shouldGenerate = !existsSync(keyPath) || !existsSync(certPath) || previousSan !== san;
  if (!shouldGenerate) {
    return san;
  }

  const result = spawnSync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-sha256',
    '-days',
    '365',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-subj',
    '/CN=ulsa-evo-dev.local',
    '-addext',
    `subjectAltName=${san}`,
  ], { stdio: 'inherit' });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  writeFileSync(sanPath, `${san}\n`);
  return san;
};

const san = ensureCertificate();

console.log('[dev:https] Self-signed certificate ready.');
console.log(`[dev:https] SAN: ${san}`);
console.log('[dev:https] Smartphone browsers may require trusting .cert/ulsa-evo-dev.crt before BLE is available.');

const child = spawn(viteBin, ['--host', '0.0.0.0'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_HTTPS_KEY: keyPath,
    VITE_DEV_HTTPS_CERT: certPath,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
