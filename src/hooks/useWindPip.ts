import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getNativeWindPipSupport,
  isNativeWindPipAvailable,
  startNativeWindPip,
  stopNativeWindPip,
  subscribeToNativeWindPipRestore,
  subscribeToNativeWindPipState,
  updateNativeWindPip,
  type WindPipDataState,
  type WindPipLogState,
  type WindPipSnapshot,
  type WindPipState,
} from '../services/nativeWindPip';
import type { WindSpeedUnit } from '../utils/windSpeedConverter';
import type { WindRoseThemeVariant } from '../components/charts/windRoseTheme';

type UseWindPipOptions = {
  isConnected: boolean;
  dataState: WindPipDataState;
  windSpeed: number | null;
  windDirection: number;
  temperature: number | null;
  soundSpeed: number | null;
  headingSpeed: number | null;
  windSpeedAverage10m: number | null;
  windSpeedUnit: WindSpeedUnit;
  cardLogState: WindPipLogState;
  cardLogDetail?: string;
  appLogState: WindPipLogState;
  appLogDetail?: string;
  themeVariant: WindRoseThemeVariant;
  sampleTimestampMs?: number | null;
  onRestoreRequested?: () => void;
};

const unavailableState: WindPipState = {
  supported: false,
  possible: false,
  active: false,
  phase: 'unavailable',
};

export const useWindPip = ({
  isConnected,
  dataState,
  windSpeed,
  windDirection,
  temperature,
  soundSpeed,
  headingSpeed,
  windSpeedAverage10m,
  windSpeedUnit,
  cardLogState,
  cardLogDetail,
  appLogState,
  appLogDetail,
  themeVariant,
  sampleTimestampMs = null,
  onRestoreRequested,
}: UseWindPipOptions) => {
  const nativeAvailable = isNativeWindPipAvailable();
  const [state, setState] = useState<WindPipState>(unavailableState);
  const [error, setError] = useState<string | null>(null);
  const hasLiveData = isConnected
    && dataState === 'live'
    && windSpeed !== null
    && Number.isFinite(windSpeed)
    && Number.isFinite(windDirection);

  const snapshot = useMemo<WindPipSnapshot>(() => ({
    windSpeedMps: hasLiveData ? Math.max(0, windSpeed) : null,
    windDirectionDegrees: hasLiveData ? windDirection : null,
    temperatureCelsius: hasLiveData && temperature !== null && Number.isFinite(temperature)
      ? temperature
      : null,
    soundSpeedMps: hasLiveData && soundSpeed !== null && Number.isFinite(soundSpeed)
      ? soundSpeed
      : null,
    headingSpeedMps: hasLiveData && headingSpeed !== null && Number.isFinite(headingSpeed)
      ? headingSpeed
      : null,
    windSpeedAverage10mMps: hasLiveData
      && windSpeedAverage10m !== null
      && Number.isFinite(windSpeedAverage10m)
      ? Math.max(0, windSpeedAverage10m)
      : null,
    windSpeedUnit,
    dataState: !isConnected ? 'disconnected' : dataState,
    cardLogState,
    ...(cardLogDetail ? { cardLogDetail } : {}),
    appLogState,
    ...(appLogDetail ? { appLogDetail } : {}),
    themeVariant,
    isLightTheme: themeVariant === 'light',
    capturedAtMs: sampleTimestampMs ?? Date.now(),
  }), [
    appLogDetail,
    appLogState,
    dataState,
    hasLiveData,
    headingSpeed,
    isConnected,
    sampleTimestampMs,
    cardLogDetail,
    cardLogState,
    soundSpeed,
    temperature,
    themeVariant,
    windDirection,
    windSpeed,
    windSpeedAverage10m,
    windSpeedUnit,
  ]);

  useEffect(() => {
    if (!nativeAvailable) return undefined;

    let disposed = false;
    let stateHandle: Awaited<ReturnType<typeof subscribeToNativeWindPipState>> = null;
    let restoreHandle: Awaited<ReturnType<typeof subscribeToNativeWindPipRestore>> = null;

    const reconcileSupport = () => {
      if (document.visibilityState !== 'visible') return;
      void getNativeWindPipSupport()
      .then((support) => {
        if (disposed) return;
        setState((current) => {
          if (current.phase === 'starting' && !support.active) {
            return { ...current, supported: support.supported, possible: support.possible };
          }
          return {
            ...support,
            phase: support.supported ? (support.active ? 'active' : 'ready') : 'unavailable',
          };
        });
      })
      .catch((supportError: unknown) => {
        if (!disposed) setError(supportError instanceof Error ? supportError.message : 'PiPを初期化できません');
      });
    };

    reconcileSupport();
    document.addEventListener('visibilitychange', reconcileSupport);
    window.addEventListener('pageshow', reconcileSupport);

    void subscribeToNativeWindPipState((nextState) => {
      if (disposed) return;
      setState(nextState);
      setError(nextState.error ?? null);
    }).then((handle) => {
      if (disposed) {
        void handle?.remove();
      } else {
        stateHandle = handle;
      }
    });

    void subscribeToNativeWindPipRestore(() => {
      if (!disposed) onRestoreRequested?.();
    }).then((handle) => {
      if (disposed) {
        void handle?.remove();
      } else {
        restoreHandle = handle;
      }
    });

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', reconcileSupport);
      window.removeEventListener('pageshow', reconcileSupport);
      void stateHandle?.remove();
      void restoreHandle?.remove();
    };
  }, [nativeAvailable, onRestoreRequested]);

  useEffect(() => {
    if (!nativeAvailable || !state.supported || (!state.active && state.phase !== 'starting')) return;
    void updateNativeWindPip(snapshot).catch((updateError: unknown) => {
      if (state.active) setError(updateError instanceof Error ? updateError.message : 'PiP表示を更新できません');
    });
  }, [nativeAvailable, snapshot, state.active, state.phase, state.supported]);

  const toggle = useCallback(async () => {
    setError(null);
    try {
      if (!state.active) {
        setState((current) => ({ ...current, phase: 'starting' }));
      }
      const nextState = state.active
        ? await stopNativeWindPip()
        : await startNativeWindPip(snapshot);
      if (nextState) setState(nextState);
    } catch (toggleError) {
      setState((current) => ({ ...current, active: false, phase: 'failed' }));
      setError(toggleError instanceof Error ? toggleError.message : 'PiPを開始できません');
    }
  }, [snapshot, state.active]);

  return {
    available: nativeAvailable && state.supported,
    active: state.active,
    possible: state.possible,
    busy: state.phase === 'starting' || state.phase === 'stopping',
    // isPictureInPicturePossible は表示レイヤー準備中に一時的に false になる。
    // 対応端末かつLIVEなら明示タップを許可し、native側で開始可能になるまで待つ。
    canStart: hasLiveData && state.supported,
    error,
    toggle,
  };
};
