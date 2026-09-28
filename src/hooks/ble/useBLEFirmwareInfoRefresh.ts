import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { IBLEAdapter } from '../../services/ble';
import type { DeviceInfo, Stm32FirmwareVersionStatus } from '../../types/ble';
import type { BLEConnectionState } from './types';
import { OPTIONAL_CONNECTION_TASK_TIMEOUT_MS, withOptionalConnectionTimeout } from './optionalConnectionInitialization';

type Options = {
  adapterRef: MutableRefObject<IBLEAdapter | null>;
  connectionState: BLEConnectionState;
  connectionSessionRef: MutableRefObject<number>;
  setDeviceInfo: Dispatch<SetStateAction<DeviceInfo | null>>;
  updateStm32FirmwareVersion: (status: Stm32FirmwareVersionStatus | null) => void;
  setStm32FirmwareVersionLastReadAt: Dispatch<SetStateAction<number | null>>;
};

export const useBLEFirmwareInfoRefresh = ({
  adapterRef, connectionState, updateStm32FirmwareVersion, setStm32FirmwareVersionLastReadAt,
  connectionSessionRef, setDeviceInfo,
}: Options) => {
  const [firmwareInfoBusy, setFirmwareInfoBusy] = useState(false);
  const [firmwareInfoError, setFirmwareInfoError] = useState<string | null>(null);
  const refreshOperationRef = useRef<symbol | null>(null);
  const stm32RequestRef = useRef<{ generation: number; promise: Promise<Stm32FirmwareVersionStatus | null> } | null>(null);

  useEffect(() => {
    if (connectionState === 'connected') return;
    refreshOperationRef.current = null;
    stm32RequestRef.current = null;
    setFirmwareInfoBusy(false);
    setFirmwareInfoError(null);
  }, [connectionState]);

  const readStm32Version = useCallback(async (): Promise<Stm32FirmwareVersionStatus | null> => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected') return null;
    const generation = connectionSessionRef.current;
    if (stm32RequestRef.current?.generation === generation) return stm32RequestRef.current.promise;
    const current = () => adapterRef.current === adapter && connectionSessionRef.current === generation;
    const promise = (async () => {
      let status: Stm32FirmwareVersionStatus | null = null;
      try {
        status = await withOptionalConnectionTimeout(
          adapter.getStm32FirmwareVersion(), OPTIONAL_CONNECTION_TASK_TIMEOUT_MS, 'STM32 firmware version',
        );
      } catch {
        // Optional metadata failure must not stop measurements or disconnect BLE.
      }
      if (!current()) return null;
      updateStm32FirmwareVersion(status);
      setStm32FirmwareVersionLastReadAt(Date.now());
      return status;
    })();
    stm32RequestRef.current = { generation, promise };
    try {
      return await promise;
    } finally {
      if (stm32RequestRef.current?.promise === promise) stm32RequestRef.current = null;
    }
  }, [adapterRef, connectionSessionRef, connectionState, setStm32FirmwareVersionLastReadAt, updateStm32FirmwareVersion]);

  const refreshStm32FirmwareVersion = useCallback(async () => { await readStm32Version(); }, [readStm32Version]);
  const refreshFirmwareVersions = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected' || refreshOperationRef.current) return;
    const operation = Symbol('firmware-info-refresh');
    const generation = connectionSessionRef.current;
    const current = () => refreshOperationRef.current === operation &&
      adapterRef.current === adapter && connectionSessionRef.current === generation;
    refreshOperationRef.current = operation;
    setFirmwareInfoBusy(true);
    setFirmwareInfoError(null);
    const failures: string[] = [];
    try {
      try {
        const info = await withOptionalConnectionTimeout(
          adapter.getDeviceInfo(), OPTIONAL_CONNECTION_TASK_TIMEOUT_MS, 'Device Information',
        );
        if (!current()) return;
        setDeviceInfo(info);
        if (!info.firmwareRevision) failures.push('ESP32');
      } catch {
        if (!current()) return;
        failures.push('ESP32');
      }
      // Keep the two manual reads ordered rather than creating another GATT burst.
      const status = await readStm32Version();
      if (!current()) return;
      if (!status?.readOk || !status.firmwareVersion) failures.push('STM32');
      if (failures.length) setFirmwareInfoError(`${failures.join('・')}のバージョンを取得できませんでした。BLE接続を確認し、もう一度お試しください。`);
    } finally {
      if (refreshOperationRef.current === operation) {
        refreshOperationRef.current = null;
        setFirmwareInfoBusy(false);
      }
    }
  }, [adapterRef, connectionSessionRef, connectionState, readStm32Version, setDeviceInfo]);

  return { refreshStm32FirmwareVersion, refreshFirmwareVersions, firmwareInfoBusy, firmwareInfoError };
};
