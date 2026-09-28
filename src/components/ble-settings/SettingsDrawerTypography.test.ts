import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  'src/components/ble-settings/styles/drawer-visual-refresh.css',
  'utf8',
);

const luminance = (hex: string): number => {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrast = (first: string, second: string): number => {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

describe('settings drawer explanatory typography', () => {
  it('uses one size, weight and line-height contract across explanatory copy', () => {
    expect(styles).toContain('--drawer-copy-size: 13px;');
    expect(styles).toContain('--drawer-copy-weight: 500;');
    expect(styles).toContain('--drawer-copy-line-height: 1.55;');
    for (const selector of [
      '.i2c-config-note',
      '.i2c-node-id-help',
      '.ble-settings-note',
      '.browser-log-policy-copy',
      '.app-information-copy',
      '.led-wind-reactive-help',
      '.appearance-theme-intro',
      '.firmware-update-entry > p',
    ]) {
      expect(styles).toContain(selector);
    }
  });

  it('keeps light and dark explanatory text above normal-text contrast', () => {
    expect(contrast('#405762', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#b8c8cf', '#0f212c')).toBeGreaterThanOrEqual(4.5);
  });
});
