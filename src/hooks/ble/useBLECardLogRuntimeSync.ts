import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { IBLEAdapter } from '../../services/ble';
import type { CardLogControlStatus, CardLogDetailStatus, CardLogSettingsStatus } from '../../types/ble';
import {
  CARD_LOG_CONTROL_FALLBACK_REFRESH_MS,
  CARD_LOG_NOTIFY_START_TIMEOUT_MS,
} from './constants';
import type { BLEConnectionState } from './types';

interface UseBLECardLogRuntimeSyncOptions {
  adapterRef: MutableRefObject<IBLEAdapter | null>;
  connectionState: BLEConnectionState;
  readCardLogControlFromAdapter: (adapter: IBLEAdapter) => Promise<CardLogControlStatus | null>;
  updateCardLogDetailStatus: (status: CardLogDetailStatus | null) => void;
  setCardLogDetailLastReadAt: (value: number | null) => void;
  updateCardLogSettingsStatus: (status: CardLogSettingsStatus | null) => void;
  setCardLogSettingsLastReadAt: (value: number | null) => void;
}

interface UseBLECardLogRuntimeSyncReturn {
  refreshCardLogDetailStatus: () => Promise<void>;
  refreshCardLogSettingsStatus: () => Promise<void>;
}

/**
 * Card Log Detail Notify is optional and starts only after the required sensor
 * notification path has already established the connection. A five-second
 * Card Log Control read is the compatibility fallback; SD capacity remains on
 * its independent 60-second schedule.
 */
export const useBLECardLogRuntimeSync = ({
  adapterRef,
  connectionState,
  readCardLogControlFromAdapter,
  updateCardLogDetailStatus,
  setCardLogDetailLastReadAt,
  updateCardLogSettingsStatus,
  setCardLogSettingsLastReadAt,
}: UseBLECardLogRuntimeSyncOptions): UseBLECardLogRuntimeSyncReturn => {
  const [detailNotifyActive, setDetailNotifyActive] = useState<boolean | null>(null);
  const fallbackInFlightRef = useRef(false);
  const detailRefreshInFlightRef = useRef(false);
  const settingsRefreshInFlightRef = useRef(false);

  const refreshCardLogDetailStatus = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected' || detailRefreshInFlightRef.current) return;
    detailRefreshInFlightRef.current = true;
    try {
      updateCardLogDetailStatus(await adapter.getCardLogDetailStatus());
      setCardLogDetailLastReadAt(Date.now());
    } catch (error) {
      console.error('カードログ詳細取得エラー:', error);
      updateCardLogDetailStatus(null);
      setCardLogDetailLastReadAt(Date.now());
    } finally {
      detailRefreshInFlightRef.current = false;
    }
  }, [adapterRef, connectionState, setCardLogDetailLastReadAt, updateCardLogDetailStatus]);

  const refreshCardLogSettingsStatus = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected' || settingsRefreshInFlightRef.current) return;
    settingsRefreshInFlightRef.current = true;
    try {
      updateCardLogSettingsStatus(await adapter.getCardLogSettingsStatus());
      setCardLogSettingsLastReadAt(Date.now());
    } catch (error) {
      console.error('カードログ設定取得エラー:', error);
      updateCardLogSettingsStatus(null);
      setCardLogSettingsLastReadAt(Date.now());
    } finally {
      settingsRefreshInFlightRef.current = false;
    }
  }, [adapterRef, connectionState, setCardLogSettingsLastReadAt, updateCardLogSettingsStatus]);

  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected') {
      setDetailNotifyActive(null);
      return;
    }
    if (!adapter.startCardLogDetailNotifications) {
      setDetailNotifyActive(false);
      return;
    }

    let cancelled = false;
    setDetailNotifyActive(null);
    const startTimeout = window.setTimeout(() => {
      if (!cancelled) setDetailNotifyActive(false);
    }, CARD_LOG_NOTIFY_START_TIMEOUT_MS);
    void adapter.startCardLogDetailNotifications((status) => {
      if (cancelled) return;
      updateCardLogDetailStatus(status);
      setCardLogDetailLastReadAt(Date.now());
    }).then((active) => {
      window.clearTimeout(startTimeout);
      if (!cancelled) setDetailNotifyActive(active);
    }).catch(() => {
      window.clearTimeout(startTimeout);
      if (!cancelled) setDetailNotifyActive(false);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(startTimeout);
      void adapter.stopCardLogDetailNotifications?.();
    };
  }, [adapterRef, connectionState, setCardLogDetailLastReadAt, updateCardLogDetailStatus]);

  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected' || detailNotifyActive !== false) return;

    const refreshControl = async () => {
      if (fallbackInFlightRef.current) return;
      fallbackInFlightRef.current = true;
      try {
        await readCardLogControlFromAdapter(adapter);
      } finally {
        fallbackInFlightRef.current = false;
      }
    };
    void refreshControl();
    const interval = window.setInterval(
      () => void refreshControl(),
      CARD_LOG_CONTROL_FALLBACK_REFRESH_MS
    );
    return () => window.clearInterval(interval);
  }, [adapterRef, connectionState, detailNotifyActive, readCardLogControlFromAdapter]);

  return { refreshCardLogDetailStatus, refreshCardLogSettingsStatus };
};
