import { useEffect } from 'react';

export type NativeScreenMetricsDetail = {
  screenWidth?: number;
  screenHeight?: number;
  screenScale?: number;
  screenCornerRadius?: number;
  safeAreaInsets?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  userInterfaceIdiom?: string;
  source?: string;
};

declare global {
  interface Window {
    __ULSA_NATIVE_SCREEN_METRICS?: NativeScreenMetricsDetail;
  }
}

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const estimateScreenCornerRadius = () => {
  if (typeof window === 'undefined') {
    return 32;
  }

  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const minSide = Math.min(width || 0, height || 0);

  if (!Number.isFinite(minSide) || minSide <= 0) {
    return 32;
  }

  return Math.round(clampNumber(minSide * 0.105, 24, 48));
};

const resolveScreenCornerRadius = (detail: NativeScreenMetricsDetail | undefined) => {
  const nativeRadius = detail?.screenCornerRadius;
  if (typeof nativeRadius === 'number' && Number.isFinite(nativeRadius) && nativeRadius > 0) {
    return Math.round(clampNumber(nativeRadius, 18, 72));
  }

  return estimateScreenCornerRadius();
};

export const useNativeScreenMetrics = () => {
  useEffect(() => {
    const root = document.documentElement;
    const applyScreenMetrics = (detail: NativeScreenMetricsDetail | undefined) => {
      root.style.setProperty('--device-screen-corner-radius', `${resolveScreenCornerRadius(detail)}px`);
    };

    applyScreenMetrics(window.__ULSA_NATIVE_SCREEN_METRICS);

    const handleNativeScreenMetrics = (event: Event) => {
      applyScreenMetrics((event as CustomEvent<NativeScreenMetricsDetail>).detail);
    };
    const handleViewportResize = () => {
      applyScreenMetrics(window.__ULSA_NATIVE_SCREEN_METRICS);
    };

    window.addEventListener('ulsaNativeScreenMetrics', handleNativeScreenMetrics);
    window.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('resize', handleViewportResize);
    return () => {
      window.removeEventListener('ulsaNativeScreenMetrics', handleNativeScreenMetrics);
      window.removeEventListener('resize', handleViewportResize);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      root.style.removeProperty('--device-screen-corner-radius');
    };
  }, []);
};
