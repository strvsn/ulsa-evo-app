import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { IBLEAdapter } from '../../services/ble';
import { logBLEDebug } from '../../services/ble/bleLogger';
import type { RtcTimeStatus } from '../../types/ble';
import {
  isRtcTimezoneOperationComplete,
  isRtcTimezoneSyncVerified,
} from '../../services/ble/rtcTimezoneControl';
import {
  RTC_SYNC_OK_OFFSET_MS,
  RTC_SYNC_READBACK_DELAY_MS,
  RTC_SYNC_READBACK_SAMPLE_COUNT,
  RTC_SYNC_READBACK_SAMPLE_INTERVAL_MS,
  RTC_TIME_REFRESH_MS,
} from './constants';
import { evaluateRtcOffsetSamples } from '../../services/ble/rtcOffsetEvaluation';
import type { BLEConnectionState } from './types';

interface UseBLERtcControlArgs {
  adapterRef: MutableRefObject<IBLEAdapter | null>;
  connectionState: BLEConnectionState;
  deviceKey: string | null;
  diagnosticsActive: boolean;
  readRtcTimezoneFromAdapter: (adapter: IBLEAdapter, options?: { force?: boolean }) => Promise<number | null>;
  refreshDeviceHealthStatus: () => Promise<void>;
  setError: (value: string | null) => void;
  setRtcTimeStatus: Dispatch<SetStateAction<RtcTimeStatus>>;
}

export const useBLERtcControl = ({
  adapterRef,
  connectionState,
  deviceKey,
  diagnosticsActive,
  readRtcTimezoneFromAdapter,
  refreshDeviceHealthStatus,
  setError,
  setRtcTimeStatus,
}: UseBLERtcControlArgs) => {
  const syncInFlightRef = useRef(false);
  const connectionContextRef = useRef({ connectionState, deviceKey });

  useEffect(() => {
    connectionContextRef.current = { connectionState, deviceKey };
  }, [connectionState, deviceKey]);

  const runTimezoneOperation = useCallback(async (
    operation: 'set_zone' | 'sync_utc_and_zone',
    zoneId: number
  ) => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected') {
      setError('デバイスが接続されていません');
      return;
    }
    if (syncInFlightRef.current) {
      return;
    }

    const operationDeviceKey = deviceKey;
    const isCurrentConnection = () =>
      adapterRef.current === adapter
      && connectionContextRef.current.connectionState === 'connected'
      && connectionContextRef.current.deviceKey === operationDeviceKey;
    syncInFlightRef.current = true;
    try {
      setRtcTimeStatus((current) => ({
        ...current,
        syncState: operation === 'set_zone' ? 'settingZone' : 'syncing',
        syncMessage: operation === 'set_zone' ? '地域を保存中...' : '時刻と地域を同期中...',
      }));
      const baseline = await adapter.getRtcTimezoneStatus();
      if (!isCurrentConnection()) return;
      if (!baseline) {
        throw new Error('このfirmwareはRTC地域設定に対応していません');
      }
      const requestedUnixSeconds = Math.floor(Date.now() / 1000);
      const status = await adapter.writeRtcTimezone(operation === 'set_zone'
        ? { op: operation, zoneId }
        : { op: operation, zoneId, unixSeconds: requestedUnixSeconds });
      if (!isCurrentConnection()) return;
      if (!status) {
        throw new Error('RTC timezone操作後の状態を確認できません');
      }
      await new Promise((resolve) => setTimeout(resolve, RTC_SYNC_READBACK_DELAY_MS));
      if (!isCurrentConnection()) return;
      const offsetSamples: Array<number | null> = [];
      for (let index = 0; index < RTC_SYNC_READBACK_SAMPLE_COUNT; index += 1) {
        if (index > 0) {
          await new Promise((resolve) => setTimeout(resolve, RTC_SYNC_READBACK_SAMPLE_INTERVAL_MS));
        }
        if (!isCurrentConnection()) return;
        offsetSamples.push(await readRtcTimezoneFromAdapter(adapter, { force: true }));
      }
      const offsetEvaluation = evaluateRtcOffsetSamples(offsetSamples);
      const offsetMs = offsetEvaluation.offsetMs;
      if (!isCurrentConnection()) return;
      await refreshDeviceHealthStatus();
      if (!isCurrentConnection()) return;
      const verified = operation === 'set_zone'
        ? isRtcTimezoneOperationComplete(
            status,
            operation,
            baseline.operationGeneration
          )
          && status.result === 'ok'
          && status.zoneId === zoneId
          && status.zoneConfigured
          && status.nvsPersisted
          && !status.busy
          && !status.error
        : isRtcTimezoneSyncVerified(status, {
            baselineGeneration: baseline.operationGeneration,
            zoneId,
            referenceUnixSeconds: Date.now() / 1000,
            toleranceSeconds: RTC_SYNC_OK_OFFSET_MS / 1000,
          })
          && offsetMs !== null
          && Math.abs(offsetMs) <= RTC_SYNC_OK_OFFSET_MS;
      setRtcTimeStatus((current) => ({
        ...current,
        syncState: verified ? 'synced' : 'failed',
        lastSyncAt: Date.now(),
        lastSyncOffsetMs: offsetMs,
        offsetMs,
        offsetAssessment: offsetEvaluation.assessment,
        syncMessage: verified
          ? operation === 'set_zone' ? '地域を保存しました' : '時刻と地域を同期しました'
          : `操作結果を検証できません (${status.result})`,
      }));
      logBLEDebug(verified ? 'RTC timezone operation verified' : 'RTC timezone operation did not verify');
      if (!verified) {
        setError(`RTC操作が完了しませんでした: ${status.result}`);
      }
    } catch (err) {
      if (!isCurrentConnection()) return;
      console.error('RTC timezone操作エラー:', err);
      setRtcTimeStatus((current) => ({
        ...current,
        syncState: 'failed',
        lastSyncAt: Date.now(),
        lastSyncOffsetMs: null,
        syncMessage: err instanceof Error ? err.message : 'RTC操作に失敗しました',
      }));
      setError(err instanceof Error ? err.message : 'RTC操作に失敗しました');
    } finally {
      syncInFlightRef.current = false;
    }
  }, [adapterRef, connectionState, deviceKey, readRtcTimezoneFromAdapter, refreshDeviceHealthStatus, setError, setRtcTimeStatus]);

  const setRtcTimezone = useCallback((zoneId: number) =>
    runTimezoneOperation('set_zone', zoneId), [runTimezoneOperation]);

  const syncTime = useCallback((zoneId: number) =>
    runTimezoneOperation('sync_utc_and_zone', zoneId), [runTimezoneOperation]);

  const refreshRtcTime = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected' || syncInFlightRef.current) {
      return;
    }

    await readRtcTimezoneFromAdapter(adapter, { force: true });
  }, [adapterRef, connectionState, readRtcTimezoneFromAdapter]);

  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter || connectionState !== 'connected' || !diagnosticsActive) {
      return;
    }

    if (!syncInFlightRef.current) void readRtcTimezoneFromAdapter(adapter);
    const interval = setInterval(() => {
      if (!syncInFlightRef.current) void readRtcTimezoneFromAdapter(adapter);
    }, RTC_TIME_REFRESH_MS);

    return () => clearInterval(interval);
  }, [adapterRef, connectionState, deviceKey, diagnosticsActive, readRtcTimezoneFromAdapter]);

  return {
    syncTime,
    setRtcTimezone,
    refreshRtcTime,
  };
};
