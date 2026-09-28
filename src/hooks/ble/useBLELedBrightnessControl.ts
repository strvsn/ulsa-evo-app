import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { IBLEAdapter } from '../../services/ble';
import type { LEDBrightnessStatus } from '../../types/ble';
import type { BLEConnectionState } from './types';

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type UseBLELedBrightnessControlOptions = {
  adapterRef: MutableRefObject<IBLEAdapter | null>;
  connectionState: BLEConnectionState;
  updateLedBrightnessStatus: (status: LEDBrightnessStatus | null) => void;
  setLedBrightnessBusy: StateSetter<boolean>;
  setError: StateSetter<string | null>;
};

export const useBLELedBrightnessControl = ({
  adapterRef,
  connectionState,
  updateLedBrightnessStatus,
  setLedBrightnessBusy,
  setError,
}: UseBLELedBrightnessControlOptions) => {
  const refreshInFlightRef = useRef(false);
  const operationInFlightRef = useRef(false);
  const pendingValueRef = useRef<number | null>(null);

  const refreshLedBrightness = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected' || refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    try {
      updateLedBrightnessStatus(await adapter.getLedBrightness());
    } catch (err) {
      console.error('LED輝度取得エラー:', err);
      updateLedBrightnessStatus(null);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [adapterRef, connectionState, updateLedBrightnessStatus]);

  const setLedBrightness = useCallback(async (brightness: number) => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected') return;

    // A range input can produce several values in one gesture. Keep only the
    // newest pending value and write sequentially so the device ends at the
    // value currently selected by the user.
    pendingValueRef.current = brightness;
    if (operationInFlightRef.current) return;

    operationInFlightRef.current = true;
    setLedBrightnessBusy(true);
    setError(null);
    try {
      while (pendingValueRef.current !== null) {
        const nextBrightness = pendingValueRef.current;
        pendingValueRef.current = null;
        const status = await adapter.setLedBrightness(nextBrightness);
        updateLedBrightnessStatus(status);
        if (!status) {
          pendingValueRef.current = null;
          setError('LED輝度制御に対応していません。ESP32 firmwareのLED Brightness Characteristicを確認してください');
          return;
        }
      }
    } catch (err) {
      pendingValueRef.current = null;
      console.error('LED輝度設定エラー:', err);
      setError(err instanceof Error ? err.message : 'LED輝度設定に失敗しました');
    } finally {
      operationInFlightRef.current = false;
      setLedBrightnessBusy(false);
    }
  }, [adapterRef, connectionState, setError, setLedBrightnessBusy, updateLedBrightnessStatus]);

  return { refreshLedBrightness, setLedBrightness };
};
