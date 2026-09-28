import type { Stm32FirmwareReleaseOption } from '../../services/ota/stm32FirmwareReleaseCatalog';
import {
  Stm32CancelTimeoutError,
  Stm32HttpStatusError,
  Stm32PackageUploadConnectionError,
  Stm32PackageUploadTimeoutError,
  Stm32StatusRequestTimeoutError,
  Stm32WriteStartTimeoutError,
  Stm32WriteMonitorError,
  type Stm32PackageUploadProgress,
  type Stm32UpdateHttpStatus,
} from '../../services/ota/stm32OtaTransfer';
import type { Stm32FirmwareVersionStatus } from '../../types/ble';
import { formatStm32FirmwareVersion } from './formatters';

export type CachedStm32Package = {
  releaseId: string;
  file: File;
};

export type Stm32PanelMessage = {
  text: string;
  role: 'status' | 'alert';
};

export type Stm32SafeWriteAction = 'idle' | 'upload' | 'probe' | 'write' | 'monitor';

export const stm32StatusMessage = (text: string): Stm32PanelMessage => ({ text, role: 'status' });
export const stm32AlertMessage = (text: string): Stm32PanelMessage => ({ text, role: 'alert' });

export const STM32_MANUAL_WIFI_INSTRUCTION = 'この画面を開いたまま、端末のWi-Fi設定で下のネットワークへ接続し、戻って「接続を確認」を押してください。インターネット未接続でも接続を維持し、ブラウザのローカルネットワークへのアクセスを許可してください。';
export const STM32_MANUAL_WIFI_RETRY_INSTRUCTION = '接続先とブラウザの許可を確認し、「接続を確認」を押してください。';

export const describeUnknownStm32WriteState = (
  error: unknown,
  writeMayHaveStarted: boolean,
): string => {
  const reason = error instanceof Stm32WriteMonitorError
    ? error.reason === 'overall_timeout'
      ? 'STM32書込み状態の監視時間が上限に達しました'
      : 'STM32 status応答を確認できませんでした'
    : error instanceof Stm32StatusRequestTimeoutError
      ? 'STM32 status応答がタイムアウトしました'
      : error instanceof Stm32PackageUploadTimeoutError
        ? 'STM32 package転送の応答がタイムアウトしました'
        : error instanceof Stm32PackageUploadConnectionError
          ? 'STM32 package転送中に接続を確認できなくなりました'
      : error instanceof Stm32WriteStartTimeoutError
        ? 'STM32書込み開始POSTの応答がタイムアウトしました'
      : error instanceof Stm32HttpStatusError
        ? describeStoppedUpdateMessage(error.status)
      : error instanceof Error ? error.message : 'STM32 FW更新状態を確認できませんでした';
  return writeMayHaveStarted
    ? `${reason}。デバイス側の書込み状態は不明です。取得済みpackageは保持しました。STM32 status再確認で書込み継続または復旧状態を確認してください`
    : `${reason}。取得済みpackageは保持しました。STM32 status再確認後に再試行してください`;
};

export const describeStm32StatusReadFailure = (error: unknown): string =>
  error instanceof Stm32StatusRequestTimeoutError
    ? describeUnknownStm32WriteState(error, false)
    : error instanceof Error ? error.message : 'STM32 update status取得に失敗しました';

export const describeStm32WebConnectionFailure = (
  error: unknown,
  ssid: string,
  permissionState: PermissionState | null,
): string => {
  if (permissionState === 'denied') {
    return 'ブラウザのローカルネットワークへのアクセスが拒否されています。サイトの設定でアクセスを許可し、更新用Wi-Fiへ接続したまま「接続を確認」を押してください。';
  }
  if (error instanceof TypeError || error instanceof Stm32StatusRequestTimeoutError) {
    return `本体に接続できません。「${ssid}」へ接続し、インターネット未接続と表示されても接続を維持してください。ブラウザのローカルネットワークへのアクセスを許可して「接続を確認」を押してください。`;
  }
  return describeStm32StatusReadFailure(error);
};

export const describeUnknownStm32CancelState = (error: unknown): string => {
  const reason = error instanceof Stm32CancelTimeoutError
    ? 'STM32更新中止の応答がタイムアウトしました'
    : error instanceof Error ? error.message : 'STM32更新中止の結果を確認できませんでした';
  return `${reason}。中止結果は不明です。取得済みpackageは保持しました。HTTP statusへ到達できないまま通常BLEが戻った場合は、通常のWi-Fiへ戻してBLE再接続後にSTM32 Update Controlを再読込し、portal停止を確認してください`;
};

export const describeReattachedStm32Status = (
  status: Stm32UpdateHttpStatus,
): Stm32PanelMessage => {
  if (status.phase === 'error' || status.phase === 'recovery_required') {
    return stm32AlertMessage(describeStoppedUpdateMessage(status));
  }
  if (status.phase === 'complete') {
    return stm32StatusMessage('STM32 FW更新の完了状態を再取得しました');
  }
  if (isStm32WriteLocked(status)) {
    return stm32StatusMessage('STM32書込みはデバイス側で継続中です。「書込み監視を再開」で完了または復旧状態まで確認してください');
  }
  return stm32StatusMessage('STM32 update endpointへの接続を確認しました');
};

export type Stm32ReleaseSelectionMode = 'normal' | 'debug';

export const getStm32ReleaseSelectionMode = (): Stm32ReleaseSelectionMode =>
  import.meta.env.VITE_STM32_FIRMWARE_SELECTION_MODE === 'debug' ? 'debug' : 'normal';

export const describeNoSelectableStm32Release = (mode: Stm32ReleaseSelectionMode): string =>
  mode === 'debug'
    ? 'debug_no_rdp用のSTM32 FW packageがありません'
    : '通常UIで選択可能なSTM32 FW packageがありません';

export const formatPackageBytes = (value: number | undefined): string => {
  if (!value || value < 0) return '-';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatPackageHash = (hash: string | undefined): string => {
  if (!hash) return '-';
  if (hash.length <= 24) return hash;
  return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
};

export const describePackage = (
  cachedPackage: CachedStm32Package | null,
  selectedRelease: Stm32FirmwareReleaseOption | null,
  busy: boolean
): string => {
  if (busy) return '取得中';
  if (!selectedRelease) return '-';
  if (cachedPackage?.releaseId !== selectedRelease.id) return '未取得';
  return `${formatPackageBytes(cachedPackage.file.size)} 取得済み`;
};

export const isUserSelectableStm32Release = (release: Stm32FirmwareReleaseOption): boolean =>
  isReleaseSelectableForMode(release, getStm32ReleaseSelectionMode());

export const isReleaseSelectableForMode = (
  release: Stm32FirmwareReleaseOption,
  mode: Stm32ReleaseSelectionMode
): boolean => {
  if (release.requiresAdmin || release.rdpPolicy === 'enable_rdp1') return false;
  if (mode === 'debug') {
    return release.buildProfile === 'debug' && release.rdpPolicy === 'none';
  }
  return release.buildProfile === 'field' && release.rdpPolicy === 'preserve';
};

export const isWritableOrDone = (status: Stm32UpdateHttpStatus | null): boolean =>
  Boolean(status && (status.canWrite || status.phase === 'complete'));

export const isTerminalStatus = (status: Stm32UpdateHttpStatus): boolean =>
  status.phase === 'complete' || status.phase === 'error' || status.phase === 'recovery_required';

export const shouldClearCachedPackageAfterStatus = (status: Stm32UpdateHttpStatus): boolean =>
  status.phase === 'complete' || status.phase === 'error';

export const canReuseStoredStm32Package = (status: Stm32UpdateHttpStatus | null): boolean =>
  Boolean(status?.packageReady && status.canWrite && status.phase !== 'complete');

export const describeStoppedUpdateMessage = (status: Stm32UpdateHttpStatus): string => {
  if (status.errorCode === 'revision_rollback') {
    return '選択した更新データは、このデバイスで受理済みの更新より古いため、STM32を消去する前に拒否されました。旧内容が必要な場合は、管理下で新しい更新データとして再packageしてください';
  }
  if (status.phase === 'recovery_required' && canReuseStoredStm32Package(status)) {
    return 'STM32 FW更新は復旧状態です。ESP32内の検証済みpackageで再書込みできます';
  }
  if (status.phase === 'recovery_required') {
    return status.error || 'STM32 FW更新は復旧状態です。packageを再uploadして復旧してください';
  }
  return status.error || 'STM32 FW更新が停止しました';
};

export const describeStm32TerminalMessage = (
  status: Stm32UpdateHttpStatus,
): Stm32PanelMessage => status.phase === 'complete'
  ? stm32StatusMessage(status.postWriteVersionMatchesPackage
    ? 'STM32 FW更新と起動後version確認が完了しました'
    : 'STM32 FW更新は完了しました。起動後versionをBLE再接続後に確認してください')
  : stm32AlertMessage(describeStoppedUpdateMessage(status));

export const describePackageTransferStepDetail = (
  activeAction: Stm32SafeWriteAction,
  uploadProgress: Stm32PackageUploadProgress | null,
  storedPackageReady: boolean,
  networkReady: boolean,
): string => {
  if (activeAction === 'upload') return uploadProgress ? `送信 ${uploadProgress.percent}%` : '転送・検証中';
  if (storedPackageReady) return 'ESP32へ転送・検証済み';
  return networkReady ? '転送待機' : 'Wi-Fi接続後に有効';
};

export const describeProbeStepDetail = (
  activeAction: Stm32SafeWriteAction,
  probeReady: boolean,
  storedPackageReady: boolean,
): string => {
  if (activeAction === 'probe') return '消去せず接続確認中';
  if (probeReady) return '非消去確認済み';
  return storedPackageReady ? '確認待機' : 'Package転送後に有効';
};

export const describeWriteStepDetail = (
  activeAction: Stm32SafeWriteAction,
  status: Stm32UpdateHttpStatus | null,
  probeReady: boolean,
  canResumeMonitoring: boolean,
): string => {
  if (activeAction === 'write') return '書込み開始中';
  if (activeAction === 'monitor') {
    if (status?.phase === 'restarting') return 'STM32起動・version確認中';
    return status ? `${status.phase} ${status.progress}%` : '状態監視中';
  }
  if (canResumeMonitoring) return `${status?.phase} ${status?.progress ?? 0}% / 監視再開可能`;
  if (isWritableOrDone(status) && status?.phase === 'complete') return 'complete 100%';
  return probeReady ? '明示書込み待機 / 開始後は中断不可' : '非消去確認後に有効';
};

export const isStm32WriteLocked = (status: Stm32UpdateHttpStatus | null): boolean =>
  Boolean(status?.writeStartPending || status?.bootloaderSessionActive || status?.phase === 'writing' || status?.phase === 'verifying_flash' || status?.phase === 'restarting');

export const statusSessionMatchesRelease = (
  status: Stm32UpdateHttpStatus | null,
  release: Stm32FirmwareReleaseOption | null
): boolean => {
  if (!status?.sessionBound || !release) return false;
  return status.sessionTarget === release.target && status.sessionReleaseTag === release.releaseTag;
};

export const describeVersionConfirmation = (
  status: Stm32UpdateHttpStatus | null,
  selectedRelease: Stm32FirmwareReleaseOption | null,
  stm32FirmwareVersion: Stm32FirmwareVersionStatus | null
): string => {
  const currentVersion = formatStm32FirmwareVersion(stm32FirmwareVersion);
  if (status?.phase === 'restarting') return 'STM32起動・version確認中';
  if (status?.phase !== 'complete') return currentVersion;

  const expectedVersion = selectedRelease?.version || status.version || null;
  if (status.postWriteVersionMatchesPackage === true && status.currentFirmwareVersionRaw) {
    return `確認済み ${status.currentFirmwareVersionRaw}`;
  }
  if (status.postWriteVersionCheckComplete === true && status.postWriteVersionRead === false) {
    return 'I2C読出し未確認 / BLE再接続後に確認';
  }
  if (status.postWriteVersionRead === true && status.currentFirmwareVersionRaw) {
    return expectedVersion
      ? `要確認 ${status.currentFirmwareVersionRaw} / 期待 ${expectedVersion}`
      : `要確認 ${status.currentFirmwareVersionRaw}`;
  }
  if (!stm32FirmwareVersion?.readOk) {
    return `BLE再接続後に確認 / 現在 ${currentVersion}`;
  }
  if (
    expectedVersion &&
    (stm32FirmwareVersion.firmwareVersion === expectedVersion ||
      String(stm32FirmwareVersion.firmwareVersionRaw) === expectedVersion)
  ) {
    return `確認済み ${currentVersion}`;
  }
  return expectedVersion
    ? `要確認 ${currentVersion} / 期待 ${expectedVersion}`
    : `要確認 ${currentVersion}`;
};
