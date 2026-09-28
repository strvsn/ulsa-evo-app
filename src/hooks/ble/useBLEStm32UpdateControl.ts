import { useCallback, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { IBLEAdapter } from '../../services/ble';
import type {
  Stm32UpdateControlOp,
  Stm32UpdateControlSessionBinding,
  Stm32UpdateControlStatus,
} from '../../types/ble';
import { isExpectedActivatePortalDisconnect } from './activatePortalDisconnect';
import type { BLEConnectionState } from './types';

const canTreatActivatePortalStatusAsTransitioning = (status: Stm32UpdateControlStatus): boolean =>
  status.result === 'queued' || (status.result === 'busy' && status.portalActive && status.hasCredentials);

interface UseBLEStm32UpdateControlArgs {
  adapterRef: MutableRefObject<IBLEAdapter | null>;
  connectionState: BLEConnectionState;
  setError: (value: string | null) => void;
}

export const useBLEStm32UpdateControl = ({
  adapterRef,
  connectionState,
  setError,
}: UseBLEStm32UpdateControlArgs) => {
  const [stm32UpdateControlStatus, setStm32UpdateControlStatus] =
    useState<Stm32UpdateControlStatus | null>(null);
  const [stm32UpdateControlBusy, setStm32UpdateControlBusy] = useState(false);
  const operationInFlightRef = useRef(false);

  const refreshStm32UpdateControlStatus = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected' || operationInFlightRef.current) return;

    operationInFlightRef.current = true;
    try {
      setStm32UpdateControlStatus(await adapter.getStm32UpdateControlStatus());
    } catch (err) {
      console.error('STM32 Update Controlステータス取得エラー:', err);
      setStm32UpdateControlStatus(null);
    } finally {
      operationInFlightRef.current = false;
    }
  }, [adapterRef, connectionState]);

  const writeStm32UpdateControl = useCallback(async (
    op: Stm32UpdateControlOp,
    binding?: Stm32UpdateControlSessionBinding
  ): Promise<Stm32UpdateControlStatus | null> => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected' || operationInFlightRef.current) {
      setError('デバイスが接続されていません');
      return null;
    }

    operationInFlightRef.current = true;
    try {
      setError(null);
      setStm32UpdateControlBusy(true);
      const status = await adapter.writeStm32UpdateControl(op, binding);
      if (!status) {
        if (op === 'activatePortal') return null;
        setStm32UpdateControlStatus(null);
        setError('STM32 Update Controlを取得できませんでした。ESP32 firmwareの対応状況を確認してください');
        return null;
      }

      setStm32UpdateControlStatus(status);
      if (status.result !== 'ok') {
        if (status.result === 'authorizationRequired') {
          return status;
        }
        if (op === 'activatePortal' && canTreatActivatePortalStatusAsTransitioning(status)) {
          return status;
        }
        setError(`STM32 Update Control操作が完了しませんでした: ${status.result}`);
      }
      return status;
    } catch (err) {
      if (isExpectedActivatePortalDisconnect(op, err)) {
        console.warn('STM32 Update Control activatePortal中のBLE切断をSoftAP起動遷移として扱います:', err);
        return null;
      }
      console.error('STM32 Update Control操作エラー:', err);
      setError(err instanceof Error ? err.message : 'STM32 Update Control操作に失敗しました');
      return null;
    } finally {
      setStm32UpdateControlBusy(false);
      operationInFlightRef.current = false;
    }
  }, [adapterRef, connectionState, setError]);

  return {
    stm32UpdateControlBusy,
    stm32UpdateControlStatus,
    refreshStm32UpdateControlStatus,
    writeStm32UpdateControl,
  };
};
