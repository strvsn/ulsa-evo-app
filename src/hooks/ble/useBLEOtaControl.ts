import { useCallback, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { IBLEAdapter } from '../../services/ble';
import type { OtaControlOp, OtaControlStatus } from '../../types/ble';
import { isExpectedActivatePortalDisconnect } from './activatePortalDisconnect';
import type { BLEConnectionState } from './types';

const canTreatActivatePortalStatusAsTransitioning = (status: OtaControlStatus): boolean =>
  status.result === 'queued' || (status.result === 'busy' && status.portalActive && status.hasCredentials);

interface UseBLEOtaControlArgs {
  adapterRef: MutableRefObject<IBLEAdapter | null>;
  connectionState: BLEConnectionState;
  setError: (value: string | null) => void;
}

export const useBLEOtaControl = ({
  adapterRef,
  connectionState,
  setError,
}: UseBLEOtaControlArgs) => {
  const [otaControlStatus, setOtaControlStatus] = useState<OtaControlStatus | null>(null);
  const [otaControlBusy, setOtaControlBusy] = useState(false);
  const operationInFlightRef = useRef(false);

  const refreshOtaControlStatus = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected' || operationInFlightRef.current) return;

    operationInFlightRef.current = true;
    try {
      setOtaControlStatus(await adapter.getOtaControlStatus());
    } catch (err) {
      console.error('OTA Controlステータス取得エラー:', err);
      setOtaControlStatus(null);
    } finally {
      operationInFlightRef.current = false;
    }
  }, [adapterRef, connectionState]);

  const writeOtaControl = useCallback(async (op: OtaControlOp): Promise<OtaControlStatus | null> => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected' || operationInFlightRef.current) {
      setError('デバイスが接続されていません');
      return null;
    }

    operationInFlightRef.current = true;
    try {
      setError(null);
      setOtaControlBusy(true);
      const status = await adapter.writeOtaControl(op);
      if (!status) {
        if (op === 'activatePortal') {
          return null;
        }
        setOtaControlStatus(null);
        setError('OTA Controlを取得できませんでした。ESP32 firmwareがOTA Controlに対応しているか確認してください');
        return null;
      } else if (status.result !== 'ok') {
        setOtaControlStatus(status);
        if (status.result === 'authorizationRequired') {
          return status;
        }
        if (op === 'activatePortal' && canTreatActivatePortalStatusAsTransitioning(status)) {
          return status;
        }
        setError(`OTA Control操作が完了しませんでした: ${status.result}`);
        return status;
      } else {
        setOtaControlStatus(status);
        return status;
      }
    } catch (err) {
      if (isExpectedActivatePortalDisconnect(op, err)) {
        console.warn('OTA Control activatePortal中のBLE切断をSoftAP起動遷移として扱います:', err);
        return null;
      }
      console.error('OTA Control操作エラー:', err);
      setError(err instanceof Error ? err.message : 'OTA Control操作に失敗しました');
      return null;
    } finally {
      setOtaControlBusy(false);
      operationInFlightRef.current = false;
    }
  }, [adapterRef, connectionState, setError]);

  return {
    otaControlStatus,
    otaControlBusy,
    refreshOtaControlStatus,
    writeOtaControl,
  };
};
