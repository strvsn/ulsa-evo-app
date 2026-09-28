import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { IBLEAdapter } from '../../services/ble';
import type { LEDWindReactiveConfig, LEDWindReactiveStatus } from '../../types/ble';
import type { BLEConnectionState } from './types';

type UseBLELedWindReactiveControlOptions = {
  adapterRef: MutableRefObject<IBLEAdapter | null>;
  connectionState: BLEConnectionState;
  setError: (value: string | null) => void;
};

export const useBLELedWindReactiveControl = ({
  adapterRef,
  connectionState,
  setError,
}: UseBLELedWindReactiveControlOptions) => {
  const [ledWindReactiveStatus, setLedWindReactiveStatus] = useState<LEDWindReactiveStatus | null>(null);
  const [ledWindReactiveSupported, setLedWindReactiveSupported] = useState<boolean | null>(null);
  const [ledWindReactiveBusy, setLedWindReactiveBusy] = useState(false);
  const refreshInFlightRef = useRef(false);
  const operationInFlightRef = useRef(false);
  const pendingConfigRef = useRef<LEDWindReactiveConfig | null>(null);

  const applyStatus = useCallback((status: LEDWindReactiveStatus | null) => {
    setLedWindReactiveStatus(status);
    setLedWindReactiveSupported(status !== null);
  }, []);

  const refreshLedWindReactive = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected' || refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    try {
      applyStatus(await adapter.getLedWindReactive());
    } catch (error) {
      console.error('LED風速連動設定の取得エラー:', error);
      applyStatus(null);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [adapterRef, applyStatus, connectionState]);

  const setLedWindReactive = useCallback(async (config: LEDWindReactiveConfig) => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected') return;

    pendingConfigRef.current = config;
    if (operationInFlightRef.current) return;

    operationInFlightRef.current = true;
    setLedWindReactiveBusy(true);
    setError(null);
    try {
      while (pendingConfigRef.current !== null) {
        const nextConfig = pendingConfigRef.current;
        pendingConfigRef.current = null;
        const status = await adapter.setLedWindReactive(nextConfig);
        applyStatus(status);
        if (!status) {
          pendingConfigRef.current = null;
          setError('LED風速連動は未対応です。ESP32 firmwareを確認してください');
          return;
        }
        if (status.result !== 'ok') {
          pendingConfigRef.current = null;
          setError(`LED風速連動設定が完了しませんでした: ${status.result}`);
          return;
        }
      }
    } catch (error) {
      pendingConfigRef.current = null;
      console.error('LED風速連動設定エラー:', error);
      setError(error instanceof Error ? error.message : 'LED風速連動設定に失敗しました');
    } finally {
      operationInFlightRef.current = false;
      setLedWindReactiveBusy(false);
    }
  }, [adapterRef, applyStatus, connectionState, setError]);

  useEffect(() => {
    if (connectionState === 'connected') {
      void refreshLedWindReactive();
      return;
    }
    pendingConfigRef.current = null;
    setLedWindReactiveBusy(false);
    setLedWindReactiveStatus(null);
    setLedWindReactiveSupported(null);
  }, [connectionState, refreshLedWindReactive]);

  return {
    ledWindReactiveStatus,
    ledWindReactiveSupported,
    ledWindReactiveBusy,
    refreshLedWindReactive,
    setLedWindReactive,
  };
};
