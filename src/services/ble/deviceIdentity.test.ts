import { describe, expect, it } from 'vitest';
import { normalizeUlsaEvoDeviceName } from './deviceIdentity';

describe('normalizeUlsaEvoDeviceName', () => {
  it('replaces a stale ULSA EVO node suffix with the advertised node ID', () => {
    expect(normalizeUlsaEvoDeviceName('ULSA EVO #0', 123)).toBe('ULSA EVO #123');
  });

  it('uses the canonical ULSA EVO name when the platform omits a name', () => {
    expect(normalizeUlsaEvoDeviceName(null, 123)).toBe('ULSA EVO #123');
  });

  it('preserves an unrelated device name', () => {
    expect(normalizeUlsaEvoDeviceName('Environmental Sensor', 123)).toBe('Environmental Sensor');
  });
});
