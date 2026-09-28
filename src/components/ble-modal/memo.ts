import type { BLEModalProps } from './types';

export const areBLEModalPropsEqual = (prev: BLEModalProps, next: BLEModalProps): boolean => {
  if (prev.isOpen || next.isOpen) {
    return false;
  }

  return (
    prev.onDismiss === next.onDismiss &&
    prev.themeGradient === next.themeGradient &&
    prev.themeIsLight === next.themeIsLight
  );
};
