import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { IBLEAdapter, BLEParseErrorStats, BLEPlatformInfo } from '../../services/ble';
import { EMPTY_PARSE_ERROR_STATS, SENSOR_DATA_STALE_MS } from './constants';
import { areParseErrorStatsEqual } from './statusEquality';
import { startConnectedRssiPolling } from './connectedRssiPolling';
import type { BLEConnectionState, BLEDataState, BLEDeviceInfo } from './types';

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export const useConnectedSensorMonitors = ({
  adapterRef,
  connectionState,
  platformInfo,
  lastSensorDataAtRef,
  setDataState,
  setParseErrorStats,
  setConnectedDevice,
}: {
  adapterRef: MutableRefObject<IBLEAdapter | null>;
  connectionState: BLEConnectionState;
  platformInfo: BLEPlatformInfo | null;
  lastSensorDataAtRef: MutableRefObject<number | null>;
  setDataState: StateSetter<BLEDataState>;
  setParseErrorStats: StateSetter<BLEParseErrorStats>;
  setConnectedDevice: StateSetter<BLEDeviceInfo | null>;
}): void => {
  useEffect(() => {
    if (connectionState !== 'connected') {
      setDataState('idle');
      setParseErrorStats(EMPTY_PARSE_ERROR_STATS);
      return;
    }

    const updateDataState = () => {
      const adapter = adapterRef.current;
      if (adapter) {
        const nextParseErrorStats = adapter.getParseErrorStats();
        setParseErrorStats((current) =>
          areParseErrorStatsEqual(current, nextParseErrorStats) ? current : nextParseErrorStats
        );
      }

      const lastSensorDataAt = lastSensorDataAtRef.current;
      if (lastSensorDataAt === null) {
        setDataState('waiting');
        return;
      }

      setDataState(Date.now() - lastSensorDataAt > SENSOR_DATA_STALE_MS ? 'stale' : 'live');
    };

    updateDataState();
    const interval = setInterval(updateDataState, 1000);
    return () => clearInterval(interval);
  }, [adapterRef, connectionState, lastSensorDataAtRef, setDataState, setParseErrorStats]);

  useEffect(() => {
    const adapter = adapterRef.current;
    if (
      connectionState !== 'connected' ||
      platformInfo?.platform !== 'ios' ||
      !adapter?.readConnectedRssi
    ) {
      return;
    }

    return startConnectedRssiPolling(
      () => adapter.readConnectedRssi!(),
      (rssi) => setConnectedDevice((current) => {
        if (!current || current.rssi === rssi) return current;
        return { ...current, rssi };
      })
    );
  }, [adapterRef, connectionState, platformInfo?.platform, setConnectedDevice]);
};
