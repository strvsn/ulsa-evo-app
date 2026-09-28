import { RefreshCw } from 'lucide-react';
import { StatusItem, StatusSummary } from './primitives';
import { IonicControlButton } from '../controls';

type ReloadActionProps = {
  disabled: boolean;
  onClick: () => Promise<void>;
};

export const Stm32UpdateReloadAction = ({ disabled, onClick }: ReloadActionProps) => (
  <IonicControlButton controlSize="C36" fill="outline" onClick={onClick} disabled={disabled}>
    <span slot="start" className="ble-button-icon" aria-hidden="true">
      <RefreshCw className="ulsa-icon" size={17} strokeWidth={1.9} />
    </span>
    再読込
  </IonicControlButton>
);

type BadgesProps = {
  stm32UpdateSupported: boolean;
  selectedPackageReady: boolean;
  portalActive: boolean;
  bootloaderSessionActive: boolean;
  protocolVersion?: number;
  physicalAuthRequired?: boolean;
};

export const Stm32UpdateStatusSummary = ({
  stm32UpdateSupported,
  selectedPackageReady,
  portalActive,
  bootloaderSessionActive,
  protocolVersion,
  physicalAuthRequired,
}: BadgesProps) => (
  <StatusSummary>
    <StatusItem tone={stm32UpdateSupported ? 'neutral' : 'attention'}>
      {stm32UpdateSupported ? '対応' : '未対応'}
    </StatusItem>
    {selectedPackageReady && <StatusItem>Package取得済み</StatusItem>}
    {typeof protocolVersion === 'number' && protocolVersion < 3 && (
      <StatusItem tone="attention">旧FW・物理認可なし</StatusItem>
    )}
    {physicalAuthRequired && <StatusItem tone="attention">本体ボタン確認待ち</StatusItem>}
    {portalActive && <StatusItem tone="attention">Wi-Fi起動中</StatusItem>}
    {bootloaderSessionActive && <StatusItem tone="critical">STM32書込み中</StatusItem>}
  </StatusSummary>
);
