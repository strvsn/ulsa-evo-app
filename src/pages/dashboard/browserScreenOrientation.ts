type LegacyWindowOrientation = Window & {
  orientation?: number;
};

export type BrowserScreenOrientationSnapshot = {
  angle: number | null;
  reversePortrait: boolean;
  type: string | null;
};

export const readBrowserScreenOrientation = (): BrowserScreenOrientationSnapshot => {
  const orientation = window.screen?.orientation;
  const type = orientation?.type ?? null;
  const legacyAngle = (window as LegacyWindowOrientation).orientation;
  const angle = typeof orientation?.angle === 'number'
    ? orientation.angle
    : typeof legacyAngle === 'number'
      ? legacyAngle
      : null;

  return {
    angle,
    reversePortrait: type === 'portrait-secondary' || angle === 180 || angle === -180,
    type,
  };
};

export const subscribeBrowserScreenOrientation = (
  callback: () => void
): (() => void) => {
  const orientation = window.screen?.orientation;
  orientation?.addEventListener?.('change', callback);
  window.addEventListener('orientationchange', callback);

  return () => {
    orientation?.removeEventListener?.('change', callback);
    window.removeEventListener('orientationchange', callback);
  };
};
