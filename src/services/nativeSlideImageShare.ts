import { Capacitor, registerPlugin } from '@capacitor/core';

export type SlideImageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface NativeSlideImageSharePlugin {
  share(rect: SlideImageRect): Promise<{ completed: boolean }>;
}

const UlsaSlideImageShare = registerPlugin<NativeSlideImageSharePlugin>('UlsaSlideImageShare');

export const isNativeSlideImageShareAvailable = (): boolean => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
};

export const shareNativeSlideImage = (rect: SlideImageRect): Promise<{ completed: boolean }> => {
  if (!isNativeSlideImageShareAvailable()) {
    return Promise.reject(new Error('画像共有はiOSアプリで利用できます'));
  }
  return UlsaSlideImageShare.share(rect);
};
