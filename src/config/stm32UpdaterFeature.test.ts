import { describe, expect, it, vi } from 'vitest';
import { isStm32UpdaterEnabled } from './stm32UpdaterFeature';

describe('STM32 updater feature gate', () => {
  it('enables only the exact string true', () => {
    expect(isStm32UpdaterEnabled('true')).toBe(true);
    for (const value of ['', 'false', 'TRUE', '1', 'yes']) {
      expect(isStm32UpdaterEnabled(value)).toBe(false);
    }
  });

  it('uses the build environment only when no explicit value is provided', () => {
    vi.stubEnv('VITE_STM32_UPDATER_ENABLED', 'true');
    expect(isStm32UpdaterEnabled()).toBe(true);
    vi.stubEnv('VITE_STM32_UPDATER_ENABLED', '');
    expect(isStm32UpdaterEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});
