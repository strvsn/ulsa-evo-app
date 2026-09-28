import { describe, expect, it } from 'vitest';
import {
  WIND_ROSE_COLOR_STOPS,
  WIND_ROSE_CORE_OPACITY,
  WIND_ROSE_CORE_WIDTH_RATIO,
  WIND_ROSE_DARK_GLOW_LIGHTNESS_DELTA,
  WIND_ROSE_GLOW_ALPHA,
  WIND_ROSE_GLOW_BLUR_RATIO,
  WIND_ROSE_INNER_GLOW_BLUR_RATIO,
  WIND_ROSE_INNER_GLOW_OPACITY,
  WIND_ROSE_LIGHT_GLOW_LIGHTNESS_DELTA,
  WIND_ROSE_MINIMUM_STROKE_ALPHA,
  getContrastRatio,
  getWindRosePaletteForSpeed,
  getWindRosePeakHoldPalette,
  getWindRoseSurfacePalette,
  interpolateOklch,
  resolveWindRoseThemeVariant,
  type WindRoseThemeVariant,
} from './windRoseTheme';

const themes: WindRoseThemeVariant[] = ['graphite', 'slate', 'light'];

describe('windRoseTheme', () => {
  it('resolves Slate and Graphite independently of the Light default', () => {
    expect(resolveWindRoseThemeVariant(4)).toBe('slate');
    expect(resolveWindRoseThemeVariant(3)).toBe('graphite');
    expect(resolveWindRoseThemeVariant(7)).toBe('light');
  });

  it('uses the high-chroma cyan-to-red anchors for every theme', () => {
    expect(getWindRosePaletteForSpeed(0, 'graphite').primary).toBe('#00E6C7');
    themes.forEach((theme) => {
      expect(getWindRosePaletteForSpeed(0, theme).primary).toBe('#00E6C7');
      expect(getWindRosePaletteForSpeed(5, theme).primary).toBe('#6E8BFF');
      expect(getWindRosePaletteForSpeed(25, theme).primary).toBe('#FF3B30');
      expect(getWindRosePaletteForSpeed(80, theme).primary).toBe('#FF3B30');
    });
  });

  it('interpolates in OKLCH instead of returning either sRGB endpoint', () => {
    const intermediate = interpolateOklch('#00E6C7', '#00D9FF', 0.5);
    expect(intermediate).not.toBe('#00E6C7');
    expect(intermediate).not.toBe('#00D9FF');
    expect(intermediate).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('uses one color scale and one physical glow model on every surface', () => {
    const graphiteStops = WIND_ROSE_COLOR_STOPS.graphite;
    themes.forEach((theme) => {
      expect(WIND_ROSE_COLOR_STOPS[theme]).toEqual(graphiteStops);
      const palette = getWindRosePaletteForSpeed(0.5, theme);
      expect(palette.minimumStrokeAlpha).toBe(WIND_ROSE_MINIMUM_STROKE_ALPHA);
      expect(palette.glowBlurRatio).toBe(WIND_ROSE_GLOW_BLUR_RATIO);
      expect(palette.innerGlowBlurRatio).toBe(WIND_ROSE_INNER_GLOW_BLUR_RATIO);
      expect(palette.innerGlowOpacity).toBe(WIND_ROSE_INNER_GLOW_OPACITY);
      expect(palette.coreWidthRatio).toBe(WIND_ROSE_CORE_WIDTH_RATIO);
      expect(palette.coreOpacity).toBe(WIND_ROSE_CORE_OPACITY);
      expect(palette.glow).toContain(`, ${WIND_ROSE_GLOW_ALPHA})`);
      expect(palette).not.toHaveProperty('contrastHalo');
    });
    expect(WIND_ROSE_INNER_GLOW_BLUR_RATIO).toBeLessThan(WIND_ROSE_GLOW_BLUR_RATIO);
    expect(WIND_ROSE_CORE_WIDTH_RATIO).toBeLessThan(1);
  });

  it('changes only the same-hue glow color where the surface requires it', () => {
    const graphite = getWindRosePaletteForSpeed(0.5, 'graphite');
    const slate = getWindRosePaletteForSpeed(0.5, 'slate');
    const light = getWindRosePaletteForSpeed(0.5, 'light');
    expect(graphite.primary).toBe('#00D9FF');
    expect(slate.primary).toBe(graphite.primary);
    expect(light.primary).toBe(graphite.primary);
    expect(slate.glow).toBe(graphite.glow);
    expect(light.glow).not.toBe(graphite.glow);
    expect(WIND_ROSE_DARK_GLOW_LIGHTNESS_DELTA).toBeGreaterThan(0);
    expect(WIND_ROSE_LIGHT_GLOW_LIGHTNESS_DELTA).toBeLessThan(0);
  });

  it('keeps three stable and distinct peak-hold bank colors in every theme', () => {
    expect([0, 1, 2].map((bank) => (
      getWindRosePeakHoldPalette('graphite', bank as 0 | 1 | 2).stroke
    ))).toEqual(['#FFB547', '#7FE58A', '#FF7FAF']);
    expect([0, 1, 2].map((bank) => (
      getWindRosePeakHoldPalette('slate', bank as 0 | 1 | 2).stroke
    ))).toEqual(['#FFD07A', '#A2F1A8', '#FFAAC5']);
    expect([0, 1, 2].map((bank) => (
      getWindRosePeakHoldPalette('light', bank as 0 | 1 | 2).stroke
    ))).toEqual(['#9A4E00', '#267238', '#A52B5C']);

    themes.forEach((theme) => {
      const background = getWindRoseSurfacePalette(theme).background;
      const mutedText = [0, 1, 2].map((bank) => (
        getWindRosePeakHoldPalette(theme, bank as 0 | 1 | 2).mutedText
      ));
      expect(new Set(mutedText).size).toBe(1);
      [0, 1, 2].forEach((bank) => {
        const stroke = getWindRosePeakHoldPalette(theme, bank as 0 | 1 | 2).stroke;
        expect(getContrastRatio(stroke, background)).toBeGreaterThanOrEqual(4.5);
      });
    });
  });
});
