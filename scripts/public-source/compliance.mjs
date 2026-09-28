import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { readJson, sha256 } from './common.mjs';

const packageNameFromPath = (path) => path.slice(path.lastIndexOf('node_modules/') + 13);
const purlName = (name) => name.startsWith('@')
  ? name.split('/').map(encodeURIComponent).join('/')
  : encodeURIComponent(name);

export const loadPackageComponents = (root) => {
  const lock = readJson(join(root, 'package-lock.json'));
  const components = Object.entries(lock.packages ?? {}).flatMap(([path, metadata]) => {
    if (!path.includes('node_modules/') || !metadata.version) return [];
    const name = metadata.name || packageNameFromPath(path);
    const license = String(metadata.license || '').trim();
    if (!license) throw new Error(`dependency license metadata is missing: ${name}@${metadata.version}`);
    return [{
      name,
      version: String(metadata.version),
      license,
      resolved: String(metadata.resolved || ''),
      dev: metadata.dev === true,
      packagePath: path,
    }];
  });
  components.sort((left, right) => (
    left.name.localeCompare(right.name) || left.version.localeCompare(right.version)
  ));
  if (!components.length) throw new Error('package-lock contains no dependency components');
  return components;
};

const licenseValue = (expression) => /^[A-Za-z0-9-.+]+$/.test(expression)
  ? { license: { id: expression } }
  : { expression };

const deterministicUuid = (value) => {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const createSbom = (rootPackage, components, scope) => ({
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${deterministicUuid(`${rootPackage.name}:${rootPackage.version}:${scope}`)}`,
  version: 1,
  metadata: {
    component: {
      type: 'application',
      name: rootPackage.name,
      version: rootPackage.version,
      licenses: [{ license: { id: 'MIT' } }],
    },
  },
  components: components.map((component) => ({
    type: 'library',
    name: component.name,
    version: component.version,
    scope: component.dev ? 'optional' : 'required',
    licenses: [licenseValue(component.license)],
    purl: `pkg:npm/${purlName(component.name)}@${encodeURIComponent(component.version)}`,
    ...(component.resolved ? { externalReferences: [{ type: 'distribution', url: component.resolved }] } : {}),
  })),
});

const renderNotices = (components) => {
  const lines = [
    '# Third-party notices',
    '',
    'ULSA EVO App software is distributed under the project MIT License. Dependencies remain governed by their own license terms.',
    '',
    '| Package | Version | License | Scope |',
    '|---|---:|---|---|',
  ];
  for (const component of components) {
    lines.push(`| \`${component.name.replaceAll('|', '\\|')}\` | \`${component.version}\` | ${component.license.replaceAll('|', '\\|')} | ${component.dev ? 'development' : 'runtime'} |`);
  }
  lines.push('', 'See `THIRD_PARTY_LICENSES.txt` for license/notice files available in the installed packages used to generate this snapshot.', '');
  return lines.join('\n');
};

const collectLicenseDocuments = (root, components) => {
  const byHash = new Map();
  for (const component of components) {
    const directory = join(root, component.packagePath);
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory)) {
      if (!/^(?:licen[cs]e|copying|notice)(?:\..*)?$/i.test(name)) continue;
      const path = join(directory, name);
      let payload;
      try {
        payload = readFileSync(path);
      } catch {
        continue;
      }
      if (!payload.length || payload.length > 512 * 1024) continue;
      const hash = sha256(payload);
      const entry = byHash.get(hash) ?? { hash, payload, packages: [] };
      entry.packages.push(`${component.name}@${component.version}:${basename(path)}`);
      byHash.set(hash, entry);
    }
  }
  const lines = ['ULSA EVO App third-party license documents', ''];
  for (const entry of [...byHash.values()].sort((a, b) => a.hash.localeCompare(b.hash))) {
    lines.push('='.repeat(78));
    lines.push(`SHA-256: ${entry.hash}`);
    lines.push(`Packages: ${[...new Set(entry.packages)].sort().join(', ')}`);
    lines.push('='.repeat(78), '');
    lines.push(entry.payload.toString('utf8').trim(), '');
  }
  return `${lines.join('\n')}\n`;
};

export const generateComplianceArtifacts = (sourceRoot, outputRoot) => {
  const rootPackage = readJson(join(sourceRoot, 'package.json'));
  const components = loadPackageComponents(sourceRoot);
  const runtime = components.filter((component) => !component.dev);
  mkdirSync(join(outputRoot, 'sbom'), { recursive: true });
  const outputs = {
    'THIRD_PARTY_NOTICES.md': renderNotices(components),
    'THIRD_PARTY_LICENSES.txt': collectLicenseDocuments(sourceRoot, components),
    'sbom/runtime.cdx.json': `${JSON.stringify(createSbom(rootPackage, runtime, 'runtime'), null, 2)}\n`,
    'sbom/development.cdx.json': `${JSON.stringify(createSbom(rootPackage, components, 'development'), null, 2)}\n`,
  };
  for (const [relative, payload] of Object.entries(outputs)) {
    const path = join(outputRoot, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, payload, 'utf8');
  }
  return { componentCount: components.length, runtimeComponentCount: runtime.length, outputs: Object.keys(outputs) };
};
