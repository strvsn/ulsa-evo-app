import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type TrueHeadingUpdate = {
  trueHeading: number | null;
  headingAccuracy: number | null;
  available: boolean;
  authorization: 'authorized' | 'denied' | 'restricted' | 'notDetermined' | 'unsupported';
};

export type TrueHeadingStartOptions = {
  navigationMode?: boolean;
};

export type TrueNavigationUpdate = {
  trueHeading: number | null;
  headingAccuracy: number | null;
  headingTimestamp: number | null;
  speed: number | null;
  speedAccuracy: number | null;
  course: number | null;
  courseAccuracy: number | null;
  horizontalAccuracy: number | null;
  locationTimestamp: number | null;
  accuracyAuthorization: 'full' | 'reduced' | 'unsupported';
  authorization: TrueHeadingUpdate['authorization'];
};

interface NativeTrueHeadingPlugin {
  start(options?: TrueHeadingStartOptions): Promise<TrueHeadingUpdate>;
  stop(): Promise<{ stopped: boolean }>;
  addListener(eventName: 'headingChanged', listenerFunc: (update: TrueHeadingUpdate) => void): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'navigationChanged',
    listenerFunc: (update: TrueNavigationUpdate) => void,
  ): Promise<PluginListenerHandle>;
}

const UlsaTrueHeading = registerPlugin<NativeTrueHeadingPlugin>('UlsaTrueHeading');

export const isNativeTrueHeadingAvailable = (): boolean => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
};

export const startTrueHeading = async (
  options?: TrueHeadingStartOptions,
): Promise<TrueHeadingUpdate> => {
  if (!isNativeTrueHeadingAvailable()) {
    return {
      trueHeading: null,
      headingAccuracy: null,
      available: false,
      authorization: 'unsupported',
    };
  }
  return options ? UlsaTrueHeading.start(options) : UlsaTrueHeading.start();
};

export const stopTrueHeading = async (): Promise<void> => {
  if (!isNativeTrueHeadingAvailable()) return;
  await UlsaTrueHeading.stop();
};

export const subscribeToTrueHeading = async (
  listener: (update: TrueHeadingUpdate) => void,
): Promise<PluginListenerHandle | null> => {
  if (!isNativeTrueHeadingAvailable()) return null;
  return UlsaTrueHeading.addListener('headingChanged', listener);
};

export const subscribeToTrueNavigation = async (
  listener: (update: TrueNavigationUpdate) => void,
): Promise<PluginListenerHandle | null> => {
  if (!isNativeTrueHeadingAvailable()) return null;
  return UlsaTrueHeading.addListener('navigationChanged', listener);
};
