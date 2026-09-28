// Test-only controls for independently exercising each protocol gate.
// The production UI uses FirmwareUpdateWizard; these are not product screens.
import { IonSelect, IonSelectOption } from '@ionic/react';
import { CloudDownload, CloudUpload, Rocket, ShieldCheck, Wifi } from 'lucide-react';
import type { Esp32OtaSession } from '../src/services/ota/esp32OtaTransfer';
import {
  formatStm32FirmwareReleaseLabel,
  type Stm32FirmwareReleaseOption,
} from '../src/services/ota/stm32FirmwareReleaseCatalog';
import type { Stm32PackageUploadProgress, Stm32UpdateHttpStatus } from '../src/services/ota/stm32OtaTransfer';
import { IonicControlButton, NativeControlButton } from '../src/components/controls';

type Props = {
  releases: Stm32FirmwareReleaseOption[];
  selectedReleaseId: string | null;
  onSelectedReleaseIdChange: (releaseId: string | null) => void;
  catalogBusy: boolean;
  downloadBusy: boolean;
  connectionFlowBusy: boolean;
  transferBusy: boolean;
  selectedPackageReady: boolean;
  canDownloadPackage: boolean;
  firmwareStepDetail: string;
  networkReady: boolean;
  canStartUpdateNetwork: boolean;
  autoJoinAvailable: boolean;
  retryConnectionAvailable?: boolean;
  connectionStepDetail: string;
  session: Esp32OtaSession | null;
  writeLocked: boolean;
  canCancelUpdate: boolean;
  storedPackageReady: boolean;
  probeReady: boolean;
  canUploadPackage: boolean;
  canProbePackage: boolean;
  canStartWrite: boolean;
  canResumeMonitoring: boolean;
  packageTransferStepDetail: string;
  probeStepDetail: string;
  writeStepDetail: string;
  uploadProgress: Stm32PackageUploadProgress | null;
  httpStatus: Stm32UpdateHttpStatus | null;
  onCacheSelectedPackage: () => void;
  onStartUpdateNetwork: () => void;
  onRefreshStm32HttpStatus: () => void;
  onCancelUpdate: () => void;
  onUploadPackage: () => void;
  onProbePackage: () => void;
  onWriteOrResume: () => void;
};

export const Stm32UpdateFlowControls = ({
  releases,
  selectedReleaseId,
  onSelectedReleaseIdChange,
  catalogBusy,
  downloadBusy,
  connectionFlowBusy,
  transferBusy,
  selectedPackageReady,
  canDownloadPackage,
  firmwareStepDetail,
  networkReady,
  canStartUpdateNetwork,
  autoJoinAvailable,
  retryConnectionAvailable = false,
  connectionStepDetail,
  session,
  writeLocked,
  canCancelUpdate,
  storedPackageReady,
  probeReady,
  canUploadPackage,
  canProbePackage,
  canStartWrite,
  canResumeMonitoring,
  packageTransferStepDetail,
  probeStepDetail,
  writeStepDetail,
  uploadProgress,
  httpStatus,
  onCacheSelectedPackage,
  onStartUpdateNetwork,
  onRefreshStm32HttpStatus,
  onCancelUpdate,
  onUploadPackage,
  onProbePackage,
  onWriteOrResume,
}: Props) => (
  <div className="ota-flow">
    <IonSelect
      className="ota-firmware-input"
      interface="popover"
      placeholder={catalogBusy ? '読み込み中' : 'Release未取得'}
      value={selectedReleaseId ?? undefined}
      disabled={catalogBusy || downloadBusy || connectionFlowBusy || transferBusy || releases.length === 0}
      onIonChange={(event) => onSelectedReleaseIdChange(String(event.detail.value || '') || null)}
    >
      {releases.map((release) => (
        <IonSelectOption key={release.id} value={release.id}>
          {formatStm32FirmwareReleaseLabel(release)}
        </IonSelectOption>
      ))}
    </IonSelect>

    <NativeControlButton
      controlSize="R56"
      selectionState={selectedPackageReady ? 'on' : 'off'}
      tone="success"
      className={`ota-flow-step-button${selectedPackageReady ? ' complete' : ''}`}
      onClick={onCacheSelectedPackage}
      disabled={!canDownloadPackage}
    >
      <span className="ota-flow-step-index">1</span>
      <span className="ota-flow-step-main">
        <span className="ota-flow-step-title">Packageを取得</span>
        <span className="ota-flow-step-detail">{firmwareStepDetail}</span>
      </span>
      <CloudDownload className="ulsa-icon" size={20} strokeWidth={1.8} aria-hidden="true" />
    </NativeControlButton>

    <NativeControlButton
      controlSize="R56"
      selectionState={networkReady ? 'on' : 'off'}
      tone="success"
      className={`ota-flow-step-button${networkReady ? ' complete' : ''}`}
      onClick={onStartUpdateNetwork}
      disabled={!canStartUpdateNetwork}
    >
      <span className="ota-flow-step-index">2</span>
      <span className="ota-flow-step-main">
        <span className="ota-flow-step-title">
          {retryConnectionAvailable
            ? 'STM32用Wi-Fiへ再接続'
            : autoJoinAvailable ? 'STM32用Wi-Fiに接続' : 'STM32用Wi-Fiを開始'}
        </span>
        <span className="ota-flow-step-detail" aria-live="polite">{connectionStepDetail}</span>
      </span>
      <Wifi className="ulsa-icon" size={20} strokeWidth={1.8} aria-hidden="true" />
    </NativeControlButton>

    <IonicControlButton
      controlSize="C36"
      fill="outline"
      size="small"
      onClick={onRefreshStm32HttpStatus}
      disabled={!session || transferBusy || connectionFlowBusy}
    >
      {autoJoinAvailable ? 'STM32 status再確認' : 'STM32 status確認'}
    </IonicControlButton>

    <NativeControlButton
      controlSize="R56"
      selectionState={storedPackageReady ? 'on' : 'off'}
      tone="success"
      className={`ota-flow-step-button${storedPackageReady ? ' complete' : ''}`}
      onClick={onUploadPackage}
      disabled={!canUploadPackage}
    >
      <span className="ota-flow-step-index">3</span>
      <span className="ota-flow-step-main">
        <span className="ota-flow-step-title">Packageを転送</span>
        <span className="ota-flow-step-detail" aria-live="polite">{packageTransferStepDetail}</span>
      </span>
      <CloudUpload className="ulsa-icon" size={20} strokeWidth={1.8} aria-hidden="true" />
    </NativeControlButton>

    <NativeControlButton
      controlSize="R56"
      selectionState={probeReady ? 'on' : 'off'}
      tone="success"
      className={`ota-flow-step-button${probeReady ? ' complete' : ''}`}
      onClick={onProbePackage}
      disabled={!canProbePackage}
    >
      <span className="ota-flow-step-index">4</span>
      <span className="ota-flow-step-main">
        <span className="ota-flow-step-title">消去せず接続確認</span>
        <span className="ota-flow-step-detail" aria-live="polite">{probeStepDetail}</span>
      </span>
      <ShieldCheck className="ulsa-icon" size={20} strokeWidth={1.8} aria-hidden="true" />
    </NativeControlButton>

    <NativeControlButton
      controlSize="R56"
      controlVariant="primary"
      tone="accent"
      className="ota-flow-step-button primary"
      onClick={onWriteOrResume}
      disabled={!canStartWrite && !canResumeMonitoring}
    >
      <span className="ota-flow-step-index">5</span>
      <span className="ota-flow-step-main">
        <span className="ota-flow-step-title">
          {canResumeMonitoring ? '書込み監視を再開' : 'STM32へ書込み'}
        </span>
        <span className="ota-flow-step-detail" aria-live="polite">{writeStepDetail}</span>
      </span>
      <Rocket className="ulsa-icon" size={20} strokeWidth={1.8} aria-hidden="true" />
    </NativeControlButton>

    <IonicControlButton
      controlSize="M44"
      controlVariant="destructive"
      tone="danger"
      fill="outline"
      color={writeLocked ? 'medium' : 'danger'}
      size="small"
      onClick={onCancelUpdate}
      disabled={!canCancelUpdate}
    >
      {writeLocked ? '書込み中断不可' : 'STM32更新を中止'}
    </IonicControlButton>

    {(uploadProgress || httpStatus) && (
      <div
        className="ota-progress-track"
        role="progressbar"
        aria-label="STM32ファームウェア更新の進捗"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={uploadProgress?.percent ?? httpStatus?.progress ?? 0}
        aria-valuetext={`${uploadProgress?.percent ?? httpStatus?.progress ?? 0}%`}
      >
        <span style={{ width: `${uploadProgress?.percent ?? httpStatus?.progress ?? 0}%` }} />
      </div>
    )}
  </div>
);
