import { useEffect, useRef } from 'react';
import type { BLEConnectionState } from '../../hooks/ble/types';

export interface BLEBackgroundNotificationPolicyInput {
  visibilityState: DocumentVisibilityState;
  connectionState: BLEConnectionState;
  appLogActive: boolean;
  pipActive: boolean;
  maintenanceCritical: boolean;
}

export const shouldPauseSensorNotifications = ({
  visibilityState,
  connectionState,
  appLogActive,
  pipActive,
  maintenanceCritical,
}: BLEBackgroundNotificationPolicyInput): boolean =>
  visibilityState === 'hidden' &&
  connectionState === 'connected' &&
  !appLogActive &&
  !pipActive &&
  !maintenanceCritical;

interface UseBLEBackgroundNotificationPolicyOptions {
  connectionState: BLEConnectionState;
  appLogActive: boolean;
  pipActive: boolean;
  maintenanceCritical: boolean;
  setSensorNotificationsPaused: (paused: boolean) => Promise<void>;
}

export const useBLEBackgroundNotificationPolicy = ({
  connectionState,
  appLogActive,
  pipActive,
  maintenanceCritical,
  setSensorNotificationsPaused,
}: UseBLEBackgroundNotificationPolicyOptions): void => {
  const lastRequestedPauseRef = useRef<boolean | null>(null);

  useEffect(() => {
    const applyPolicy = () => {
      const shouldPause = shouldPauseSensorNotifications({
        visibilityState: document.visibilityState,
        connectionState,
        appLogActive,
        pipActive,
        maintenanceCritical,
      });
      if (lastRequestedPauseRef.current === shouldPause) return;
      lastRequestedPauseRef.current = shouldPause;
      void setSensorNotificationsPaused(shouldPause).catch((error) => {
        // Allow a later lifecycle event to retry the same transition.
        lastRequestedPauseRef.current = null;
        console.warn('BLE計測通知のbackground切替に失敗しました:', error);
      });
    };

    applyPolicy();
    document.addEventListener('visibilitychange', applyPolicy);
    return () => document.removeEventListener('visibilitychange', applyPolicy);
  }, [
    appLogActive,
    connectionState,
    maintenanceCritical,
    pipActive,
    setSensorNotificationsPaused,
  ]);
};
