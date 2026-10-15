import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { readBrowserScreenOrientation, subscribeBrowserScreenOrientation } from './browserScreenOrientation';
import {
  isNativeDeviceOrientationAutoFlipAllowed,
  getNativeInterfaceRotationDegrees,
  type NativeDeviceOrientationDetail,
} from './nativeDeviceOrientation';
import { createUpsideDownPopoverEvent } from './upsideDownPopover';
import type { NativeScreenMetricsDetail } from './useNativeScreenMetrics';
import type { Swiper as SwiperType } from 'swiper';
import { updateSwiperTouchRatio } from './swiperRuntime';

export const useDashboardOrientationFlip = (swiperInstance: SwiperType | null = null) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isNativeUpsideDown, setIsNativeUpsideDown] = useState(false);
  const [isBrowserReversePortrait, setIsBrowserReversePortrait] = useState(false);
  const [nativeScreenRotationDegrees, setNativeScreenRotationDegrees] = useState(0);

  const toggleFlip = useCallback(() => {
    setIsFlipped(prev => !prev);
  }, []);

  useEffect(() => {
    const applyNativeOrientation = (detail: NativeDeviceOrientationDetail | undefined) => {
      if (!isNativeDeviceOrientationAutoFlipAllowed()) {
        setIsNativeUpsideDown(false);
        return;
      }

      setIsNativeUpsideDown(detail?.upsideDown === true);
    };

    applyNativeOrientation(window.__ULSA_NATIVE_DEVICE_ORIENTATION);
    const applyScreenMetrics = (detail: NativeScreenMetricsDetail | undefined) => {
      setNativeScreenRotationDegrees(isNativeDeviceOrientationAutoFlipAllowed()
        ? getNativeInterfaceRotationDegrees(detail?.interfaceRotationDegrees)
        : 0);
    };
    applyScreenMetrics(window.__ULSA_NATIVE_SCREEN_METRICS);

    const handleNativeOrientation = (event: Event) => {
      applyNativeOrientation((event as CustomEvent<NativeDeviceOrientationDetail>).detail);
    };
    const handleScreenMetrics = (event: Event) => {
      applyScreenMetrics((event as CustomEvent<NativeScreenMetricsDetail>).detail);
    };

    window.addEventListener('ulsaNativeDeviceOrientation', handleNativeOrientation);
    window.addEventListener('ulsaNativeScreenMetrics', handleScreenMetrics);
    return () => {
      window.removeEventListener('ulsaNativeDeviceOrientation', handleNativeOrientation);
      window.removeEventListener('ulsaNativeScreenMetrics', handleScreenMetrics);
    };
  }, []);

  useEffect(() => {
    const updateBrowserScreenOrientation = () => {
      setIsBrowserReversePortrait(readBrowserScreenOrientation().reversePortrait);
    };

    updateBrowserScreenOrientation();
    return subscribeBrowserScreenOrientation(updateBrowserScreenOrientation);
  }, []);

  const cssFlipRequested = isFlipped || isNativeUpsideDown;
  const cssFlipSuppressedByBrowserOrientation =
    cssFlipRequested &&
    !isNativeDeviceOrientationAutoFlipAllowed() &&
    isBrowserReversePortrait;
  const isUpsideDown = cssFlipRequested && !cssFlipSuppressedByBrowserOrientation;
  const compassScreenRotationDegrees = isNativeDeviceOrientationAutoFlipAllowed()
    ? (nativeScreenRotationDegrees + (isUpsideDown ? 180 : 0)) % 360
    : 0;
  const swiperTouchRatio = isUpsideDown ? -1 : 1;
  useLayoutEffect(() => {
    updateSwiperTouchRatio(swiperInstance, swiperTouchRatio);
  }, [swiperInstance, swiperTouchRatio]);
  const flipButtonLabel = isNativeUpsideDown
    ? '上下逆さ自動検出中'
    : cssFlipSuppressedByBrowserOrientation
      ? '端末回転を優先中'
      : isFlipped
        ? '画面反転を解除'
        : '画面を上下反転';

  useLayoutEffect(() => {
    const ionApp = document.querySelector('ion-app') as HTMLElement | null;
    if (!ionApp) return;

    ionApp.classList.toggle('app-manual-upside-down', isUpsideDown);
    return () => {
      ionApp.classList.remove('app-manual-upside-down');
    };
  }, [isUpsideDown]);

  useEffect(() => {
    const handlePopoverWillPresent = (event: Event) => {
      const ionApp = document.querySelector('ion-app');
      if (!ionApp?.classList.contains('app-manual-upside-down') ||
          ionApp.classList.contains('app-chart-fullscreen')) return;

      const popover = event.target as (HTMLElement & { event?: Event }) | null;
      if (!popover?.event) return;
      const correctedEvent = createUpsideDownPopoverEvent(
        popover.event,
        window.innerWidth,
        window.innerHeight,
      );
      if (correctedEvent) popover.event = correctedEvent;
    };

    document.addEventListener('ionPopoverWillPresent', handlePopoverWillPresent);
    return () => document.removeEventListener('ionPopoverWillPresent', handlePopoverWillPresent);
  }, []);

  return {
    compassScreenRotationDegrees,
    swiperTouchRatio,
    flipButtonLabel,
    isUpsideDown,
    toggleFlip,
  };
};
