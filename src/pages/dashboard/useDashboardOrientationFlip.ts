import { useCallback, useEffect, useState } from 'react';
import { readBrowserScreenOrientation, subscribeBrowserScreenOrientation } from './browserScreenOrientation';
import {
  isNativeDeviceOrientationAutoFlipAllowed,
  type NativeDeviceOrientationDetail,
} from './nativeDeviceOrientation';
import { createUpsideDownPopoverEvent } from './upsideDownPopover';

export const useDashboardOrientationFlip = () => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isNativeUpsideDown, setIsNativeUpsideDown] = useState(false);
  const [isBrowserReversePortrait, setIsBrowserReversePortrait] = useState(false);

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

    const handleNativeOrientation = (event: Event) => {
      applyNativeOrientation((event as CustomEvent<NativeDeviceOrientationDetail>).detail);
    };

    window.addEventListener('ulsaNativeDeviceOrientation', handleNativeOrientation);
    return () => {
      window.removeEventListener('ulsaNativeDeviceOrientation', handleNativeOrientation);
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
  const flipButtonLabel = isNativeUpsideDown
    ? '上下逆さ自動検出中'
    : cssFlipSuppressedByBrowserOrientation
      ? '端末回転を優先中'
      : isFlipped
        ? '画面反転を解除'
        : '画面を上下反転';

  useEffect(() => {
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
    flipButtonLabel,
    isUpsideDown,
    toggleFlip,
  };
};
