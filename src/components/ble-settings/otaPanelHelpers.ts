import type { OtaControlStatus } from '../../types/ble';
import type { Esp32OtaHttpStatus, Esp32OtaSession } from '../../services/ota/esp32OtaTransfer';
import type { Esp32FirmwareReleaseOption } from '../../services/ota/firmwareReleaseCatalog';
import type { NativeSoftApJoinResult } from '../../services/ota/nativeSoftAp';

export type CachedFirmware = {
  releaseId: string;
  file: File;
  identity?: import('../../services/ota/esp32FirmwareIdentity').Esp32FirmwareArtifactIdentity;
};

export type OtaConnectionPhase =
  | 'idle'
  | 'credentials'
  | 'physicalAuth'
  | 'softAp'
  | 'iosPrompt'
  | 'wifi'
  | 'done';

export const toSession = (status: OtaControlStatus | null): Esp32OtaSession | null => {
  if (!status?.ssid || !status.token || !status.ip) return null;
  return {
    ssid: status.ssid,
    password: status.password,
    token: status.token,
    ip: status.ip,
    nodeId: status.nodeId,
  };
};

export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const describeJoinResult = (result: NativeSoftApJoinResult | null): string => {
  if (!result) return '-';
  if (result.connected && result.alreadyAssociated) return '接続済み';
  if (result.connected) return '接続要求済み';
  const reason = result.reason || '未接続';
  return typeof result.errorCode === 'number' ? `${reason} / code ${result.errorCode}` : reason;
};

export const getFirmwareCatalogErrorMessage = (
  error: unknown,
  subject = 'ESP32 firmware release'
): string => {
  const detail = error instanceof Error ? error.message : `${subject}取得に失敗しました`;
  if (/unexpected token|not valid json|<!doctype|<html|import\s*\{/i.test(detail)) {
    return `${subject}の配布情報を読み込めませんでした。配布API設定を確認してください`;
  }
  return `${detail}。配布設定を確認してください`;
};

export const describeCachedFirmware = (
  cachedFirmware: CachedFirmware | null,
  selectedRelease: Esp32FirmwareReleaseOption | null,
  busy: boolean
): string => {
  if (busy) return '取得中';
  if (!selectedRelease) return '-';
  if (cachedFirmware?.releaseId !== selectedRelease.id) return '未取得';
  return `${Math.ceil(cachedFirmware.file.size / 1024)} KB 取得済み`;
};

export const describeConnectionPhase = (phase: OtaConnectionPhase): string => {
  switch (phase) {
    case 'credentials':
      return '接続情報を作成中';
    case 'softAp':
      return '更新用Wi-Fiを起動中';
    case 'physicalAuth':
      return '本体ボタン確認待ち';
    case 'iosPrompt':
      return 'iOS確認待ち';
    case 'wifi':
      return 'Wi-Fi接続を確認中';
    case 'done':
      return '接続準備完了';
    case 'idle':
    default:
      return '待機中';
  }
};

export const describeOtaResult = (result: OtaControlStatus['result']): string => {
  switch (result) {
    case 'busy':
      return 'ESP32が別のOTA処理中です';
    case 'unavailable':
      return 'ESP32で更新用Wi-Fiを起動できません';
    case 'failed':
      return 'ESP32の更新用Wi-Fi起動に失敗しました';
    case 'authorizationRequired':
      return '本体ボタンで更新を許可してください';
    case 'authorizationExpired':
      return '本体での許可時間が終了しました。更新準備からやり直してください';
    case 'peerConflict':
      return '他の端末が接続しています。ほかのBLE接続を切断してから再試行してください';
    case 'invalidLength':
    case 'invalidOp':
      return 'ESP32 OTA Controlの応答が不正です';
    case 'queued':
      return 'ESP32 OTA Controlの処理が完了していません';
    case 'unknown':
      return 'ESP32 OTA Controlの応答を解釈できません';
    case 'ok':
    default:
      return 'ESP32 OTA Controlが完了しました';
  }
};

export const isPhysicalAuthorizationPending = (status: OtaControlStatus | null): boolean =>
  Boolean(
    status &&
      status.protocolVersion >= 3 &&
      (status.result === 'authorizationRequired' || status.physicalAuthRequired) &&
      !status.hasCredentials
  );

export const isPhysicalAuthorizationGranted = (status: OtaControlStatus | null): boolean =>
  Boolean(
    status &&
      status.protocolVersion >= 3 &&
      status.result === 'ok' &&
      status.physicalAuthGranted &&
      status.hasCredentials &&
      toSession(status)
  );

export const validatePhysicalAuthorizationStatus = (
  status: OtaControlStatus | null
): string | null => {
  if (!status) return 'ESP32から物理認可状態を取得できませんでした';
  if (status.reservedFlagSet) return 'ESP32 OTA Controlの予約flagが設定されています';
  if (status.physicalAuthRequired && status.hasCredentials) {
    return 'ESP32が認可前に更新用Wi-Fi情報を返しました';
  }
  if (status.recoveryPortal && status.physicalAuthRequired) {
    return 'Recovery portalと物理認可待ちが同時に設定されています';
  }
  return null;
};

type WaitForPhysicalAuthorizationOptions = {
  initialStatus: OtaControlStatus;
  readStatus: () => Promise<OtaControlStatus | null>;
  timeoutSeconds?: number;
  pollIntervalMs?: number;
};

export const waitForPhysicalAuthorization = async ({
  initialStatus,
  readStatus,
  timeoutSeconds = Math.max(1, initialStatus.remainingSeconds || 60),
  pollIntervalMs = 1000,
}: WaitForPhysicalAuthorizationOptions): Promise<OtaControlStatus | null> => {
  if (!isPhysicalAuthorizationPending(initialStatus)) return initialStatus;
  const deadline = Date.now() + timeoutSeconds * 1000;
  let latest: OtaControlStatus | null = initialStatus;

  while (Date.now() <= deadline) {
    await wait(pollIntervalMs);
    latest = await readStatus();
    if (isPhysicalAuthorizationGranted(latest)) return latest;
    if (
      latest?.result === 'authorizationExpired' ||
      latest?.result === 'peerConflict' ||
      latest?.reservedFlagSet
    ) {
      return latest;
    }
    if (!isPhysicalAuthorizationPending(latest)) return latest;
  }
  return latest?.result === 'authorizationRequired' ? null : latest;
};

export const canContinueAfterActivatePortal = (status: OtaControlStatus | null): boolean => {
  if (!status) return true;
  if (status.result === 'ok' || status.result === 'queued') return true;
  if (status.result === 'busy' && status.portalActive && Boolean(toSession(status))) return true;
  return false;
};

export const portalStatusSsidMatchesSession = (
  status: Esp32OtaHttpStatus | null,
  session: Esp32OtaSession
): boolean =>
  typeof status?.ssid === 'string' && status.ssid.length > 0 && status.ssid === session.ssid;

export const describeNodeIdValues = (
  values: ReadonlyArray<Readonly<{ label: string; value: number | undefined }>>,
): string | null => {
  const available = values.filter(
    (entry): entry is Readonly<{ label: string; value: number }> => typeof entry.value === 'number'
  );
  if (new Set(available.map((entry) => entry.value)).size <= 1) return null;
  return `Node ID表示が変わっています（${available.map((entry) => `${entry.label} ${entry.value}`).join(' / ')}）。Node IDは任意の識別ラベルのため更新を継続できます`;
};

export const describeNodeIdDifference = (
  sessionNodeId: number | undefined,
  observedNodeId: number | undefined,
): string | null => describeNodeIdValues([
  { label: 'session', value: sessionNodeId },
  { label: '現在', value: observedNodeId },
]);

export const isPortalStatusReadyForSession = (
  status: Esp32OtaHttpStatus | null,
  session: Esp32OtaSession
): boolean =>
  Boolean(
    status &&
      (status.portalActive || status.updating) &&
      portalStatusSsidMatchesSession(status, session) &&
      (session.sessionOrigin !== 'initial_setup' ||
        (status.initialSetup === true && status.firmwareProfile === 'initial'))
  );
