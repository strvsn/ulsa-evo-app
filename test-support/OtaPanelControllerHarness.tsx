// Test-only controls for independently exercising each protocol gate.
// The production UI uses FirmwareUpdateWizard; these are not product screens.
import { IonSelect, IonSelectOption } from '@ionic/react';
import { CloudDownload, CloudUpload, RefreshCw, Rocket, Wifi } from 'lucide-react';
import type { OtaControlStatus } from '../src/types/ble';
import type { Esp32OtaHttpStatus, Esp32OtaSession, Esp32OtaUploadProgress } from '../src/services/ota/esp32OtaTransfer';
import {
  formatFirmwareReleaseLabel,
  type Esp32FirmwareReleaseOption,
} from '../src/services/ota/firmwareReleaseCatalog';
import type { NativeSoftApJoinResult } from '../src/services/ota/nativeSoftAp';
import { IonicControlButton, NativeControlButton } from '../src/components/controls';
import { SectionCard, StatusItem, StatusSummary } from '../src/components/ble-settings/primitives';
import { OtaSessionDetails } from '../src/components/ble-settings/OtaSessionDetails';
import { describeConnectionPhase, type OtaConnectionPhase } from '../src/components/ble-settings/otaPanelHelpers';

type Message = { text: string; role: 'status' | 'alert' } | null;

interface OtaPanelViewProps {
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
  onReload: () => void;
  onToggleInitialSetup: () => void;
  onSelectedReleaseIdChange: (value: string | null) => void;
  onCacheFirmware: () => void;
  onStartUpdateNetwork: () => void;
  onUpload: () => void;
  onRefreshHttpStatus: () => void;
  onCopySessionValue: (label: string, value?: string) => void;
}

export const OtaPanelView = (props: OtaPanelViewProps) => {
  const connectionStepDetail = props.connectionFlowBusy
    ? `${describeConnectionPhase(props.connectionPhase)} / ${props.connectionRemainingSeconds && props.connectionRemainingSeconds > 0 ? `目安あと ${props.connectionRemainingSeconds} 秒` : '処理中'}`
    : props.initialSetupMode
      ? props.networkReady ? '接続確認済み' : 'Initialのボタン操作待ち'
      : props.networkReady ? '接続確認済み'
        : !props.isConnected ? 'BLE未接続'
          : !props.otaSupported ? '未対応'
          : !props.selectedFirmwareReady ? 'FW取得後に有効'
            : props.wifiJoinResult?.connected ? '接続要求済み / ESP32未確認'
              : props.otaControlStatus?.portalActive ? '状態確認待ち' : '待機中';
  const transferStepDetail = props.transferBusy
    ? props.uploadProgress ? `送信 ${props.uploadProgress.percent}%` : '送信中'
    : props.otaControlStatus?.updating ? `ESP32更新中 ${props.otaControlStatus.progress}%`
      : !props.selectedFirmwareReady ? 'FW未取得'
        : !props.session || !props.networkReady ? 'Wi-Fi接続後に有効' : '転送待機';

  return (
    <SectionCard
      title="ESP32 FW更新"
      icon={<CloudUpload className="ulsa-icon" size={18} strokeWidth={1.8} aria-hidden="true" />}
      actions={<>
        <IonicControlButton controlSize="C36" fill="outline" size="small"
          onClick={props.onReload}
          disabled={props.firmwareCatalogBusy || props.firmwareDownloadBusy || props.connectionFlowBusy || props.transferBusy}>
          <span slot="start" className="ble-button-icon" aria-hidden="true">
            <RefreshCw className="ulsa-icon" size={17} strokeWidth={1.9} />
          </span>
          再読込
        </IonicControlButton>
        {!props.isConnected && (
          <IonicControlButton controlSize="C36" fill={props.initialSetupMode ? 'solid' : 'outline'} size="small"
            onClick={props.onToggleInitialSetup}
            disabled={!props.initialSetupSupported || props.connectionFlowBusy || props.transferBusy}>
            InitialからDemoをセットアップ
          </IonicControlButton>
        )}
      </>}
    >
      <StatusSummary>
        <StatusItem tone={props.otaSupported || props.initialSetupMode ? 'neutral' : 'attention'}>
          {props.otaSupported || props.initialSetupMode ? '対応' : '未対応'}
        </StatusItem>
        {props.selectedFirmwareReady && <StatusItem>FW取得済み</StatusItem>}
        {props.otaControlStatus && props.otaControlStatus.protocolVersion < 3 && <StatusItem tone="attention">旧FW・物理認可なし</StatusItem>}
        {props.otaControlStatus?.physicalAuthRequired && <StatusItem tone="attention">本体ボタン確認待ち</StatusItem>}
        {props.connectionFlowBusy && <StatusItem>{describeConnectionPhase(props.connectionPhase)}</StatusItem>}
        {props.otaControlStatus?.portalActive && <StatusItem tone="attention">Wi-Fi起動中</StatusItem>}
        {props.otaControlStatus?.updating && <StatusItem tone="critical">更新中</StatusItem>}
      </StatusSummary>

      <div className="ota-flow">
        <IonSelect className="ota-firmware-input" interface="popover"
          placeholder={props.firmwareCatalogBusy ? '読み込み中' : 'Release未取得'}
          value={props.selectedReleaseId ?? undefined}
          disabled={props.firmwareCatalogBusy || props.firmwareDownloadBusy || props.connectionFlowBusy || props.transferBusy || props.firmwareReleases.length === 0}
          onIonChange={(event) => props.onSelectedReleaseIdChange(String(event.detail.value || '') || null)}>
          {props.firmwareReleases.map((release) => (
            <IonSelectOption key={release.id} value={release.id}>
              {formatFirmwareReleaseLabel(release)}
            </IonSelectOption>
          ))}
        </IonSelect>

        <NativeControlButton controlSize="R56" selectionState={props.selectedFirmwareReady ? 'on' : 'off'} tone="success"
          className={`ota-flow-step-button${props.selectedFirmwareReady ? ' complete' : ''}`}
          onClick={props.onCacheFirmware} disabled={!props.canDownloadFirmware}>
          <span className="ota-flow-step-index">1</span><span className="ota-flow-step-main">
            <span className="ota-flow-step-title">FWを取得</span><span className="ota-flow-step-detail">{props.firmwareStepDetail}</span>
          </span><CloudDownload className="ulsa-icon" size={20} strokeWidth={1.8} aria-hidden="true" />
        </NativeControlButton>

        <NativeControlButton controlSize="R56" selectionState={props.networkReady ? 'on' : 'off'} tone="success"
          className={`ota-flow-step-button${props.networkReady ? ' complete' : ''}`}
          onClick={props.onStartUpdateNetwork} disabled={!props.canStartUpdateNetwork}>
          <span className="ota-flow-step-index">2</span><span className="ota-flow-step-main">
            <span className="ota-flow-step-title">{props.autoJoinAvailable ? '更新用Wi-Fiに接続' : '更新用Wi-Fiを開始'}</span>
            <span className="ota-flow-step-detail" aria-live="polite">{connectionStepDetail}</span>
          </span><Wifi className="ulsa-icon" size={20} strokeWidth={1.8} aria-hidden="true" />
        </NativeControlButton>

        <NativeControlButton controlSize="R56" controlVariant="primary" tone="accent" className="ota-flow-step-button primary"
          onClick={props.onUpload} disabled={!props.canUpload}>
          <span className="ota-flow-step-index">3</span><span className="ota-flow-step-main">
            <span className="ota-flow-step-title">転送して更新</span><span className="ota-flow-step-detail">{transferStepDetail}</span>
          </span><Rocket className="ulsa-icon" size={20} strokeWidth={1.8} aria-hidden="true" />
        </NativeControlButton>

        {props.uploadProgress && <div className="ota-progress-track" role="progressbar"
          aria-label="ESP32ファームウェア転送の進捗" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={props.uploadProgress.percent} aria-valuetext={`${props.uploadProgress.percent}%`}>
          <span style={{ width: `${props.uploadProgress.percent}%` }} />
        </div>}
      </div>

      {props.message && <p className="card-log-settings-message" role={props.message.role}
        aria-live={props.message.role === 'alert' ? 'assertive' : 'polite'}>{props.message.text}</p>}
      {props.session && <OtaSessionDetails session={props.session} wifiJoinResult={props.wifiJoinResult}
        httpStatus={props.httpStatus} transferBusy={props.transferBusy}
        onRefreshHttpStatus={props.onRefreshHttpStatus} onCopySessionValue={props.onCopySessionValue} />}
    </SectionCard>
  );
};
