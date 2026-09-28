import { useCallback, useEffect, useState } from 'react';
import type { BLEDeviceInfo, BLEConnectionState } from '../../hooks/useBLE';
import type { BLEPlatformInfo } from '../../services/ble';
import { useContinuousNativeBleScan } from './useContinuousNativeBleScan';

interface UseBleConnectionModalOptions {
  connectionState: BLEConnectionState;
  availableDevices: BLEDeviceInfo[];
  error: string | null;
  platformInfo: BLEPlatformInfo | null;
  scanAndConnect: () => Promise<void>;
  cancelScan: () => Promise<void>;
  connectToDevice: (device: BLEDeviceInfo) => Promise<void>;
}

/** Owns connection-dialog lifecycle without coupling dashboard layout to BLE scan timing. */
export const useBleConnectionModal = ({
  connectionState,
  availableDevices,
  error,
  platformInfo,
  scanAndConnect,
  cancelScan,
  connectToDevice,
}: UseBleConnectionModalOptions) => {
  const [bleModalPresented, setBleModalPresented] = useState(false);
  const [showBLEModal, setShowBLEModal] = useState(false);
  const [dismissAfterConnection, setDismissAfterConnection] = useState(false);
  const {
    isContinuousNativeScanActive,
    beginContinuousNativeScan,
    stopContinuousNativeScan,
  } = useContinuousNativeBleScan({
    modalOpen: showBLEModal,
    connectionState,
    availableDeviceCount: availableDevices.length,
    error,
    platformInfo,
    scanAndConnect,
    cancelNativeScan: cancelScan,
  });

  const handleBLEModalDismiss = useCallback(() => {
    stopContinuousNativeScan();
    setDismissAfterConnection(false);
    setShowBLEModal(false);
  }, [stopContinuousNativeScan]);

  const handleBleScanAndConnect = useCallback(() => {
    setDismissAfterConnection(true);
    beginContinuousNativeScan();
  }, [beginContinuousNativeScan]);

  const handleConnectToBleDevice = useCallback((device: BLEDeviceInfo) => {
    setDismissAfterConnection(true);
    stopContinuousNativeScan();
    void connectToDevice(device);
  }, [connectToDevice, stopContinuousNativeScan]);

  const handleStatusCardClick = useCallback(() => {
    setBleModalPresented(true);

    if (connectionState !== 'disconnected') {
      setShowBLEModal(true);
      return;
    }

    setShowBLEModal(true);
    handleBleScanAndConnect();
  }, [connectionState, handleBleScanAndConnect]);

  useEffect(() => {
    if (!showBLEModal || !dismissAfterConnection || connectionState !== 'connected') return;

    stopContinuousNativeScan();
    setDismissAfterConnection(false);
    setShowBLEModal(false);
  }, [connectionState, dismissAfterConnection, showBLEModal, stopContinuousNativeScan]);

  return {
    bleModalPresented,
    showBLEModal,
    isContinuousNativeScanActive,
    handleBLEModalDismiss,
    handleBleScanAndConnect,
    handleConnectToBleDevice,
    handleStatusCardClick,
  };
};
