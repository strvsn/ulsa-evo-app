import { describe, expect, it } from 'vitest';
import {
  compareStm32Versions,
  decodeStm32VersionCode,
  formatCanonicalStm32Version,
  formatStm32VersionCode,
  packStm32VersionCode,
  parseCanonicalStm32Version,
  STM32_INITIAL_VERSION,
  STM32_INITIAL_VERSION_CODE,
  STM32_MIN_REVISION,
  STM32_UPDATE_CONTRACT_VERSION,
} from './stm32FirmwareVersion';

describe('STM32 firmware semantic identity', () => {
  it('always keeps all three display components', () => {
    expect(STM32_INITIAL_VERSION).toBe('1.0.0');
    expect(formatCanonicalStm32Version({ major: 1, minor: 12, patch: 0 }))
      .toBe('1.12.0');
    expect(() => parseCanonicalStm32Version('1.12')).toThrow();
    expect(parseCanonicalStm32Version('1.12.1'))
      .toEqual({ major: 1, minor: 12, patch: 1 });
  });

  it('packs and decodes the tagged uint32 value', () => {
    expect(packStm32VersionCode('1.0.0')).toBe(STM32_INITIAL_VERSION_CODE);
    expect(packStm32VersionCode('255.255.255')).toBe(0x7effffff);
    expect(decodeStm32VersionCode(0x7e010c01)).toEqual({
      major: 1,
      minor: 12,
      patch: 1,
    });
    expect(formatStm32VersionCode(0x7e010c00)).toBe('1.12.0');
    expect(() => decodeStm32VersionCode(20260831)).toThrow();
  });

  it('rejects abbreviated, prefixed and out-of-range values', () => {
    for (const invalid of [
      '1.0', '1.0.0.0', '01.0.0', '1.00.0', '1.0.00', 'v1.0.0',
      '1.0.0-beta', '256.0.0', '-1.0.0',
    ]) {
      expect(() => parseCanonicalStm32Version(invalid)).toThrow();
    }
  });

  it('compares numeric components instead of string order', () => {
    expect(compareStm32Versions('1.9.9', '1.10.0')).toBeLessThan(0);
    expect(compareStm32Versions('1.10.0', '1.12.0')).toBeLessThan(0);
    expect(compareStm32Versions('1.12.0', '2.0.0')).toBeLessThan(0);
  });

  it('shares the pre-shipment minimum revision and update contract', () => {
    expect(STM32_MIN_REVISION).toBe(1);
    expect(STM32_UPDATE_CONTRACT_VERSION).toBe(3);
  });
});
