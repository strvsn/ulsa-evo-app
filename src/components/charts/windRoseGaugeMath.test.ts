import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WIND_ROSE_TILT_DEGREES,
  applyTrueHeading,
  createWindRoseGeometry,
  normalizeDegrees,
  normalizeWindRoseSpeed,
  projectWindRosePoint,
  snapWindRoseDirection,
  shortestAngularDistance,
} from './windRoseGaugeMath';
import { getWindRosePaletteForSpeed } from './windRoseTheme';

describe('windRoseGaugeMath', () => {
  it('uses a continuous low-speed-sensitive scale and a smooth color transition', () => {
    expect(normalizeWindRoseSpeed(0.1)).toBeGreaterThan(0.2);
    expect(normalizeWindRoseSpeed(0.5)).toBeGreaterThan(0.4);
    expect(normalizeWindRoseSpeed(5)).toBeGreaterThan(normalizeWindRoseSpeed(1));
    expect(normalizeWindRoseSpeed(20)).toBeLessThan(1);
    expect(normalizeWindRoseSpeed(25)).toBe(1);
    expect(normalizeWindRoseSpeed(30)).toBe(1);
    expect(getWindRosePaletteForSpeed(0).primary).toBe('#00E6C7');
    expect(getWindRosePaletteForSpeed(2.75).primary).not.toBe(getWindRosePaletteForSpeed(0.5).primary);
    expect(getWindRosePaletteForSpeed(2.75).primary).not.toBe(getWindRosePaletteForSpeed(5).primary);
    expect(getWindRosePaletteForSpeed(20).primary).toBe('#D96CFF');
  });

  it('keeps wind direction normalized around north and across the 0/360 boundary', () => {
    expect(normalizeDegrees(-15)).toBe(345);
    expect(normalizeDegrees(375)).toBe(15);
    expect(shortestAngularDistance(355, 5)).toBe(10);
    expect(applyTrueHeading(350, 20)).toBe(10);
    expect(applyTrueHeading(12, 348)).toBe(0);
  });

  it('snaps rendered wind rays to the same three-degree lattice as the baseline', () => {
    expect(snapWindRoseDirection(127)).toBe(126);
    expect(snapWindRoseDirection(128)).toBe(129);
    expect(snapWindRoseDirection(359.4)).toBe(0);
  });

  it('projects north away and south toward the viewer only in tilted mode', () => {
    const common = { centerX: 200, centerY: 200, radius: 120, size: 400, isTilted: true };
    const north = projectWindRosePoint({ ...common, angle: 0 });
    const south = projectWindRosePoint({ ...common, angle: 180 });
    const flatNorth = projectWindRosePoint({ ...common, angle: 0, isTilted: false });

    expect(north.scale).toBeLessThan(1);
    expect(south.scale).toBeGreaterThan(1);
    expect(200 - north.y).toBeLessThan(south.y - 200);
    expect(flatNorth.scale).toBe(1);
    expect(flatNorth.y).toBe(80);
  });

  it('makes the depth projection steeper as the tilt angle increases', () => {
    const common = { centerX: 200, centerY: 200, radius: 120, size: 400, isTilted: true, angle: 0 };
    const shallow = projectWindRosePoint({ ...common, tiltDegrees: 45 });
    const standard = projectWindRosePoint({ ...common, tiltDegrees: DEFAULT_WIND_ROSE_TILT_DEGREES });
    const deep = projectWindRosePoint({ ...common, tiltDegrees: 60 });

    expect(shallow.scale).toBeGreaterThan(standard.scale);
    expect(standard.scale).toBeGreaterThan(deep.scale);
    expect(200 - shallow.y).toBeGreaterThan(200 - standard.y);
    expect(200 - standard.y).toBeGreaterThan(200 - deep.y);
  });

  it('keeps all dynamic shape generation out of the static 120-ray geometry', () => {
    const geometry = createWindRoseGeometry({ size: 400 });

    expect(geometry.bars).toHaveLength(120);
    expect(geometry.bars.map((bar) => bar.angle)).toEqual(
      Array.from({ length: 120 }, (_, index) => index * 3),
    );
    expect(geometry.bars.every((bar) => bar.baselineInnerRadius < bar.outerRadius)).toBe(true);
  });

  it('places the maximum-extension ring at 50% of the radial circle radius', () => {
    const geometry = createWindRoseGeometry({ size: 400 });

    expect(geometry.maximumActiveInnerRadius).toBeLessThan(geometry.centerSafeRadius);
    expect(geometry.maximumActiveInnerRadius).toBeLessThan(geometry.bars[0].baselineInnerRadius);
    expect(geometry.maximumActiveInnerRadius).toBeCloseTo(geometry.outerRadius * 0.5, 4);
  });
});
