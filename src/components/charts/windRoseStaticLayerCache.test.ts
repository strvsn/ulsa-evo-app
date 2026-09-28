import { describe, expect, it } from 'vitest';
import { createWindRoseStaticLayerCacheKey } from './windRoseStaticLayerCache';

const base = {
  width: 320,
  height: 320,
  pixelRatio: 2.5,
  isTilted: true,
  tiltDegrees: 50,
  theme: 'graphite' as const,
};

describe('createWindRoseStaticLayerCacheKey', () => {
  it('is stable for the same render surface', () => {
    expect(createWindRoseStaticLayerCacheKey(base)).toBe(createWindRoseStaticLayerCacheKey({ ...base }));
  });

  it('invalidates for size, DPR, theme, and tilt changes', () => {
    const key = createWindRoseStaticLayerCacheKey(base);
    expect(createWindRoseStaticLayerCacheKey({ ...base, width: 321 })).not.toBe(key);
    expect(createWindRoseStaticLayerCacheKey({ ...base, pixelRatio: 2 })).not.toBe(key);
    expect(createWindRoseStaticLayerCacheKey({ ...base, theme: 'light' })).not.toBe(key);
    expect(createWindRoseStaticLayerCacheKey({ ...base, tiltDegrees: 45 })).not.toBe(key);
  });
});
