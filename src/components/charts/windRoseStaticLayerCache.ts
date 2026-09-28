import type { WindRoseThemeVariant } from './windRoseTheme';

export interface WindRoseStaticLayerCacheKeyInput {
  width: number;
  height: number;
  pixelRatio: number;
  isTilted: boolean;
  tiltDegrees: number;
  theme: WindRoseThemeVariant;
}

export const createWindRoseStaticLayerCacheKey = ({
  width,
  height,
  pixelRatio,
  isTilted,
  tiltDegrees,
  theme,
}: WindRoseStaticLayerCacheKeyInput): string => [
  Math.round(width * pixelRatio),
  Math.round(height * pixelRatio),
  pixelRatio.toFixed(3),
  isTilted ? 1 : 0,
  tiltDegrees.toFixed(2),
  theme,
].join(':');
