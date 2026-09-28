import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { WindRoseThemeVariant } from '../components/charts/windRoseTheme';
import type { WindSpeedUnit } from '../utils/windSpeedConverter';

export type WindPipDataState = 'waiting' | 'live' | 'stale' | 'disconnected';
export type WindPipLogState = 'disabled' | 'ready' | 'recording' | 'error';

export type WindPipSnapshot = {
  windSpeedMps: number | null;
  windDirectionDegrees: number | null;
  temperatureCelsius: number | null;
  soundSpeedMps: number | null;
  headingSpeedMps: number | null;
  windSpeedAverage10mMps: number | null;
  windSpeedUnit: WindSpeedUnit;
  dataState: WindPipDataState;
  cardLogState: WindPipLogState;
  cardLogDetail?: string;
  appLogState: WindPipLogState;
  appLogDetail?: string;
  themeVariant: WindRoseThemeVariant;
  /** Compatibility field for native shells from the previous bridge version. */
  isLightTheme: boolean;
  capturedAtMs: number;
};

export type WindPipSupport = {
  supported: boolean;
  possible: boolean;
  active: boolean;
};

export type WindPipState = WindPipSupport & {
  phase: 'unavailable' | 'ready' | 'starting' | 'active' | 'stopping' | 'failed';
  error?: string;
};

interface NativeWindPipPlugin {
  isSupported(): Promise<WindPipSupport>;
  start(snapshot: WindPipSnapshot): Promise<WindPipState>;
  update(snapshot: WindPipSnapshot): Promise<WindPipState>;
  stop(): Promise<WindPipState>;
  addListener(eventName: 'stateChanged', listenerFunc: (state: WindPipState) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'restoreRequested', listenerFunc: () => void): Promise<PluginListenerHandle>;
}

const UlsaWindPip = registerPlugin<NativeWindPipPlugin>('UlsaWindPip');

export const isNativeWindPipAvailable = (): boolean => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
};

const unavailableSupport: WindPipSupport = {
  supported: false,
  possible: false,
  active: false,
};

export const getNativeWindPipSupport = async (): Promise<WindPipSupport> => {
  if (!isNativeWindPipAvailable()) return unavailableSupport;
  return UlsaWindPip.isSupported();
};

export const startNativeWindPip = async (snapshot: WindPipSnapshot): Promise<WindPipState> => {
  if (!isNativeWindPipAvailable()) {
    throw new Error('Picture in PictureはiOSアプリでのみ利用できます');
  }
  return UlsaWindPip.start(snapshot);
};

export const updateNativeWindPip = async (snapshot: WindPipSnapshot): Promise<WindPipState | null> => {
  if (!isNativeWindPipAvailable()) return null;
  return UlsaWindPip.update(snapshot);
};

export const stopNativeWindPip = async (): Promise<WindPipState | null> => {
  if (!isNativeWindPipAvailable()) return null;
  return UlsaWindPip.stop();
};

export const subscribeToNativeWindPipState = async (
  listener: (state: WindPipState) => void,
): Promise<PluginListenerHandle | null> => {
  if (!isNativeWindPipAvailable()) return null;
  return UlsaWindPip.addListener('stateChanged', listener);
};

export const subscribeToNativeWindPipRestore = async (
  listener: () => void,
): Promise<PluginListenerHandle | null> => {
  if (!isNativeWindPipAvailable()) return null;
  return UlsaWindPip.addListener('restoreRequested', listener);
};
