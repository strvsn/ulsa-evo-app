import { isNativeIosDevice } from '../../services/nativeRuntime';

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
  return isNativeIosDevice();
};

/** Clockwise bearing of UIKit's screen top relative to the phone's hardware top. */
export const getNativeInterfaceRotationDegrees = (angle?: number): number => {
  return angle !== undefined && [0, 90, 180, 270].includes(angle) ? angle : 0;
};
