import type { BLEConnectionState, BLEDataState, BLEDeviceInfo } from '../../hooks/useBLE';
import type { BLEPlatformInfo } from '../../services/ble';

export interface BLEModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  connectionState: BLEConnectionState;
  dataState: BLEDataState;
  connectedDevice: BLEDeviceInfo | null;
  availableDevices: BLEDeviceInfo[];
  identifyingDeviceId?: string | null;
  error: string | null;
  isSupported: boolean;
  platformInfo: BLEPlatformInfo | null;
  themeGradient?: string;
  themeIsLight?: boolean;
  /** Capacitor scan is retrying after a normal no-device result. */
  isContinuousNativeScanActive?: boolean;
  onScanAndConnect: () => void;
  onConnectToDevice: (device: BLEDeviceInfo) => void;
  onIdentifyDevice?: (device: BLEDeviceInfo) => void;
  onDisconnect: () => void;
  onClearError: () => void;
}
