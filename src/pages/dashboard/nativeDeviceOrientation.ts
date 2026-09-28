import { Capacitor } from '@capacitor/core';

export type NativeDeviceOrientationDetail = {
  orientation?: string;
  upsideDown?: boolean;
  source?: string;
};

declare global {
  interface Window {
    __ULSA_NATIVE_DEVICE_ORIENTATION?: NativeDeviceOrientationDetail;
  }
}

export const isNativeDeviceOrientationAutoFlipAllowed = (): boolean => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
};
