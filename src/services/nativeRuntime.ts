import { Capacitor } from '@capacitor/core';

export type NativeRuntime = {
  isIOSAppOnMac: boolean;
};

declare global {
  interface Window {
    /** Published by the native shell at document start, before the app runs. */
    __ULSA_NATIVE_RUNTIME?: NativeRuntime;
  }
}

export const isNativeIosApp = (): boolean => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
};

/** Mac's native BLE/HTTP still use the iOS adapter; only device-only APIs differ. */
export const isNativeIosDevice = (): boolean => (
  isNativeIosApp()
  && typeof window !== 'undefined'
  && window.__ULSA_NATIVE_RUNTIME?.isIOSAppOnMac === false
);
