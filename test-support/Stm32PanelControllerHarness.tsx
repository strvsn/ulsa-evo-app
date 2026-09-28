// Test-only controls for independently exercising each protocol gate.
// The production UI uses FirmwareUpdateWizard; these are not product screens.
import { Rocket } from 'lucide-react';
import type { Esp32OtaSession } from '../src/services/ota/esp32OtaTransfer';
import type { Stm32FirmwareReleaseOption } from '../src/services/ota/stm32FirmwareReleaseCatalog';
import type {
  Stm32PackageUploadProgress,
  Stm32UpdateHttpStatus,
} from '../src/services/ota/stm32OtaTransfer';
import type { Stm32FirmwareVersionStatus, Stm32UpdateControlStatus } from '../src/types/ble';
import type { NativeSoftApJoinResult } from '../src/services/ota/nativeSoftAp';
import { SectionCard } from '../src/components/ble-settings/primitives';
import { Stm32UpdateFlowControls } from './Stm32UpdateFlowControls';
import { Stm32UpdateReloadAction, Stm32UpdateStatusSummary } from '../src/components/ble-settings/Stm32UpdatePanelChrome';
import { Stm32UpdateMessage } from '../src/components/ble-settings/Stm32UpdateMessage';
import { Stm32UpdateStatusDetails } from '../src/components/ble-settings/Stm32UpdateStatusDetails';
import { describeConnectionPhase, type OtaConnectionPhase } from '../src/components/ble-settings/otaPanelHelpers';
import {
  describePackage,
  describePackageTransferStepDetail,
  describeProbeStepDetail,
  describeWriteStepDetail,
  type CachedStm32Package,
  type Stm32PanelMessage,
} from '../src/components/ble-settings/stm32UpdatePanelHelpers';
import type { useStm32SafeWriteFlow } from '../src/components/ble-settings/useStm32SafeWriteFlow';

type SafeWriteFlow = ReturnType<typeof useStm32SafeWriteFlow>;

type Props = {
  isConnected: boolean;
  releases: Stm32FirmwareReleaseOption[];
  selectedReleaseId: string | null;
  onSelectedReleaseIdChange: (releaseId: string | null) => void;
  selectedRelease: Stm32FirmwareReleaseOption | null;
  cachedPackage: CachedStm32Package | null;
  catalogBusy: boolean;
  downloadBusy: boolean;
  connectionFlowBusy: boolean;
  transferBusy: boolean;
  selectedPackageReady: boolean;
  canDownloadPackage: boolean;
  browserReleaseBlocked: boolean;
  networkReady: boolean;
  canStartUpdateNetwork: boolean;
  autoJoinAvailable: boolean;
  retryConnectionAvailable: boolean;
  recoverySessionAvailable: boolean;
  stm32UpdateSupported: boolean;
  connectionPhase: OtaConnectionPhase;
  connectionRemainingSeconds: number | null;
  session: Esp32OtaSession | null;
  writeLocked: boolean;
  uploadProgress: Stm32PackageUploadProgress | null;
  httpStatus: Stm32UpdateHttpStatus | null;
  message: Stm32PanelMessage | null;
  buttonGuideOpen: boolean;
  stm32UpdateControlStatus: Stm32UpdateControlStatus | null;
  stm32FirmwareVersion: Stm32FirmwareVersionStatus | null;
  observedBleNodeId?: number;
  wifiJoinResult: NativeSoftApJoinResult | null;
  safeWriteFlow: SafeWriteFlow;
  onReload: () => Promise<void>;
  onCacheSelectedPackage: () => void;
  onStartUpdateNetwork: () => void;
  onRefreshStm32HttpStatus: () => void;
  onDismissGuide: () => void;
};

export const Stm32FirmwareUpdatePanelView = ({
  isConnected,
  releases,
  selectedReleaseId,
  onSelectedReleaseIdChange,
  selectedRelease,
  cachedPackage,
  catalogBusy,
  downloadBusy,
  connectionFlowBusy,
  transferBusy,
  selectedPackageReady,
  canDownloadPackage,
  browserReleaseBlocked,
  networkReady,
  canStartUpdateNetwork,
  autoJoinAvailable,
  retryConnectionAvailable,
  recoverySessionAvailable,
  stm32UpdateSupported,
  connectionPhase,
  connectionRemainingSeconds,
  session,
  writeLocked,
  uploadProgress,
  httpStatus,
  message,
  stm32UpdateControlStatus,
  stm32FirmwareVersion,
  observedBleNodeId,
  wifiJoinResult,
  safeWriteFlow,
  onReload,
  onCacheSelectedPackage,
  onStartUpdateNetwork,
  onRefreshStm32HttpStatus,
}: Props) => {
  const firmwareStepDetail = catalogBusy
    ? 'Release読込中'
    : browserReleaseBlocked
      ? 'field/productionはiOSアプリ専用'
      : describePackage(cachedPackage, selectedRelease, downloadBusy);
  const connectionStepDetail = connectionFlowBusy
    ? `${describeConnectionPhase(connectionPhase)} / ${connectionRemainingSeconds && connectionRemainingSeconds > 0 ? `目安あと ${connectionRemainingSeconds} 秒` : '処理中'}`
    : recoverySessionAvailable
      ? 'Wi-Fi接続を再試行/状態確認'
      : !stm32UpdateSupported
        ? '未対応'
        : !selectedPackageReady
          ? 'Package取得後に有効'
          : networkReady
            ? '接続確認済み'
            : retryConnectionAvailable ? 'Wi-Fi接続を再試行'
              : session ? '状態確認待ち' : isConnected ? '接続待機' : 'BLE接続待ち';
  const packageTransferStepDetail = describePackageTransferStepDetail(
    safeWriteFlow.activeAction, uploadProgress, safeWriteFlow.storedPackageReady, networkReady
  );
  const probeStepDetail = describeProbeStepDetail(
    safeWriteFlow.activeAction, safeWriteFlow.probeReady, safeWriteFlow.storedPackageReady
  );
  const writeStepDetail = describeWriteStepDetail(
    safeWriteFlow.activeAction, httpStatus, safeWriteFlow.probeReady,
    safeWriteFlow.canResumeMonitoring
  );

  return (
    <>
      <SectionCard
        title="STM32 FW更新"
        icon={<Rocket className="ulsa-icon" size={18} strokeWidth={1.8} aria-hidden="true" />}
        actions={<Stm32UpdateReloadAction onClick={onReload} disabled={catalogBusy || downloadBusy || connectionFlowBusy || transferBusy} />}
      >
        <Stm32UpdateStatusSummary
          stm32UpdateSupported={stm32UpdateSupported}
          selectedPackageReady={selectedPackageReady}
          portalActive={Boolean(stm32UpdateControlStatus?.portalActive)}
          bootloaderSessionActive={Boolean(httpStatus?.bootloaderSessionActive)}
          protocolVersion={stm32UpdateControlStatus?.protocolVersion}
          physicalAuthRequired={stm32UpdateControlStatus?.physicalAuthRequired}
        />
        <p className="card-log-settings-message">
          STM32はクローズドソースです。正規署名済みpackageだけを使用し、通常更新でRDPは変更しません。受理済みより古いFW revisionは消去前に拒否します。
        </p>
        <Stm32UpdateFlowControls
          releases={releases}
          selectedReleaseId={selectedReleaseId}
          onSelectedReleaseIdChange={onSelectedReleaseIdChange}
          catalogBusy={catalogBusy}
          downloadBusy={downloadBusy}
          connectionFlowBusy={connectionFlowBusy}
          transferBusy={transferBusy}
          selectedPackageReady={selectedPackageReady}
          canDownloadPackage={canDownloadPackage}
          firmwareStepDetail={firmwareStepDetail}
          networkReady={networkReady}
          canStartUpdateNetwork={canStartUpdateNetwork}
          autoJoinAvailable={autoJoinAvailable}
          retryConnectionAvailable={retryConnectionAvailable}
          connectionStepDetail={connectionStepDetail}
          session={session}
          writeLocked={writeLocked}
          canCancelUpdate={safeWriteFlow.canCancelUpdate}
          storedPackageReady={safeWriteFlow.storedPackageReady}
          probeReady={safeWriteFlow.probeReady}
          canUploadPackage={safeWriteFlow.canUploadPackage}
          canProbePackage={safeWriteFlow.canProbePackage}
          canStartWrite={safeWriteFlow.canStartWrite}
          canResumeMonitoring={safeWriteFlow.canResumeMonitoring}
          packageTransferStepDetail={packageTransferStepDetail}
          probeStepDetail={probeStepDetail}
          writeStepDetail={writeStepDetail}
          uploadProgress={uploadProgress}
          httpStatus={httpStatus}
          onCacheSelectedPackage={onCacheSelectedPackage}
          onStartUpdateNetwork={onStartUpdateNetwork}
          onRefreshStm32HttpStatus={onRefreshStm32HttpStatus}
          onCancelUpdate={() => { void safeWriteFlow.cancelUpdate(); }}
          onUploadPackage={() => { void safeWriteFlow.uploadPackage(); }}
          onProbePackage={() => { void safeWriteFlow.probePackage(); }}
          onWriteOrResume={() => { void safeWriteFlow.writeOrResume(); }}
        />
        <Stm32UpdateMessage message={message} />
        {writeLocked && (
          <p className="card-log-settings-message">
            STM32消去/書込み開始後は安全のため中断できません。完了または復旧状態まで待ってください。
          </p>
        )}
        <Stm32UpdateStatusDetails
          selectedRelease={selectedRelease}
          cachedPackage={cachedPackage}
          httpStatus={httpStatus}
          stm32FirmwareVersion={stm32FirmwareVersion}
          session={session}
          observedBleNodeId={observedBleNodeId}
          wifiJoinResult={wifiJoinResult}
          probeReady={safeWriteFlow.probeReady}
        />
      </SectionCard>
    </>
  );
};
