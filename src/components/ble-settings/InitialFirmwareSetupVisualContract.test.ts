import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../..');
const source = readFileSync(resolve(directory, 'InitialFirmwareSetupWizardView.tsx'), 'utf8');
const productSource = readFileSync(resolve(directory, 'FirmwareUpdateProduct.tsx'), 'utf8');
const css = readFileSync(resolve(directory, 'styles/initial-firmware-setup-wizard.css'), 'utf8');

const luminance = (hex: string): number => {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrast = (foreground: string, background: string): number => {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

describe('Initial firmware setup visual contract', () => {
  it('uses the approved product render instead of an invented box or Initial label', () => {
    const image = resolve(root, 'public/ulsa-evo-product.png');
    expect(existsSync(image)).toBe(true);
    expect(statSync(image).size).toBeGreaterThan(800_000);
    expect(createHash('sha256').update(readFileSync(image)).digest('hex'))
      .toBe('baa3a5868bfcbae5fffefcd9d2a2a3ef111674afe64b38603e1537d135e51500');
    expect(productSource).toContain('src="/ulsa-evo-product.png"');
    expect(source).toContain('FirmwareUpdateProduct as ProductVisual');
    expect(source).not.toContain('initial-setup-box');
    expect(source).not.toMatch(/>INITIAL</);
  });

  it('keeps the iPhone presentation as a centered popup rather than a full-screen page', () => {
    expect(source).not.toContain('IonPage');
    expect(source).not.toContain('IonContent');
    expect(css).toContain('--width: min(420px, calc(100vw - 32px))');
    expect(css).toContain('--height: min(700px, calc(100dvh - 48px))');
    expect(css).toContain('overflow: clip');
    expect(css).not.toMatch(/--(?:width|height):\s*100%/);
    expect(css).not.toContain('--border-radius: 0');
  });

  it('keeps text, controls, and the checkbox visibly contrasted', () => {
    expect(css).toContain('background: #f8fafb');
    expect(css).toContain('color: #142630');
    expect(css).toContain('.initial-setup-hide-checkbox input:checked::before');
    expect(css).toContain('.initial-setup-consent-item input:checked::before');
    expect(css).toMatch(/\.initial-setup-intro-copy\s*\{[^}]*text-align:\s*center/s);
    expect(css).toMatch(/\.initial-setup-consent-list\s*\{[^}]*text-align:\s*left/s);
    expect(css).toContain('place-items: center');
    expect(css).toContain('margin-inline-end: 8px');
    expect(source).toContain('<input type="checkbox"');
    expect(source).toContain('disabled={!introConsentAccepted}');
    expect(source).toContain('アプリ接続にはファームウェア更新が必要です');
    expect(source).toContain('これからインストールするのは、評価・開発用の「デモファームウェア」です。');
    expect(source).toContain('ファームウェアおよび計測アプリの完全な動作を保証するものではありません。');
    expect(source).toContain('インストールや利用による不具合・損害は補償できません。');
    expect(source).toContain('ファームウェアおよび計測アプリのソースコードは公開されています。');
    expect(source).toContain('自由に確認・改善・改変できます。');
    expect(source).not.toContain('工場出荷時の状態');
    expect(source).toContain('<footer className="initial-setup-footer">');
    expect(contrast('#142630', '#f8fafb')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#405762', '#f8fafb')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#607680', '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(contrast('#ffffff', '#006c8f')).toBeGreaterThanOrEqual(4.5);
  });

  it('retains the landing-page-style reveal with a reduced-motion fallback', () => {
    expect(css).toContain('@keyframes initialProductReveal');
    expect(css).toContain('cubic-bezier(0.16, 1, 0.3, 1)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('uses a clockwise top-origin ring only for measured or bounded Initial stages', () => {
    expect(css).toContain('conic-gradient(from 0deg, #006c8f var(--initial-progress)');
    expect(source).toContain('Math.min(95');
    expect(source).toContain("connectionPhase === 'iosPrompt'");
    expect(source).toContain('<IonSpinner name="crescent"');
    expect(source).toContain("data-progress-kind={measuredPercent === undefined ? 'estimated' : 'measured'}");
  });
});
