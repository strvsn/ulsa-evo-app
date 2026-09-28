import { useEffect, useState } from 'react';
import {
  isNativeTrueHeadingAvailable,
  startTrueHeading,
  stopTrueHeading,
  subscribeToTrueHeading,
  type TrueHeadingUpdate,
} from '../services/nativeTrueHeading';

export type TrueHeadingStatus = 'off' | 'requesting' | 'ready' | 'lowAccuracy' | 'denied' | 'unavailable';

export interface TrueHeadingState {
  isSupported: boolean;
  status: TrueHeadingStatus;
  trueHeading: number | null;
  headingAccuracy: number | null;
}

const MAX_TRUE_HEADING_ACCURACY_DEGREES = 15;

const createState = (enabled: boolean): TrueHeadingState => ({
  isSupported: isNativeTrueHeadingAvailable(),
  status: enabled ? 'requesting' : 'off',
  trueHeading: null,
  headingAccuracy: null,
});

const resolveState = (update: TrueHeadingUpdate, enabled: boolean): TrueHeadingState => {
  const isSupported = update.authorization !== 'unsupported';
  const accuracy = update.headingAccuracy;
  const hasUsableHeading = update.available
    && update.trueHeading !== null
    && accuracy !== null
    && accuracy >= 0;

  if (!enabled) return { isSupported, status: 'off', trueHeading: null, headingAccuracy: null };
  if (update.authorization === 'denied') return { isSupported, status: 'denied', trueHeading: null, headingAccuracy: null };
  if (!hasUsableHeading) return { isSupported, status: isSupported ? 'requesting' : 'unavailable', trueHeading: null, headingAccuracy: null };
  if (accuracy > MAX_TRUE_HEADING_ACCURACY_DEGREES) {
    return {
      isSupported,
      status: 'lowAccuracy',
      // Keep rendering the live bearing and show its larger uncertainty as a
      // sector on the gauge. Suppressing the bearing would freeze the compass.
      trueHeading: update.trueHeading,
      headingAccuracy: accuracy,
    };
  }

  return {
    isSupported,
    status: 'ready',
    trueHeading: update.trueHeading,
    headingAccuracy: accuracy,
  };
};

/** Starts location and heading updates only while the iOS-only control is ON and visible. */
export const useTrueHeading = (enabled: boolean, isActive: boolean): TrueHeadingState => {
  const [state, setState] = useState<TrueHeadingState>(() => createState(enabled && isActive));

  useEffect(() => {
    const shouldRun = enabled && isActive;
    if (!shouldRun) {
      setState(createState(false));
      void stopTrueHeading();
      return undefined;
    }

    let disposed = false;
    let listenerHandle: Awaited<ReturnType<typeof subscribeToTrueHeading>> = null;
    setState(createState(true));

    const begin = async () => {
      listenerHandle = await subscribeToTrueHeading((update) => {
        if (!disposed) setState(resolveState(update, true));
      });
      const initial = await startTrueHeading();
      if (!disposed) setState(resolveState(initial, true));
    };
    void begin().catch(() => {
      if (!disposed) setState({
        isSupported: isNativeTrueHeadingAvailable(),
        status: 'unavailable',
        trueHeading: null,
        headingAccuracy: null,
      });
    });

    return () => {
      disposed = true;
      void listenerHandle?.remove();
      void stopTrueHeading();
    };
  }, [enabled, isActive]);

  return state;
};
