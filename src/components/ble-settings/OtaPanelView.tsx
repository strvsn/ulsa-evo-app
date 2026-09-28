import { useState } from 'react';
import type { OtaControlStatus } from '../../types/ble';
import type { Esp32OtaHttpStatus, Esp32OtaSession, Esp32OtaUploadProgress } from '../../services/ota/esp32OtaTransfer';
import type { Esp32FirmwareReleaseOption } from '../../services/ota/firmwareReleaseCatalog';
import type { NativeSoftApJoinResult } from '../../services/ota/nativeSoftAp';
import { IonicControlButton } from '../controls';
import { requestInitialFirmwareOnboarding } from '../../services/initialFirmwareOnboardingPreference';
import { FirmwareUpdateEntry } from './FirmwareUpdateEntry';
import { userFirmwareLabel } from './userFirmwareLabel';
import { FirmwareUpdateWizard, type FirmwareWizardStage } from './FirmwareUpdateWizard';
import { useOtaPreparation } from './useOtaPreparation';
import { firmwareUpdateError } from './firmwareUpdateError';
import type { OtaConnectionPhase } from './otaPanelHelpers';

type Message = { text: string; role: 'status' | 'alert' } | null;

export interface OtaPanelViewProps {
  isConnected: boolean;
  initialSetupMode: boolean;
  initialSetupSupported: boolean;
  otaSupported: boolean;
  selectedFirmwareReady: boolean;
  networkReady: boolean;
  canDownloadFirmware: boolean;
  canStartUpdateNetwork: boolean;
  canUpload: boolean;
  firmwareReleases: Esp32FirmwareReleaseOption[];
  selectedReleaseId: string | null;
  firmwareCatalogBusy: boolean;
  firmwareDownloadBusy: boolean;
  connectionFlowBusy: boolean;
  transferBusy: boolean;
  connectionPhase: OtaConnectionPhase;
  connectionRemainingSeconds: number | null;
  wifiJoinResult: NativeSoftApJoinResult | null;
  otaControlStatus: OtaControlStatus | null;
  uploadProgress: Esp32OtaUploadProgress | null;
  firmwareStepDetail: string;
  session: Esp32OtaSession | null;
  httpStatus: Esp32OtaHttpStatus | null;
  message: Message;
  autoJoinAvailable: boolean;
  updateComplete: boolean;
  onReload: () => void;
  onToggleInitialSetup: () => void;
  onSelectedReleaseIdChange: (value: string | null) => void;
  onCacheFirmware: () => Promise<unknown>;
  onStartUpdateNetwork: () => Promise<unknown>;
  onUpload: () => Promise<unknown>;
  onRefreshHttpStatus: () => Promise<unknown>;
  onClearMessage: () => void;
  onError: (error: unknown) => void;
  onCopySessionValue: (label: string, value?: string) => void;
}

export const OtaPanelView = (props: OtaPanelViewProps) => {
  const [open, setOpen] = useState(false);
  const selected = props.firmwareReleases.find((release) => release.id === props.selectedReleaseId);
  const busy = props.firmwareDownloadBusy || props.connectionFlowBusy || props.transferBusy;
  const preparation = useOtaPreparation({
    bindingKey: props.selectedReleaseId ?? '', busy, onError: props.onError,
    steps: [
      { id: 'download', done: props.selectedFirmwareReady, available: props.canDownloadFirmware, run: props.onCacheFirmware },
      { id: 'connect', done: props.networkReady, available: props.canStartUpdateNetwork, run: props.onStartUpdateNetwork },
    ],
  });
  const error = firmwareUpdateError(props.message?.role === 'alert' ? props.message.text : null);
  const working = busy || preparation.running;
  const manualWifi = !props.autoJoinAvailable && !!props.session && !props.networkReady && !working;
  const wifiConnecting = props.connectionFlowBusy &&
    ['softAp', 'iosPrompt', 'wifi'].includes(props.connectionPhase);
  const stage: FirmwareWizardStage = props.updateComplete ? 'complete'
    : error && !working ? 'error'
      : props.transferBusy && props.networkReady ? 'updating'
        : props.networkReady ? 'ready'
          : props.connectionFlowBusy &&
            (props.connectionPhase === 'credentials' || props.connectionPhase === 'physicalAuth') ? 'button'
          : manualWifi ? 'manualWifi'
            : wifiConnecting || (props.session && !props.networkReady) ? 'connection'
              : !props.selectedFirmwareReady ? 'download' : 'button';
  const connectionDescription = '本体の更新用Wi-Fiへ接続しています。';
  const prepare = () => { props.onClearMessage(); preparation.start(); };
  const dismiss = () => { if (!working) preparation.stop(); setOpen(false); };
  const canPrepare = (props.isConnected && props.otaSupported) || props.initialSetupMode;

  return <>
    <FirmwareUpdateEntry target="ESP32" description={canPrepare
      ? '本体の通信機能を更新します。画面の案内に沿って進められます。'
      : '本体にBLE接続すると、更新を準備できます。'}
      releases={props.firmwareReleases.map((release) => ({ id: release.id, label: userFirmwareLabel(release) }))}
      selectedRelease={selected}
      selectedId={props.selectedReleaseId} onSelect={props.onSelectedReleaseIdChange}
      disabled={working || props.firmwareCatalogBusy || (!props.updateComplete && (!selected || !canPrepare))}
      busy={working || props.firmwareCatalogBusy || open} onReload={props.onReload}
      actionLabel={props.updateComplete ? '更新結果を見る' : open ? '更新画面に戻る' : undefined}
      onOpen={() => { setOpen(true); if (!props.updateComplete) prepare(); }} error={!open ? error : null}>
      {!props.isConnected && <IonicControlButton controlSize="M44" fill="outline"
        onClick={requestInitialFirmwareOnboarding} disabled={!props.initialSetupSupported || working}>
        初回セットアップ
      </IonicControlButton>}
    </FirmwareUpdateEntry>
    <FirmwareUpdateWizard isOpen={open} target="ESP32" version={selected ? userFirmwareLabel(selected) : undefined}
      stage={stage} busy={working} onDismiss={dismiss} error={error}
      buttonReady={props.connectionPhase === 'physicalAuth' && props.connectionFlowBusy}
      connectionPhase={props.connectionPhase} connectionRemainingSeconds={props.connectionRemainingSeconds}
      autoJoinAvailable={props.autoJoinAvailable}
      connectionInstruction={stage === 'connection' && props.connectionPhase === 'iosPrompt'
        ? 'iPhoneのWi-Fi接続確認で「接続」を選んでください。' : undefined}
      progress={stage === 'updating' ? props.uploadProgress?.percent : undefined}
      progressLabel="ESP32ファームウェア転送の進捗" manualSession={props.session}
      description={stage === 'complete' ? '本体が再起動します。計測が再開しない場合は、アプリから再接続してください。'
        : stage === 'connection' ? connectionDescription : undefined}
      primaryAction={props.updateComplete ? { label: '閉じる', run: dismiss }
        : props.canUpload && !error ? { label: '更新を開始', run: () => { void props.onUpload(); } }
          : manualWifi ? { label: '接続を確認', run: () => { void props.onRefreshHttpStatus(); } }
            : props.session && !props.isConnected && !props.networkReady
              ? { label: '接続を再確認', run: () => { void props.onRefreshHttpStatus(); } }
              : props.selectedFirmwareReady && props.canStartUpdateNetwork && !error
                ? { label: '本体操作を開始', run: () => { void props.onStartUpdateNetwork(); } }
              : { label: '準備をやり直す', run: prepare, disabled: !canPrepare || !selected }}
    />
  </>;
};
