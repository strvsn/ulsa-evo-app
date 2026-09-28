import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeChartFullscreenPlugin {
  setLandscape(options: { enabled: boolean }): Promise<{ landscape: boolean; geometryUpdated?: boolean }>;
}

type OrientationController = {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

const UlsaChartFullscreen = registerPlugin<NativeChartFullscreenPlugin>('UlsaChartFullscreen');

const getOrientationController = (): OrientationController | undefined =>
  window.screen?.orientation as OrientationController | undefined;

export const isNativeChartFullscreenAvailable = (): boolean => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
};

/**
 * Native iOS uses a registered bridge to temporarily allow landscape only for
 * the graph viewer. Browsers use their best available fullscreen/orientation
 * APIs and retain the in-app overlay when either API is unavailable.
 */
export const enterChartFullscreen = async (): Promise<void> => {
  if (isNativeChartFullscreenAvailable()) {
    await UlsaChartFullscreen.setLandscape({ enabled: true });
    return;
  }

  try {
    await document.documentElement.requestFullscreen?.();
  } catch {
    // Fullscreen requires browser support and may be blocked by user settings.
  }

  try {
    await getOrientationController()?.lock?.('landscape');
  } catch {
    // The full graph overlay remains usable when the browser rejects a lock.
  }
};

export const exitChartFullscreen = async (): Promise<void> => {
  if (isNativeChartFullscreenAvailable()) {
    await UlsaChartFullscreen.setLandscape({ enabled: false });
    return;
  }

  try {
    getOrientationController()?.unlock?.();
  } catch {
    // Some browsers expose no unlock API.
  }

  try {
    await document.exitFullscreen?.();
  } catch {
    // The browser may already have exited fullscreen.
  }
};
