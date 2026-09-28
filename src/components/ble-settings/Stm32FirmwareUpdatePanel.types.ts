import type { BLEPlatformInfo } from '../../services/ble';
import type {
  BLECapabilitiesStatus,
  Stm32FirmwareVersionStatus,
  Stm32UpdateControlOp,
  Stm32UpdateControlSessionBinding,
  Stm32UpdateControlStatus,
} from '../../types/ble';

export type Stm32FirmwareUpdatePanelProps = {
  isConnected: boolean;
  capabilitiesStatus: BLECapabilitiesStatus | null;
  stm32FirmwareVersion: Stm32FirmwareVersionStatus | null;
  stm32UpdateControlStatus: Stm32UpdateControlStatus | null;
  stm32UpdateControlBusy: boolean;
  observedBleNodeId?: number;
  platformInfo: BLEPlatformInfo | null;
  onRefreshStm32FirmwareVersion: () => void;
  onRefreshStm32UpdateControlStatus: () => Promise<void>;
  onWriteStm32UpdateControl: (
    op: Stm32UpdateControlOp,
    binding?: Stm32UpdateControlSessionBinding,
  ) => Promise<Stm32UpdateControlStatus | null>;
};
