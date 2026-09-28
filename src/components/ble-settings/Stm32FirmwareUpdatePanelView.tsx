import { useState } from 'react';
import type { Stm32FirmwareVersionStatus, Stm32UpdateControlStatus } from '../../types/ble';
import type { Esp32OtaSession } from '../../services/ota/esp32OtaTransfer';
import type { Stm32FirmwareReleaseOption } from '../../services/ota/stm32FirmwareReleaseCatalog';
import type { NativeSoftApJoinResult } from '../../services/ota/nativeSoftAp';
import type { Stm32PackageUploadProgress, Stm32UpdateHttpStatus } from '../../services/ota/stm32OtaTransfer';
import type { OtaConnectionPhase } from './otaPanelHelpers';
import type { useStm32SafeWriteFlow } from './useStm32SafeWriteFlow';
import { statusSessionMatchesRelease, STM32_MANUAL_WIFI_INSTRUCTION, STM32_MANUAL_WIFI_RETRY_INSTRUCTION, type CachedStm32Package, type Stm32PanelMessage } from './stm32UpdatePanelHelpers';
import { FirmwareUpdateEntry } from './FirmwareUpdateEntry';
import { userFirmwareLabel } from './userFirmwareLabel';
import { FirmwareUpdateWizard, type FirmwareWizardAction, type FirmwareWizardStage } from './FirmwareUpdateWizard';
import { useOtaPreparation } from './useOtaPreparation';
import { firmwareUpdateError } from './firmwareUpdateError';
import { stm32WriteProgress } from './stm32CompletionGuard';

export type Stm32FirmwareUpdatePanelViewProps = {
  isConnected: boolean;
  releases: Stm32FirmwareReleaseOption[];
  selectedReleaseId: string | null;
  onSelectedReleaseIdChange: (value: string | null) => void;
  selectedRelease: Stm32FirmwareReleaseOption | null;
  cachedPackage: CachedStm32Package | null;
  catalogBusy: boolean;
  downloadBusy: boolean;
  connectionFlowBusy: boolean;
  transferBusy: boolean;
  selectedPackageReady: boolean;
  canDownloadPackage: boolean;
  browserReleaseBlocked: boolean;
  browserUpdateUnavailableReason: string | null;
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
  stm32UpdateControlStatus: Stm32UpdateControlStatus | null;
  stm32FirmwareVersion: Stm32FirmwareVersionStatus | null;
  observedBleNodeId?: number;
  wifiJoinResult: NativeSoftApJoinResult | null;
  safeWriteFlow: ReturnType<typeof useStm32SafeWriteFlow>;
  onReload: () => Promise<void>;
  onCacheSelectedPackage: () => Promise<unknown>;
  onStartUpdateNetwork: () => Promise<unknown>;
  onRefreshStm32HttpStatus: () => Promise<unknown>;
  onClearMessage: () => void;
  onError: (error: unknown) => void;
};

export const Stm32FirmwareUpdatePanelView = (props: Stm32FirmwareUpdatePanelViewProps) => {
  const [open, setOpen] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const flow = props.safeWriteFlow;
  const busy = props.downloadBusy || props.connectionFlowBusy || props.transferBusy;
  const complete = props.httpStatus?.phase === 'complete' && statusSessionMatchesRelease(props.httpStatus, props.selectedRelease);
  const canceled = cancelRequested && !busy && !props.session && !props.cachedPackage && !props.httpStatus;
  const preparation = useOtaPreparation({
    bindingKey: props.selectedReleaseId ?? '', busy, onError: props.onError,
    steps: [
      { id: 'download', done: props.selectedPackageReady || flow.storedPackageReady || props.recoverySessionAvailable, available: props.canDownloadPackage && !props.writeLocked, run: props.onCacheSelectedPackage },
      { id: 'connect', done: props.networkReady, available: props.canStartUpdateNetwork && !props.writeLocked, run: props.onStartUpdateNetwork },
      { id: 'upload', done: flow.storedPackageReady, available: flow.canUploadPackage, run: flow.uploadPackage },
      { id: 'probe', done: flow.probeReady, available: flow.canProbePackage, run: flow.probePackage },
    ],
  });
  const working = busy || preparation.running;
  const error = firmwareUpdateError(props.message?.role === 'alert' ? props.message.text : null);
  const manualWifi = !props.autoJoinAvailable && !!props.session && !props.networkReady && !working;
  const wifiConnecting = props.connectionFlowBusy &&
    ['softAp', 'iosPrompt', 'wifi'].includes(props.connectionPhase);
  const stage: FirmwareWizardStage = complete ? 'complete' : canceled ? 'canceled'
    : error && !working ? 'error'
      : props.writeLocked || flow.activeAction === 'write' || flow.activeAction === 'monitor' ? 'updating'
        : flow.probeReady ? 'ready'
          : props.networkReady ? 'checking'
            : props.connectionFlowBusy &&
              (props.connectionPhase === 'credentials' || props.connectionPhase === 'physicalAuth') ? 'button'
            : manualWifi ? 'manualWifi'
              : wifiConnecting || (props.session && !props.networkReady) ? 'connection'
                : !props.selectedPackageReady && !flow.storedPackageReady && !props.recoverySessionAvailable
                  ? 'download' : 'button';
  const connectionDescription = '本体の更新用Wi-Fiへ接続しています。';
  const prepare = () => { setCancelRequested(false); props.onClearMessage(); preparation.start(); };
  const dismiss = () => { if (!working) preparation.stop(); setOpen(false); };
  const checkConnection = async () => {
    props.onClearMessage();
    return props.onRefreshStm32HttpStatus();
    // A reattached write is observed only. Automatic preparation never starts
    // or retries a destructive write, including ambiguous HTTP failures.
  };
  let primaryAction: FirmwareWizardAction;
  if (complete || canceled) primaryAction = { label: '閉じる', run: dismiss };
  else if (flow.canResumeMonitoring) primaryAction = { label: '更新の確認を続ける', run: () => { void flow.writeOrResume(); } };
  else if (flow.canStartWrite && !error) primaryAction = { label: '更新を開始', run: () => { void flow.writeOrResume(); } };
  else if (manualWifi) primaryAction = { label: '接続を確認', run: () => {
    void checkConnection().then((connected) => { if (connected === true) prepare(); });
  } };
  else if (props.session && !props.networkReady) primaryAction = {
    label: props.canStartUpdateNetwork && !props.writeLocked ? 'Wi-Fiへ再接続' : '更新状態を確認',
    run: () => {
      if (props.canStartUpdateNetwork && !props.writeLocked) {
        props.onClearMessage();
        void props.onStartUpdateNetwork();
      } else { void checkConnection(); }
    },
  };
  else if (props.selectedPackageReady && props.canStartUpdateNetwork && !error) primaryAction = {
    label: '本体操作を開始', run: () => { void props.onStartUpdateNetwork(); },
  };
  else primaryAction = { label: '準備をやり直す', run: prepare,
    disabled: !props.selectedRelease || props.writeLocked || props.browserReleaseBlocked };

  const canOpen = !!props.session || complete || (props.isConnected && props.stm32UpdateSupported && !props.browserReleaseBlocked && !!props.selectedRelease);
  const entryDescription = props.browserUpdateUnavailableReason
    ?? (!props.isConnected && !props.session ? '本体にBLE接続すると、更新を準備できます。'
      : !props.stm32UpdateSupported && !props.session ? 'この本体はアプリからの更新に対応していません。'
        : props.autoJoinAvailable ? '本体の計測機能を更新します。準備ができたら開始を確認します。'
          : '本体の計測機能を更新します。更新用Wi-Fiへの手動接続とブラウザのアクセス許可が必要です。');

  return <>
    <FirmwareUpdateEntry target="STM32" description={entryDescription}
      releases={props.releases.map((release) => ({ id: release.id, label: userFirmwareLabel(release) }))}
      selectedRelease={props.selectedRelease}
      selectedId={props.selectedReleaseId} onSelect={props.onSelectedReleaseIdChange}
      disabled={!canOpen || working || props.catalogBusy} busy={working || props.catalogBusy || open || props.writeLocked}
      onReload={() => { void props.onReload(); }} error={!open ? error : null}
      actionLabel={complete ? '更新結果を見る' : props.writeLocked || error ? '更新を再確認' : undefined}
      onOpen={() => {
        setOpen(true);
        if (complete) return;
        if (props.writeLocked || error) { void checkConnection(); }
        else prepare();
      }} />
    <FirmwareUpdateWizard isOpen={open} target="STM32" version={props.selectedRelease ? userFirmwareLabel(props.selectedRelease) : undefined}
      stage={stage} busy={working} onDismiss={dismiss} error={error} primaryAction={primaryAction}
      buttonReady={props.connectionPhase === 'physicalAuth' && props.connectionFlowBusy}
      connectionPhase={props.connectionPhase} connectionRemainingSeconds={props.connectionRemainingSeconds}
      autoJoinAvailable={props.autoJoinAvailable}
      connectionInstruction={stage === 'connection' && props.connectionPhase === 'iosPrompt'
        ? 'iPhoneのWi-Fi接続確認で「接続」を選んでください。' : undefined}
      manualSession={props.session}
      progress={stage === 'updating' ? stm32WriteProgress(props.httpStatus)
        : stage === 'checking' && flow.activeAction === 'upload' ? props.uploadProgress?.percent : undefined}
      progressLabel="STM32ファームウェア更新の進捗"
      description={stage === 'updating' && props.httpStatus?.phase === 'restarting'
        ? '書き換えが終わりました。本体の再起動を確認しています。'
        : manualWifi ? stage === 'error' ? STM32_MANUAL_WIFI_RETRY_INSTRUCTION : STM32_MANUAL_WIFI_INSTRUCTION
        : stage === 'connection' ? connectionDescription : undefined}
      secondaryAction={complete || canceled ? null : flow.canCancelUpdate ? { label: '更新を中止', run: () => { preparation.stop(); setCancelRequested(true); void flow.cancelUpdate(); } }
        : props.writeLocked ? { label: '閉じる（更新は継続）', run: dismiss } : null}
    />
  </>;
};
