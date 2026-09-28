import type { BLESettingsDrawerProps } from './types';

export const areBLESettingsDrawerPropsEqual = (
  prev: BLESettingsDrawerProps,
  next: BLESettingsDrawerProps
): boolean => {
  if (prev.isOpen || next.isOpen) return false;
  return (
    prev.onDismiss === next.onDismiss &&
    prev.currentThemeIndex === next.currentThemeIndex &&
    prev.onThemeChange === next.onThemeChange &&
    prev.themeGradient === next.themeGradient &&
    prev.themeIsLight === next.themeIsLight
  );
};
