const MAX_PUBLIC_FILE_BYTES = 2 * 1024 * 1024;
const LFS_POINTER = Buffer.from('version https://git-lfs.github.com/spec/v1\n');
const TEXT_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.css', '.h', '.hpp', '.html', '.js', '.json', '.jsx',
  '.m', '.md', '.mjs', '.mm', '.plist', '.sh', '.swift', '.ts', '.tsx', '.txt',
  '.xcconfig', '.xcscheme', '.yml', '.yaml', '.zsh',
]);

const extension = (path) => {
  const name = path.toLowerCase();
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index) : '';
};

const privateLocalPathRules = [
  ['user-home-path', new RegExp(String.raw`/(?:Users|home)/[^/\\\s"'<>]+(?:/|$)`, 'i')],
  [
    'windows-user-profile-path',
    new RegExp(String.raw`(?:^|[^A-Za-z0-9])[A-Za-z]:(?:\\|/)+(?:Users|home)(?:\\|/)+[^\\/\s"'<>]+(?:(?:\\|/)|$)`, 'i'),
  ],
  ['local-file-uri', new RegExp(['file:', String.fromCharCode(47), String.fromCharCode(47)].join(''), 'i')],
];

const payloadViews = (payload) => {
  const views = [payload.toString('utf8'), payload.toString('latin1')];
  for (const offset of [0, 1]) {
    const remaining = payload.length - offset;
    const alignedLength = remaining - (remaining % 2);
    if (alignedLength <= 0) continue;
    const alignedPayload = payload.subarray(offset, offset + alignedLength);
    views.push(alignedPayload.toString('utf16le'));
    views.push(Buffer.from(alignedPayload).swap16().toString('utf16le'));
  }
  return views;
};

const findPrivateLocalPath = (payload) => {
  const views = payloadViews(payload);
  for (const [rule, pattern] of privateLocalPathRules) {
    if (views.some((view) => pattern.test(view))) return rule;
  }
  return null;
};

const highConfidenceRules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+\/-]{32,}={0,2}\b/i],
  ['apple-auth-key-file', /\bAuthKey_[A-Z0-9]{10}\.p8\b/],
];

export const scanPayload = (payload, path = '') => {
  if (!TEXT_EXTENSIONS.has(extension(path))) return [];
  const text = payload.toString('utf8');
  return highConfidenceRules.flatMap(([rule, pattern]) => pattern.test(text) ? [{ rule, path }] : []);
};

export const validatePublicPayload = (relative, payload, forbiddenContent = []) => {
  if (payload.length > MAX_PUBLIC_FILE_BYTES) {
    throw new Error(`public source exceeds 2 MiB limit: ${relative}`);
  }
  if (payload.subarray(0, LFS_POINTER.length).equals(LFS_POINTER)) {
    throw new Error(`public source must not contain a Git LFS pointer: ${relative}`);
  }
  const localPathRule = findPrivateLocalPath(payload);
  if (localPathRule) {
    throw new Error(`public source contains a private local filesystem path (${localPathRule}): ${relative}`);
  }
  const text = TEXT_EXTENSIONS.has(extension(relative)) ? payload.toString('utf8') : '';
  for (const marker of forbiddenContent) {
    if (text.includes(marker)) throw new Error(`public source contains forbidden content: ${relative}: ${marker}`);
  }
  const findings = scanPayload(payload, relative);
  if (findings.length) {
    throw new Error(
      `public source secret scan failed: ${relative}: ${[...new Set(findings.map(({ rule }) => rule))].join(', ')}`,
    );
  }
};
