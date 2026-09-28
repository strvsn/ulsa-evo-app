import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { IBLEAdapter, SensorNotificationEvent, SensorStatusCallback, } from '../../services/ble';
import type { SensorData } from '../../types/ble';
import { normalizeBleUserMessage } from '../../utils/normalizeBleUserMessage';
import { validateNotificationStartResult } from './deviceList';
import type { BLEConnectionState, BLEDataState, SensorFieldReceivedAt } from './types';
type Setter<T> = Dispatch<SetStateAction<T>>;
interface SensorNotificationPauseControllerOptions {
    adapterRef: MutableRefObject<IBLEAdapter | null>;
    connectionState: BLEConnectionState;
    connectionSessionRef: MutableRefObject<number>;
    pausedRef: MutableRefObject<boolean>;
    transitionRef: MutableRefObject<Promise<void>>;
    cancelPendingSensorUiUpdate: () => void;
    lastSensorDataAtRef: MutableRefObject<number | null>;
    handleSensorData: (event: SensorNotificationEvent) => void;
    handleSensorStatus: SensorStatusCallback;
    setDataState: Setter<BLEDataState>;
    setError: Setter<string | null>;
    setLastSensorDataAt: Setter<number | null>;
    setSensorData: Setter<SensorData | null>;
    setSensorFieldReceivedAt: Setter<SensorFieldReceivedAt>;
}
export const useSensorNotificationPauseController = ({ adapterRef, connectionState, connectionSessionRef, pausedRef, transitionRef, cancelPendingSensorUiUpdate, lastSensorDataAtRef, handleSensorData, handleSensorStatus, setDataState, setError, setLastSensorDataAt, setSensorData, setSensorFieldReceivedAt, }: SensorNotificationPauseControllerOptions) => useCallback((paused: boolean): Promise<void> => {
    const transition = async () => {
        const adapter = adapterRef.current;
        if (!adapter || connectionState !== 'connected' || pausedRef.current === paused)
            return;
        const connectionSession = connectionSessionRef.current;
        const isCurrentSession = () => connectionSessionRef.current === connectionSession;
        if (paused) {
            pausedRef.current = true;
            cancelPendingSensorUiUpdate();
            await adapter.stopSensorNotifications();
            if (!isCurrentSession())
                return;
            lastSensorDataAtRef.current = null;
            setLastSensorDataAt(null);
            setSensorFieldReceivedAt({});
            setSensorData(null);
            setDataState('waiting');
            return;
        }
        try {
            const result = await adapter.startSensorNotifications((event) => { if (isCurrentSession())
                handleSensorData(event); }, (status) => { if (isCurrentSession())
                handleSensorStatus(status); });
            validateNotificationStartResult(result);
            if (!isCurrentSession())
                return;
            pausedRef.current = false;
            setDataState('waiting');
        }
        catch (error) {
            if (!isCurrentSession())
                return;
            pausedRef.current = true;
            setDataState('waiting');
            setError(normalizeBleUserMessage(error instanceof Error ? error.message : '') ||
                '計測データの受信を再開できませんでした。再接続してください');
            throw error;
        }
    };
    const queued = transitionRef.current.then(transition, transition);
    transitionRef.current = queued.catch(() => undefined);
    return queued;
}, [
    adapterRef, cancelPendingSensorUiUpdate, connectionSessionRef, connectionState,
    handleSensorData, handleSensorStatus, lastSensorDataAtRef, pausedRef, setDataState,
    setError, setLastSensorDataAt, setSensorData,
    setSensorFieldReceivedAt, transitionRef
]);
