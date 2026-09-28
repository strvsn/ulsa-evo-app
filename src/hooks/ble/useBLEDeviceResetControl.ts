import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { IBLEAdapter } from '../../services/ble';
import type {
  DeviceHealthStatus,
  DeviceResetStatus,
  DeviceResetTarget,
  Stm32FirmwareVersionStatus,
} from '../../types/ble';
import { areDeviceResetStatusesEqual } from './statusEquality';
import type { BLEConnectionState } from './types';

type StatusUpdater<T> = (status: T | null) => void;

interface UseBLEDeviceResetControlArgs {
  adapterRef: MutableRefObject<IBLEAdapter | null>;
  connectionState: BLEConnectionState;
  setError: (value: string | null) => void;
  updateDeviceHealthStatus: StatusUpdater<DeviceHealthStatus>;
  updateStm32FirmwareVersion: StatusUpdater<Stm32FirmwareVersionStatus>;
  setDeviceHealthLastReadAt: (value: number | null) => void;
  setStm32FirmwareVersionLastReadAt: (value: number | null) => void;
}

const setIfChanged = (
  setter: Dispatch<SetStateAction<DeviceResetStatus | null>>,
  status: DeviceResetStatus | null
) => {
  setter((current) => {
    if (current === null || status === null) {
      return current === status ? current : status;
    }
    return areDeviceResetStatusesEqual(current, status) ? current : status;
  });
};

export const useBLEDeviceResetControl = ({
  adapterRef,
  connectionState,
  setError,
  updateDeviceHealthStatus,
  updateStm32FirmwareVersion,
  setDeviceHealthLastReadAt,
  setStm32FirmwareVersionLastReadAt,
}: UseBLEDeviceResetControlArgs) => {
  const [deviceResetStatus, setDeviceResetStatus] = useState<DeviceResetStatus | null>(null);
  const [deviceResetSupported, setDeviceResetSupported] = useState<boolean | null>(null);
  const [deviceResetBusy, setDeviceResetBusy] = useState(false);
  const operationInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const updateDeviceResetStatus = useCallback((status: DeviceResetStatus | null) => {
    setIfChanged(setDeviceResetStatus, status);
    setDeviceResetSupported(status !== null);
  }, []);

  useEffect(() => {
    if (connectionState !== 'disconnected') {
      return;
    }
    setDeviceResetStatus(null);
    setDeviceResetSupported(null);
    setDeviceResetBusy(false);
    operationInFlightRef.current = false;
    refreshInFlightRef.current = false;
  }, [connectionState]);

  const refreshDeviceResetStatus = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected' || refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;
    try {
      updateDeviceResetStatus(await adapter.getDeviceResetStatus());
    } catch (err) {
      console.error('Reset Control取得エラー:', err);
      updateDeviceResetStatus(null);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [adapterRef, connectionState, updateDeviceResetStatus]);

  const refreshStm32DependentStatus = useCallback(async (adapter: IBLEAdapter) => {
    try {
      updateStm32FirmwareVersion(await adapter.getStm32FirmwareVersion());
      setStm32FirmwareVersionLastReadAt(Date.now());
    } catch {
      updateStm32FirmwareVersion(null);
      setStm32FirmwareVersionLastReadAt(Date.now());
    }

    try {
      updateDeviceHealthStatus(await adapter.getDeviceHealthStatus());
      setDeviceHealthLastReadAt(Date.now());
    } catch {
      updateDeviceHealthStatus(null);
      setDeviceHealthLastReadAt(Date.now());
    }
  }, [
    setDeviceHealthLastReadAt,
    setStm32FirmwareVersionLastReadAt,
    updateDeviceHealthStatus,
    updateStm32FirmwareVersion,
  ]);

  const resetDevice = useCallback(async (target: DeviceResetTarget): Promise<DeviceResetStatus | null> => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected') {
      setError('デバイスが接続されていません');
      return null;
    }
    if (operationInFlightRef.current) {
      return deviceResetStatus;
    }

    operationInFlightRef.current = true;
    setDeviceResetBusy(true);
    setError(null);
    try {
      const status = await adapter.resetDevice(target);
      updateDeviceResetStatus(status);
      if (!status) {
        setError('Reset Controlを取得できませんでした。ESP32 firmwareがReset Control Characteristicに対応しているか確認してください');
        return null;
      }
      if (status.result !== 'ok') {
        setError(`リセット操作が完了しませんでした: ${status.result}`);
        return status;
      }

      if (target === 'stm32') {
        await refreshStm32DependentStatus(adapter);
      }

      return status;
    } catch (err) {
      console.error('Reset Control操作エラー:', err);
      setError(err instanceof Error ? err.message : 'リセット操作に失敗しました');
      return null;
    } finally {
      setDeviceResetBusy(false);
      operationInFlightRef.current = false;
    }
  }, [
    adapterRef,
    connectionState,
    deviceResetStatus,
    refreshStm32DependentStatus,
    setError,
    updateDeviceResetStatus,
  ]);

  useEffect(() => {
    if (connectionState !== 'connected') {
      return;
    }
    void refreshDeviceResetStatus();
  }, [connectionState, refreshDeviceResetStatus]);

  return {
    deviceResetStatus,
    deviceResetSupported,
    deviceResetBusy,
    refreshDeviceResetStatus,
    resetDevice,
  };
};
