import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { IBLEAdapter, BLEPlatformInfo } from '../../services/ble';
import { logBLEDebug } from '../../services/ble/bleLogger';
import { normalizeBleUserMessage } from '../../utils/normalizeBleUserMessage';
import { mergeDeviceInfoList, toDeviceInfo, upsertDeviceInfo } from './deviceList';
import { ULSA_DEVICE_NOT_FOUND_ERROR } from './scanMessages';
import type { BLEConnectionState, BLEDeviceInfo } from './types';

interface DeviceDiscoveryOptions {
  adapterRef: MutableRefObject<IBLEAdapter | null>;
  platformInfo: BLEPlatformInfo | null;
  scanSessionRef: MutableRefObject<number>;
  connectionInFlightRef: MutableRefObject<boolean>;
  connectToDevice: (device: BLEDeviceInfo) => Promise<void>;
  setAvailableDevices: Dispatch<SetStateAction<BLEDeviceInfo[]>>;
  setConnectionState: Dispatch<SetStateAction<BLEConnectionState>>;
  setError: Dispatch<SetStateAction<string | null>>;
}

/** Owns discovery results, so a cancelled scan cannot overwrite a selected connection. */
export const useBLEDeviceDiscovery = ({
  adapterRef, platformInfo, scanSessionRef, connectionInFlightRef,
  connectToDevice, setAvailableDevices, setConnectionState, setError,
}: DeviceDiscoveryOptions) => {
  const activeScanRef = useRef<number | null>(null);
  const scanAndConnect = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter) {
      setError('BLEが初期化されていません');
      return;
    }
    if (connectionInFlightRef.current || activeScanRef.current !== null) return;

    const session = ++scanSessionRef.current;
    activeScanRef.current = session;
    const isCurrentScan = () => scanSessionRef.current === session && !connectionInFlightRef.current;
    try {
      setError(null);
      const isNativeListScan = typeof adapter.scanDevices === 'function' && platformInfo?.adapterType === 'Capacitor';
      if (!isNativeListScan) setAvailableDevices((prev) => (prev.length === 0 ? prev : []));
      setConnectionState('scanning');
      logBLEDebug('🔍 デバイス選択を開始...', platformInfo);

      if (isNativeListScan && adapter.scanDevices) {
        const devices = await adapter.scanDevices((device) => {
          if (isCurrentScan()) setAvailableDevices((prev) => upsertDeviceInfo(prev, toDeviceInfo(device)));
        });
        if (!isCurrentScan()) return;
        const deviceInfos = mergeDeviceInfoList(devices);
        setAvailableDevices((prev) => deviceInfos.reduce((list, device) => upsertDeviceInfo(list, device), prev));
        if (deviceInfos.length === 0) setError(ULSA_DEVICE_NOT_FOUND_ERROR);
        setConnectionState('disconnected');
        return;
      }

      const device = await adapter.scanAndSelect();
      if (!isCurrentScan()) return;
      logBLEDebug('デバイス選択結果:', device);
      if (!device) {
        setConnectionState('disconnected');
        return;
      }
      await connectToDevice(toDeviceInfo(device));
    } catch (err) {
      if (!isCurrentScan()) return;
      if (!(err instanceof Error && err.name === 'NotFoundError')) {
        console.error('スキャンエラー:', err);
        setError(normalizeBleUserMessage(err instanceof Error ? err.message : '') || 'スキャンに失敗しました');
      }
      setConnectionState('disconnected');
    } finally {
      if (activeScanRef.current === session) activeScanRef.current = null;
    }
  }, [adapterRef, platformInfo, scanSessionRef, connectionInFlightRef, connectToDevice, setAvailableDevices, setConnectionState, setError]);

  const cancelScan = useCallback(async () => {
    const adapter = adapterRef.current;
    if (platformInfo?.adapterType !== 'Capacitor' || typeof adapter?.stopScan !== 'function') return;
    const session = ++scanSessionRef.current;
    try {
      await adapter.stopScan();
    } catch (err) {
      if (scanSessionRef.current === session && !connectionInFlightRef.current) {
        setError(normalizeBleUserMessage(err instanceof Error ? err.message : '') || 'BLE検索を停止できませんでした');
      }
    } finally {
      if (scanSessionRef.current === session && !connectionInFlightRef.current) {
        setConnectionState((current) => current === 'scanning' ? 'disconnected' : current);
      }
    }
  }, [adapterRef, platformInfo?.adapterType, scanSessionRef, connectionInFlightRef, setConnectionState, setError]);

  return { scanAndConnect, cancelScan };
};
