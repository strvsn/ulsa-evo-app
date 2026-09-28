import { useCallback, useEffect, useRef, useState } from 'react';
import type { BLEPlatformInfo } from '../../services/ble';
import type { BLEConnectionState } from '../../hooks/useBLE';
import { ULSA_DEVICE_NOT_FOUND_ERROR } from '../../hooks/ble/scanMessages';

/** A short pause prevents consecutive native scan sessions from competing for the radio. */
export const NATIVE_BLE_SCAN_RETRY_DELAY_MS = 750;
/** Avoid leaving the iOS radio in repeated scan sessions behind an unattended dialog. */
export const NATIVE_BLE_SCAN_TOTAL_TIMEOUT_MS = 30_000;

interface UseContinuousNativeBleScanOptions {
  modalOpen: boolean;
  connectionState: BLEConnectionState;
  availableDeviceCount: number;
  error: string | null;
  platformInfo: BLEPlatformInfo | null;
  scanAndConnect: () => Promise<void>;
  cancelNativeScan: () => Promise<void>;
}

interface UseContinuousNativeBleScanResult {
  isContinuousNativeScanActive: boolean;
  beginContinuousNativeScan: () => void;
  stopContinuousNativeScan: () => void;
}

/**
 * Repeats Capacitor/iOS scan sessions only after a normal no-device result.
 * Browser Web Bluetooth owns its chooser, so it deliberately remains a one-shot action.
 */
export const useContinuousNativeBleScan = ({
  modalOpen,
  connectionState,
  availableDeviceCount,
  error,
  platformInfo,
  scanAndConnect,
  cancelNativeScan,
}: UseContinuousNativeBleScanOptions): UseContinuousNativeBleScanResult => {
  const [isContinuousNativeScanActive, setIsContinuousNativeScanActive] = useState(false);
  const [scanFinishedSequence, setScanFinishedSequence] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanInFlightRef = useRef(false);
  const scanSessionRef = useRef(0);
  const isNativeDeviceListScan = platformInfo?.adapterType === 'Capacitor';

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const clearTotalTimeout = useCallback(() => {
    if (totalTimeoutRef.current !== null) {
      clearTimeout(totalTimeoutRef.current);
      totalTimeoutRef.current = null;
    }
  }, []);

  const runScan = useCallback((session: number) => {
    if (scanInFlightRef.current || scanSessionRef.current !== session) return;

    scanInFlightRef.current = true;
    void scanAndConnect().finally(() => {
      scanInFlightRef.current = false;
      if (scanSessionRef.current === session) {
        setScanFinishedSequence((current) => current + 1);
      }
    });
  }, [scanAndConnect]);

  const stopContinuousNativeScan = useCallback(() => {
    scanSessionRef.current += 1;
    clearRetryTimer();
    clearTotalTimeout();
    setIsContinuousNativeScanActive(false);
    if (isNativeDeviceListScan && scanInFlightRef.current) {
      void cancelNativeScan();
    }
  }, [cancelNativeScan, clearRetryTimer, clearTotalTimeout, isNativeDeviceListScan]);

  const beginContinuousNativeScan = useCallback(() => {
    if (!isNativeDeviceListScan) {
      void scanAndConnect();
      return;
    }

    clearRetryTimer();
    const session = scanSessionRef.current + 1;
    scanSessionRef.current = session;
    setIsContinuousNativeScanActive(true);
    runScan(session);
    totalTimeoutRef.current = setTimeout(
      stopContinuousNativeScan,
      NATIVE_BLE_SCAN_TOTAL_TIMEOUT_MS,
    );
  }, [
    clearRetryTimer,
    isNativeDeviceListScan,
    runScan,
    scanAndConnect,
    stopContinuousNativeScan,
  ]);

  useEffect(() => {
    if (!isContinuousNativeScanActive) return;

    const shouldStop = !isNativeDeviceListScan
      || !modalOpen
      || connectionState === 'connected'
      || (error !== null && error !== ULSA_DEVICE_NOT_FOUND_ERROR);

    if (shouldStop) {
      stopContinuousNativeScan();
      return;
    }

    if (connectionState === 'scanning' || connectionState === 'connecting' || scanInFlightRef.current) {
      return;
    }

    // A candidate stops further retries only after the current scan has finished.
    // Cancelling on the first advertisement would discard later devices in this scan.
    if (availableDeviceCount > 0) {
      stopContinuousNativeScan();
      return;
    }

    const session = scanSessionRef.current;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      runScan(session);
    }, NATIVE_BLE_SCAN_RETRY_DELAY_MS);

    return clearRetryTimer;
  }, [
    availableDeviceCount,
    clearRetryTimer,
    connectionState,
    error,
    isContinuousNativeScanActive,
    isNativeDeviceListScan,
    modalOpen,
    runScan,
    scanFinishedSequence,
    stopContinuousNativeScan,
  ]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.visibilityState === 'hidden') stopContinuousNativeScan();
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => document.removeEventListener('visibilitychange', stopWhenHidden);
  }, [stopContinuousNativeScan]);

  useEffect(() => stopContinuousNativeScan, [stopContinuousNativeScan]);

  return {
    isContinuousNativeScanActive,
    beginContinuousNativeScan,
    stopContinuousNativeScan,
  };
};
