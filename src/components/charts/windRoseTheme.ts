import { getUlsaThemeIdFromIndex } from '../../constants/themes';

export type WindRoseThemeVariant = 'graphite' | 'slate' | 'light';
export type WindRosePeakHoldBankIndex = 0 | 1 | 2;

export interface WindRosePalette {
  primary: string;
  highlight: string;
  glow: string;
  minimumStrokeAlpha: number;
  glowBlurRatio: number;
  innerGlowBlurRatio: number;
  innerGlowOpacity: number;
  coreWidthRatio: number;
  coreOpacity: number;
}

export interface WindRoseSurfacePalette {
  background: string;
  baseline: string;
  label: string;
  value: string;
  emptyValue: string;
  emptyUnit: string;
  maximumExtensionRing: string;
}

export interface WindRosePeakHoldPalette {
  stroke: string;
  glow: string;
  activeText: string;
  activeBorder: string;
  activeBackground: string;
  mutedText: string;
  mutedBorder: string;
  mutedBackground: string;
}

interface WindRoseColorStop {
  speed: number;
  color: string;
}

interface OklchColor {
  l: number;
  c: number;
  h: number;
}

const COLOR_STOPS: Record<WindRoseThemeVariant, readonly WindRoseColorStop[]> = {
  graphite: [
    { speed: 0, color: '#00E6C7' },
    { speed: 0.5, color: '#00D9FF' },
    { speed: 5, color: '#6E8BFF' },
    { speed: 20, color: '#D96CFF' },
    { speed: 25, color: '#FF3B30' },
  ],
  slate: [
    { speed: 0, color: '#00E6C7' },
    { speed: 0.5, color: '#00D9FF' },
    { speed: 5, color: '#6E8BFF' },
    { speed: 20, color: '#D96CFF' },
    { speed: 25, color: '#FF3B30' },
  ],
  light: [
    { speed: 0, color: '#00E6C7' },
    { speed: 0.5, color: '#00D9FF' },
    { speed: 5, color: '#6E8BFF' },
    { speed: 20, color: '#D96CFF' },
    { speed: 25, color: '#FF3B30' },
  ],
};

const PEAK_HOLD_COLORS: Record<
  WindRoseThemeVariant,
  readonly [string, string, string]
> = {
  graphite: ['#FFB547', '#7FE58A', '#FF7FAF'],
  slate: ['#FFD07A', '#A2F1A8', '#FFAAC5'],
  light: ['#9A4E00', '#267238', '#A52B5C'],
};

const SURFACES: Record<WindRoseThemeVariant, WindRoseSurfacePalette> = {
  graphite: {
    background: '#0C1B26',
    baseline: 'rgba(215, 232, 236, 0.32)',
    label: 'rgba(222, 239, 242, 0.66)',
    value: '#F7FCFD',
    emptyValue: 'rgba(231, 242, 244, 0.74)',
    emptyUnit: 'rgba(222, 239, 242, 0.52)',
    maximumExtensionRing: 'rgba(205, 227, 231, 0.42)',
  },
  slate: {
    background: '#2C4650',
    baseline: 'rgba(226, 240, 243, 0.34)',
    label: 'rgba(232, 244, 246, 0.74)',
    value: '#F8FCFD',
    emptyValue: 'rgba(236, 246, 248, 0.78)',
    emptyUnit: 'rgba(229, 242, 245, 0.60)',
    maximumExtensionRing: 'rgba(226, 241, 244, 0.50)',
  },
  light: {
    background: '#FAFBFC',
    baseline: 'rgba(47, 78, 91, 0.48)',
    label: '#46616D',
    value: '#10212B',
    emptyValue: '#526B77',
    emptyUnit: '#617985',
    maximumExtensionRing: 'rgba(34, 73, 87, 0.52)',
  },
};

export const WIND_ROSE_HIGHLIGHT_LIGHTNESS_DELTA = 0.06;
export const WIND_ROSE_GLOW_ALPHA = 0.90;
export const WIND_ROSE_DARK_GLOW_LIGHTNESS_DELTA = 0.14;
export const WIND_ROSE_LIGHT_GLOW_LIGHTNESS_DELTA = -0.12;
export const WIND_ROSE_GLOW_CHROMA_MULTIPLIER = 1.20;
export const WIND_ROSE_MINIMUM_STROKE_ALPHA = 0.54;
export const WIND_ROSE_GLOW_BLUR_RATIO = 0.042;
export const WIND_ROSE_INNER_GLOW_BLUR_RATIO = 0.016;
export const WIND_ROSE_INNER_GLOW_OPACITY = 0.68;
export const WIND_ROSE_CORE_WIDTH_RATIO = 0.42;
export const WIND_ROSE_CORE_OPACITY = 0.90;

const clamp = (value: number, minimum = 0, maximum = 1): number =>
  Math.min(Math.max(value, minimum), maximum);

const hexToRgb = (color: string): readonly [number, number, number] => [
  Number.parseInt(color.slice(1, 3), 16) / 255,
  Number.parseInt(color.slice(3, 5), 16) / 255,
  Number.parseInt(color.slice(5, 7), 16) / 255,
];

const srgbToLinear = (value: number): number =>
  value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);

const linearToSrgb = (value: number): number => {
  const clamped = clamp(value);
  return clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
};

const hexToOklch = (color: string): OklchColor => {
  const [red, green, blue] = hexToRgb(color).map(srgbToLinear);
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  const labL = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const labA = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const labB = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const hue = Math.atan2(labB, labA) * 180 / Math.PI;
  return {
    l: labL,
    c: Math.hypot(labA, labB),
    h: hue < 0 ? hue + 360 : hue,
  };
};

const oklchToHex = ({ l, c, h }: OklchColor): string => {
  const radians = h * Math.PI / 180;
  const labA = c * Math.cos(radians);
  const labB = c * Math.sin(radians);
  const lRoot = l + 0.3963377774 * labA + 0.2158037573 * labB;
  const mRoot = l - 0.1055613458 * labA - 0.0638541728 * labB;
  const sRoot = l - 0.0894841775 * labA - 1.291485548 * labB;
  const linearL = lRoot ** 3;
  const linearM = mRoot ** 3;
  const linearS = sRoot ** 3;
  const channels = [
    4.0767416621 * linearL - 3.3077115913 * linearM + 0.2309699292 * linearS,
    -1.2684380046 * linearL + 2.6097574011 * linearM - 0.3413193965 * linearS,
    -0.0041960863 * linearL - 0.7034186147 * linearM + 1.707614701 * linearS,
  ].map((channel) => Math.round(linearToSrgb(channel) * 255));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
};

export const interpolateOklch = (first: string, second: string, amount: number): string => {
  const ratio = clamp(amount);
  if (ratio === 0) return first.toUpperCase();
  if (ratio === 1) return second.toUpperCase();
  const start = hexToOklch(first);
  const end = hexToOklch(second);
  let hueDelta = end.h - start.h;
  if (hueDelta > 180) hueDelta -= 360;
  if (hueDelta < -180) hueDelta += 360;
  return oklchToHex({
    l: start.l + (end.l - start.l) * ratio,
    c: start.c + (end.c - start.c) * ratio,
    h: (start.h + hueDelta * ratio + 360) % 360,
  });
};

const rgbaForHex = (color: string, alpha: number): string => {
  const [red, green, blue] = hexToRgb(color).map((channel) => Math.round(channel * 255));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

export const getWindRosePeakHoldPalette = (
  theme: WindRoseThemeVariant,
  bankIndex: WindRosePeakHoldBankIndex,
): WindRosePeakHoldPalette => {
  const color = PEAK_HOLD_COLORS[theme][bankIndex];
  const isLight = theme === 'light';
  const muted = isLight
    ? {
      text: 'rgba(67, 83, 91, 0.58)',
      border: 'rgba(67, 83, 91, 0.24)',
      background: 'rgba(67, 83, 91, 0.035)',
    }
    : {
      text: 'rgba(184, 202, 210, 0.60)',
      border: 'rgba(184, 202, 210, 0.25)',
      background: 'rgba(184, 202, 210, 0.045)',
    };
  return {
    stroke: color,
    glow: rgbaForHex(color, isLight ? 0.16 : 0.24),
    activeText: color,
    activeBorder: rgbaForHex(color, isLight ? 0.82 : 0.88),
    activeBackground: rgbaForHex(color, isLight ? 0.11 : 0.14),
    mutedText: muted.text,
    mutedBorder: muted.border,
    mutedBackground: muted.background,
  };
};

export const getWindRosePaletteForSpeed = (
  windSpeed: number | null,
  theme: WindRoseThemeVariant = 'graphite',
): WindRosePalette => {
  const speed = windSpeed === null || !Number.isFinite(windSpeed) ? 0 : Math.max(0, windSpeed);
  const stops = COLOR_STOPS[theme];
  const upperIndex = stops.findIndex((stop) => speed <= stop.speed);
  const resolvedUpperIndex = upperIndex === -1 ? stops.length - 1 : upperIndex;
  const upper = stops[resolvedUpperIndex];
  const lower = stops[Math.max(0, resolvedUpperIndex - 1)];
  const span = Math.max(upper.speed - lower.speed, Number.EPSILON);
  const primary = interpolateOklch(lower.color, upper.color, (speed - lower.speed) / span);
  const primaryOklch = hexToOklch(primary);
  const highlight = oklchToHex({
    ...primaryOklch,
    l: clamp(primaryOklch.l + WIND_ROSE_HIGHLIGHT_LIGHTNESS_DELTA),
  });
  // A bright glow reads as emitted light on dark surfaces. On a near-white
  // surface it disappears into the background, so retain the same hue and
  // physical blur model while shifting only the glow color deeper.
  const glowLightnessDelta = theme === 'light'
    ? WIND_ROSE_LIGHT_GLOW_LIGHTNESS_DELTA
    : WIND_ROSE_DARK_GLOW_LIGHTNESS_DELTA;
  const glowColor = oklchToHex({
    l: clamp(primaryOklch.l + glowLightnessDelta),
    c: primaryOklch.c * WIND_ROSE_GLOW_CHROMA_MULTIPLIER,
    h: primaryOklch.h,
  });
  return {
    primary,
    highlight,
    glow: rgbaForHex(glowColor, WIND_ROSE_GLOW_ALPHA),
    minimumStrokeAlpha: WIND_ROSE_MINIMUM_STROKE_ALPHA,
    glowBlurRatio: WIND_ROSE_GLOW_BLUR_RATIO,
    innerGlowBlurRatio: WIND_ROSE_INNER_GLOW_BLUR_RATIO,
    innerGlowOpacity: WIND_ROSE_INNER_GLOW_OPACITY,
    coreWidthRatio: WIND_ROSE_CORE_WIDTH_RATIO,
    coreOpacity: WIND_ROSE_CORE_OPACITY,
  };
};

export const getWindRoseSurfacePalette = (theme: WindRoseThemeVariant): WindRoseSurfacePalette =>
  SURFACES[theme];

export const resolveWindRoseThemeVariant = (themeIndex: number): WindRoseThemeVariant => {
  return getUlsaThemeIdFromIndex(themeIndex) ?? 'light';
};

export const getRelativeLuminance = (color: string): number => {
  const [red, green, blue] = hexToRgb(color).map(srgbToLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

export const getContrastRatio = (first: string, second: string): number => {
  const firstLuminance = getRelativeLuminance(first);
  const secondLuminance = getRelativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
};

export const WIND_ROSE_COLOR_STOPS = COLOR_STOPS;
export const WIND_ROSE_PEAK_HOLD_COLORS = PEAK_HOLD_COLORS;
