import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BLECapabilitiesStatus, OtaControlOp, OtaControlStatus } from '../../types/ble';
import type { BLEPlatformInfo } from '../../services/ble';
import {
  readEsp32OtaHttpStatus,
  uploadEsp32Firmware,
  type Esp32OtaHttpStatus,
  type Esp32OtaSession,
  type Esp32OtaUploadProgress,
} from '../../services/ota/esp32OtaTransfer';
import {
  downloadEsp32FirmwareRelease,
  fetchEsp32FirmwareReleases,
  type Esp32FirmwareReleaseOption,
} from '../../services/ota/firmwareReleaseCatalog';
import {
  connectToEsp32SoftAp,
  connectToInitialSoftApWithTimeout,
  describeNativeSoftApJoinFailure,
  isNativeSoftApJoinAvailable,
  probeInitialPortalFromIos,
  removeEsp32SoftApConfiguration,
  shouldRetryNativeSoftApJoin,
  type NativeSoftApJoinResult,
} from '../../services/ota/nativeSoftAp';
import { inspectEsp32FirmwareArtifact, verifyDemoFirmwareArtifact } from '../../services/ota/esp32FirmwareIdentity';
import {
  createInitialDemoClientNonce,
  INITIAL_DEMO_SOFT_AP,
  isInitialDemoWebFallbackAvailable,
} from '../../services/ota/initialDemoOta';
import { OtaPanelView } from './OtaPanelView';
import { InitialFirmwareSetupWizardView } from './InitialFirmwareSetupWizardView';
import {
  canContinueAfterActivatePortal,
  describeCachedFirmware,
  describeOtaResult,
  getFirmwareCatalogErrorMessage,
  isPhysicalAuthorizationPending,
  isPortalStatusReadyForSession,
  portalStatusSsidMatchesSession,
  toSession,
  wait,
  type CachedFirmware,
  type OtaConnectionPhase,
} from './otaPanelHelpers';
import { confirmLegacyOtaMigration, resolveOtaAuthorization } from './otaAuthorizationFlow';
import { InitialSessionClaimHttpError, waitForInitialDemoSession } from './initialDemoSessionClaim';

type OtaPanelProps = {
  presentation?: 'settings' | 'initialSetup';
  initialGuideOpen?: boolean;
  initialGuideDefaultHidden?: boolean;
  onInitialGuideHideNextTimeChange?: (hideNextTime: boolean) => void;
  onInitialGuideDismiss?: () => void;
  isConnected: boolean;
  capabilitiesStatus: BLECapabilitiesStatus | null;
  otaControlStatus: OtaControlStatus | null;
  otaControlBusy: boolean;
  platformInfo: BLEPlatformInfo | null;
  onRefreshOtaControlStatus: () => Promise<void>;
  onWriteOtaControl: (op: OtaControlOp) => Promise<OtaControlStatus | null>;
  onVerifyInstalledDemo?: (expected: {
    version: string;
    revision: number;
    commit: string;
  }) => Promise<void>;
};

type OtaPanelMessage = {
  text: string;
  role: 'status' | 'alert';
};

const statusMessage = (text: string): OtaPanelMessage => ({ text, role: 'status' });
const alertMessage = (text: string): OtaPanelMessage => ({ text, role: 'alert' });

const IOS_CONNECTION_ESTIMATE_SECONDS = 18;
const WEB_CONNECTION_ESTIMATE_SECONDS = 8;
const SOFT_AP_BOOT_WAIT_MS = 3500;
const OTA_STATUS_TIMEOUT_MS = 2500;

export const OtaPanel = ({
  presentation = 'settings',
  initialGuideOpen = true,
  initialGuideDefaultHidden = false,
  onInitialGuideHideNextTimeChange = () => undefined,
  onInitialGuideDismiss = () => undefined,
  isConnected,
  capabilitiesStatus,
  otaControlStatus,
  otaControlBusy,
  platformInfo,
  onRefreshOtaControlStatus,
  onWriteOtaControl,
  onVerifyInstalledDemo,
}: OtaPanelProps) => {
  const [firmwareReleases, setFirmwareReleases] = useState<Esp32FirmwareReleaseOption[]>([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [firmwareCatalogBusy, setFirmwareCatalogBusy] = useState(false);
  const [firmwareDownloadBusy, setFirmwareDownloadBusy] = useState(false);
  const [cachedFirmware, setCachedFirmware] = useState<CachedFirmware | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Esp32OtaUploadProgress | null>(null);
  const [httpStatus, setHttpStatus] = useState<Esp32OtaHttpStatus | null>(null);
  const [wifiJoinResult, setWifiJoinResult] = useState<NativeSoftApJoinResult | null>(null);
  const [wifiJoinBusy, setWifiJoinBusy] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [connectionFlowBusy, setConnectionFlowBusy] = useState(false);
  const [connectionPhase, setConnectionPhase] = useState<OtaConnectionPhase>('idle');
  const [connectionDeadlineMs, setConnectionDeadlineMs] = useState<number | null>(null);
  const [connectionRemainingSeconds, setConnectionRemainingSeconds] = useState<number | null>(null);
  const [updateNetworkReady, setUpdateNetworkReady] = useState(false);
  const [message, setMessage] = useState<OtaPanelMessage | null>(null);
  const [initialSetupMode, setInitialSetupMode] = useState(presentation === 'initialSetup');
  const [initialSetupComplete, setInitialSetupComplete] = useState(false);
  const [initialTransferComplete, setInitialTransferComplete] = useState(false);
  const [initialSession, setInitialSession] = useState<Esp32OtaSession | null>(null);
  const [updateComplete, setUpdateComplete] = useState(false);
  const uploadInFlightRef = useRef(false);
  const [initialClientNonce] = useState(createInitialDemoClientNonce);
  const bleSession = useMemo(() => toSession(otaControlStatus), [otaControlStatus]);
  const session = initialSession ?? bleSession;
  const otaSupported = capabilitiesStatus?.otaControl !== false;
  const selectedRelease = useMemo(
    () => firmwareReleases.find((release) => release.id === selectedReleaseId) ?? null,
    [firmwareReleases, selectedReleaseId]
  );
  const selectedFirmwareReady = Boolean(
    selectedRelease && cachedFirmware?.releaseId === selectedRelease.id
  );
  const autoJoinAvailable = platformInfo?.adapterType === 'Capacitor' && isNativeSoftApJoinAvailable();
  const initialSetupSupported = platformInfo?.adapterType === 'Capacitor' ||
    isInitialDemoWebFallbackAvailable();
  const networkReady = updateNetworkReady;
  const canDownloadFirmware = Boolean(
    selectedRelease &&
    (!initialSetupMode || initialSetupSupported) &&
    !firmwareCatalogBusy &&
    !firmwareDownloadBusy &&
    !connectionFlowBusy &&
    !transferBusy
  );
  const canStartUpdateNetwork = Boolean(
    (initialSetupMode || (isConnected && otaSupported)) &&
    selectedFirmwareReady &&
    !otaControlBusy &&
    !firmwareCatalogBusy &&
    !firmwareDownloadBusy &&
    !connectionFlowBusy &&
    !transferBusy
  );
  const canUpload = Boolean(
    session &&
    selectedFirmwareReady &&
    networkReady &&
    !connectionFlowBusy &&
    !transferBusy &&
    !wifiJoinBusy
  );

  const loadFirmwareReleases = useCallback(async () => {
    setFirmwareCatalogBusy(true);
    try {
      const releases = await fetchEsp32FirmwareReleases();
      setFirmwareReleases(releases);
      setSelectedReleaseId((current) =>
        releases.some((release) => release.id === current) ? current : releases[0].id
      );
      setMessage(null);
    } catch (error) {
      setFirmwareReleases([]);
      setSelectedReleaseId(null);
      setMessage(alertMessage(getFirmwareCatalogErrorMessage(error)));
    } finally {
      setFirmwareCatalogBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadFirmwareReleases();
  }, [loadFirmwareReleases]);

  useEffect(() => {
    if (!cachedFirmware || cachedFirmware.releaseId === selectedReleaseId) return;
    setCachedFirmware(null);
    setUploadProgress(null);
    setUpdateNetworkReady(false);
    setUpdateComplete(false);
  }, [cachedFirmware, selectedReleaseId]);

  useEffect(() => {
    if (isConnected && presentation === 'settings') {
      setInitialSetupMode(false);
      setInitialSession(null);
    }
  }, [isConnected, presentation]);

  useEffect(() => {
    if (!connectionDeadlineMs) return;

    const updateRemainingSeconds = () => {
      setConnectionRemainingSeconds(Math.max(0, Math.ceil((connectionDeadlineMs - Date.now()) / 1000)));
    };

    updateRemainingSeconds();
    const intervalId = window.setInterval(updateRemainingSeconds, 250);
    return () => window.clearInterval(intervalId);
  }, [connectionDeadlineMs]);

  const startConnectionCountdown = (seconds: number) => {
    setConnectionDeadlineMs(Date.now() + seconds * 1000);
    setConnectionRemainingSeconds(seconds);
  };

  const stopConnectionCountdown = () => {
    setConnectionDeadlineMs(null);
    setConnectionRemainingSeconds(null);
  };

  const copySessionValue = async (label: string, value?: string) => {
    if (!value) return;
    if (!navigator.clipboard?.writeText) {
      setMessage(alertMessage('クリップボードを使用できません'));
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setMessage(statusMessage(`${label}をコピーしました`));
    } catch {
      setMessage(alertMessage(`${label}をコピーできませんでした`));
    }
  };

  const readPortalStatus = async (
    targetSession: Esp32OtaSession | null = session
  ) => {
    if (!targetSession) return null;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), OTA_STATUS_TIMEOUT_MS);
    const nextStatus = await readEsp32OtaHttpStatus(targetSession, controller.signal)
      .finally(() => window.clearTimeout(timeoutId));
    setHttpStatus(nextStatus);
    return nextStatus;
  };

  const waitForPortalStatus = async (
    targetSession: Esp32OtaSession,
    timeoutSeconds: number
  ): Promise<boolean> => {
    const deadline = Date.now() + timeoutSeconds * 1000;
    startConnectionCountdown(timeoutSeconds);

    while (Date.now() <= deadline) {
      try {
        const status = await readPortalStatus(targetSession);
        if (!portalStatusSsidMatchesSession(status, targetSession)) {
          setMessage(alertMessage(targetSession.sessionOrigin === 'initial_setup'
            ? 'Initialの更新用Wi-Fiを確認できません。本体を緑点滅へ戻し、初回セットアップからやり直してください'
            : 'ESP32の更新用Wi-Fi名が接続情報と一致しません。BLE接続からやり直してください'));
          return false;
        }
        if (isPortalStatusReadyForSession(status, targetSession)) {
          return true;
        }
      } catch {
        // Retry until the SoftAP HTTP server is reachable from the current Wi-Fi.
      }
      await wait(1000);
    }

    setMessage(alertMessage('更新用Wi-Fi接続後もESP32に到達できません。iOSのWi-Fi接続先を確認してください'));
    return false;
  };

  const refreshHttpStatus = async () => {
    if (!session) return;
    setTransferBusy(true);
    try {
      setMessage(null);
      const status = await readPortalStatus(session);
      if (!portalStatusSsidMatchesSession(status, session)) {
        setUpdateNetworkReady(false);
        setMessage(alertMessage('ESP32の更新用Wi-Fi名が接続情報と一致しません。BLE接続からやり直してください'));
      } else if (isPortalStatusReadyForSession(status, session)) {
        setUpdateNetworkReady(true);
        setConnectionPhase('done');
        setMessage(statusMessage('更新用Wi-Fi接続を確認しました'));
      } else {
        setUpdateNetworkReady(false);
        setMessage(alertMessage('ESP32には到達しましたが、更新用Wi-Fiが起動中ではありません'));
      }
    } catch (error) {
      setMessage(alertMessage(error instanceof Error ? error.message : 'OTA status取得に失敗しました'));
    } finally {
      setTransferBusy(false);
    }
  };

  const joinSoftAp = async (targetSession: Esp32OtaSession | null = session): Promise<boolean> => {
    if (!targetSession || !autoJoinAvailable) return false;
    setWifiJoinBusy(true);
    try {
      setConnectionPhase('iosPrompt');
      stopConnectionCountdown();
      setMessage(statusMessage('iOSの確認ダイアログで接続を承認してください'));
      const result = await connectToEsp32SoftAp(targetSession);
      setWifiJoinResult(result);
      if (result.connected) {
        setConnectionPhase('wifi');
        const portalReachable = await waitForPortalStatus(targetSession, IOS_CONNECTION_ESTIMATE_SECONDS);
        if (portalReachable) {
          setMessage(statusMessage('更新用Wi-Fi接続を確認しました'));
          return true;
        }
        return false;
      } else {
        setMessage(alertMessage(describeNativeSoftApJoinFailure(result)));
        return false;
      }
    } catch (error) {
      setWifiJoinResult({
        ssid: targetSession.ssid,
        connected: false,
        reason: 'pluginError',
        message: error instanceof Error ? error.message : 'Wi-Fi自動接続に失敗しました',
      });
      setMessage(alertMessage(error instanceof Error ? error.message : 'Wi-Fi自動接続に失敗しました'));
      return false;
    } finally {
      setWifiJoinBusy(false);
    }
  };

  const cacheSelectedFirmware = useCallback(async (): Promise<File | null> => {
    if (!selectedRelease) {
      setMessage(alertMessage('先にESP32 firmware releaseを選択してください'));
      return null;
    }
    if (cachedFirmware?.releaseId === selectedRelease.id) {
      return cachedFirmware.file;
    }

    setFirmwareDownloadBusy(true);
    try {
      setMessage(statusMessage('firmware.binを取得しています'));
      const file = await downloadEsp32FirmwareRelease(selectedRelease);
      let identity;
      try {
        identity = await inspectEsp32FirmwareArtifact(file);
      } catch (error) {
        if (initialSetupMode) throw error;
      }
      if (initialSetupMode) {
        if (!initialSetupSupported) {
          setMessage(alertMessage('Initialの更新はiOSアプリ、またはLocal Network Access対応Chromiumで実行してください'));
          return null;
        }
        if (selectedRelease.assetName !== 'ulsa-evo-esp32-demo-firmware.bin') {
          throw new Error('Initialには正式なDemo firmware assetだけを導入できます');
        }
        identity = await verifyDemoFirmwareArtifact(
          file, selectedRelease.firmwareSha256 || ''
        );
      }
      setCachedFirmware({ releaseId: selectedRelease.id, file, identity });
      setMessage(statusMessage('firmware.binを取得しました'));
      return file;
    } catch (error) {
      setCachedFirmware(null);
      setMessage(alertMessage(error instanceof Error ? error.message : 'firmware.bin取得に失敗しました'));
      return null;
    } finally {
      setFirmwareDownloadBusy(false);
    }
  }, [cachedFirmware, initialSetupMode, initialSetupSupported, selectedRelease]);

  const startUpdateNetwork = async (retryInitialConnection = false) => {
    if (!selectedFirmwareReady) {
      setMessage(alertMessage('先にfirmware.binを取得してください'));
      return;
    }
    setMessage(null);
    setConnectionFlowBusy(true);
    setUpdateNetworkReady(false);
    setWifiJoinResult(null);
    setHttpStatus(null);
    setConnectionPhase(initialSetupMode ? 'softAp' : 'credentials');
    if (!autoJoinAvailable) {
      startConnectionCountdown(WEB_CONNECTION_ESTIMATE_SECONDS);
    } else {
      stopConnectionCountdown();
    }

    try {
      if (initialSetupMode) {
        if (!cachedFirmware || !selectedRelease ||
            selectedRelease.assetName !== 'ulsa-evo-esp32-demo-firmware.bin') {
          setMessage(alertMessage('正式なDemo firmwareを取得し直してください'));
          return;
        }
        const verifiedIdentity = await verifyDemoFirmwareArtifact(
          cachedFirmware.file, selectedRelease.firmwareSha256 || ''
        );
        setCachedFirmware({ ...cachedFirmware, identity: verifiedIdentity });
        if (!retryInitialConnection) {
          // Initial starts its SoftAP only after the physical button is released.
          // Do not ask iOS to join before the AP has had time to begin advertising.
          setMessage(statusMessage('本体の更新用Wi-Fiが起動するまでお待ちください'));
          await wait(SOFT_AP_BOOT_WAIT_MS);
        }
        if (autoJoinAvailable && !retryInitialConnection) {
          setConnectionPhase('iosPrompt');
          setMessage(statusMessage('iOSの確認ダイアログで更新用Wi-Fiに接続してください'));
          let result = await connectToInitialSoftApWithTimeout(INITIAL_DEMO_SOFT_AP);
          setWifiJoinResult(result);
          if (shouldRetryNativeSoftApJoin(result)) {
            await wait(750);
            result = await connectToInitialSoftApWithTimeout(INITIAL_DEMO_SOFT_AP);
            setWifiJoinResult(result);
          }
          if (!result.connected) {
            throw new Error(describeNativeSoftApJoinFailure(result, true));
          }
        } else {
          setMessage(statusMessage('Wi-Fi設定で ULSA-EVO-INITIAL に接続してください。対応Chromiumではローカルネットワークアクセスも許可してください'));
        }
        setConnectionPhase('wifi');
        let claimedSession;
        try {
          claimedSession = await waitForInitialDemoSession(
            verifiedIdentity, initialClientNonce, autoJoinAvailable ? 8 : 17
          );
        } catch (error) {
          if (!autoJoinAvailable) throw error;
          const probe = await probeInitialPortalFromIos();
          if (probe.reachable) {
            if (error instanceof Error && /^Initial OTA session応答が/.test(error.message)) {
              throw new Error('本体がアプリの初回更新方式と異なる応答を返しました。ファームウェアの互換性を確認してください。（診断: 応答形式不一致）');
            }
            if (error instanceof InitialSessionClaimHttpError) {
              const detail = error.status === 404 ? '本体のInitial firmwareがこの初回更新方式に対応していません'
                : error.status === 409 ? '本体が別の初回更新試行を保持しています'
                  : '本体がアプリの初回更新要求を受け付けませんでした';
              throw new Error(`${detail}。（応答番号 ${error.status}）`);
            }
            throw new Error('iPhoneから本体の更新ページには到達できますが、アプリ内の初回更新通信に失敗しました。（診断: 本体到達可）');
          }
          if (probe.reason === 'portalIdentity' || probe.reason === 'unexpectedResponse') {
            throw new Error(`本体以外のページから応答がありました。Wi-Fi接続先を確認してください。（応答番号 ${probe.httpStatus ?? 0}）`);
          }
          const code = typeof probe.errorCode === 'number' ? `・iOS code ${probe.errorCode}` : '';
          const reason = probe.reason === 'probeTimeout' ? '確認期限'
            : probe.reason === 'nativeNetworkError' ? 'iOS通信不可' : '検証機能に応答なし';
          throw new Error(`iPhoneから本体の更新ページに到達できません。Wi-Fiへの参加状態を確認してください。（診断: ${reason}${code}）`);
        }
        setInitialSession(claimedSession);
        const portalReachable = await waitForPortalStatus(claimedSession, 15);
        if (!portalReachable) return;
        setUpdateNetworkReady(true);
        setConnectionPhase('done');
        setMessage(statusMessage('Initial更新用Wi-Fi接続を確認しました'));
        return;
      }

      let preparedStatus = otaControlStatus;
      let activeSession = session;
      if (!activeSession || isPhysicalAuthorizationPending(preparedStatus)) {
        preparedStatus = await onWriteOtaControl('preparePortal');
      }

      const authorization = await resolveOtaAuthorization({
        initialStatus: preparedStatus,
        readStatus: () => onWriteOtaControl('read'),
        waitingMessage: '更新準備ができました。LEDが黄色で点滅している間に本体ボタンを押し続け、白の確認表示に変わったら離してください',
        describeResult: describeOtaResult,
        onWaiting: (text, seconds) => {
          setConnectionPhase('physicalAuth');
          startConnectionCountdown(seconds);
          setMessage(statusMessage(text));
        },
        onFinishedWaiting: stopConnectionCountdown,
      });
      if (authorization.error !== null) {
        setMessage(alertMessage(authorization.error));
        return;
      }
      preparedStatus = authorization.status;
      if (!confirmLegacyOtaMigration(preparedStatus, '接続中のESP32 firmwareは本体ボタン認可に未対応です。物理認可対応firmwareへ移行するため、この旧方式で更新を続けますか？')) {
        await onWriteOtaControl('stopOrCancel');
        setMessage(alertMessage('旧方式でのOTAを中止しました'));
        return;
      }
      activeSession = toSession(preparedStatus) ?? activeSession;

      if (!activeSession) {
        setMessage(alertMessage('更新用Wi-Fi情報を取得できませんでした'));
        return;
      }
      setConnectionPhase('softAp');
      const activatedStatus = await onWriteOtaControl('activatePortal');
      if (!canContinueAfterActivatePortal(activatedStatus)) {
        setMessage(alertMessage(activatedStatus ? describeOtaResult(activatedStatus.result) : 'ESP32の更新用Wi-Fi起動状態を取得できませんでした'));
        return;
      }
      activeSession = toSession(activatedStatus) ?? activeSession;

      if (autoJoinAvailable) {
        setConnectionPhase('softAp');
        setMessage(statusMessage('更新用Wi-Fiの起動を待っています'));
        await wait(SOFT_AP_BOOT_WAIT_MS);
        const joined = await joinSoftAp(activeSession);
        if (!joined) return;
      } else {
        setMessage(statusMessage('更新用Wi-Fiを開始しました。接続後に状態確認を実行してください'));
      }

      if (autoJoinAvailable) {
        setUpdateNetworkReady(true);
        setConnectionPhase('done');
      }
    } catch (error) {
      if (initialSetupMode) setConnectionPhase('wifi');
      setMessage(alertMessage(error instanceof Error ? error.message : '更新用Wi-Fiへの接続を確認できませんでした'));
    } finally {
      setConnectionFlowBusy(false);
      stopConnectionCountdown();
    }
  };

  const upload = async () => {
    if (uploadInFlightRef.current || updateComplete) return;
    if (!session || !selectedRelease || !selectedFirmwareReady || !cachedFirmware) {
      setMessage(alertMessage('SoftAP接続前にfirmware.binを取得してください'));
      return;
    }
    uploadInFlightRef.current = true;
    setTransferBusy(true);
    try {
      setMessage(null);
      setUploadProgress(null);
      await uploadEsp32Firmware(session, cachedFirmware.file, setUploadProgress);
      if (initialSetupMode && cachedFirmware.identity) {
        setInitialTransferComplete(true);
        await removeEsp32SoftApConfiguration(INITIAL_DEMO_SOFT_AP);
        if (onVerifyInstalledDemo && platformInfo?.adapterType === 'Capacitor') {
          setMessage(statusMessage('転送完了。DemoのBLE起動を確認しています'));
          await onVerifyInstalledDemo(cachedFirmware.identity);
          setMessage(statusMessage('Demo firmwareの起動とBLE identityを確認しました'));
          setInitialSetupComplete(true);
        } else {
          setMessage(statusMessage(onVerifyInstalledDemo && platformInfo?.adapterType === 'WebBluetooth'
            ? '転送済み。ダイアログを閉じ、画面上部の「BLEデバイス」から接続してください'
            : '転送済み。BLEによるDemo起動確認はこの環境では未完了です'));
        }
      } else {
        setUpdateComplete(true);
        setUpdateNetworkReady(false);
        // Retain upload success even if joinOnce cleanup fails. Reopening the
        // wizard must never upload a second time.
        if (autoJoinAvailable) {
          await removeEsp32SoftApConfiguration(session).catch(() => undefined);
        }
        setMessage(statusMessage('転送完了。ESP32を再起動しています'));
      }
    } catch (error) {
      setMessage(alertMessage(error instanceof Error ? error.message : 'OTA転送に失敗しました'));
    } finally {
      uploadInFlightRef.current = false;
      setTransferBusy(false);
    }
  };

  const retryInstalledDemoVerification = async () => {
    if (!cachedFirmware?.identity || !onVerifyInstalledDemo) return;
    setTransferBusy(true);
    try {
      setMessage(statusMessage('DemoのBLE起動を再確認しています'));
      await onVerifyInstalledDemo(cachedFirmware.identity);
      setInitialSetupComplete(true);
      setMessage(statusMessage('Demo firmwareの起動とBLE identityを確認しました'));
    } catch (error) {
      setMessage(alertMessage(error instanceof Error ? error.message : 'DemoのBLE起動を確認できませんでした'));
    } finally {
      setTransferBusy(false);
    }
  };

  const firmwareStepDetail = firmwareCatalogBusy ? 'Release読込中' : describeCachedFirmware(cachedFirmware, selectedRelease, firmwareDownloadBusy);

  if (presentation === 'initialSetup') {
    return <InitialFirmwareSetupWizardView isOpen={initialGuideOpen} defaultHideNextTime={initialGuideDefaultHidden}
      initialSetupSupported={initialSetupSupported}
      {...{ selectedRelease, firmwareCatalogBusy, firmwareDownloadBusy,
        selectedFirmwareReady, canDownloadFirmware, connectionFlowBusy, connectionPhase,
        networkReady, canStartUpdateNetwork, transferBusy, uploadProgress, canUpload,
        message, autoJoinAvailable }}
      requiresManualBleConnection={platformInfo?.adapterType === 'WebBluetooth'}
      setupComplete={initialSetupComplete} transferComplete={initialTransferComplete}
      onCacheFirmware={() => { void cacheSelectedFirmware(); }} onStartUpdateNetwork={() => { void startUpdateNetwork(); }}
      onRetryInitialConnection={() => { void startUpdateNetwork(true); }}
      onUpload={() => { void upload(); }} onRetryVerification={() => { void retryInstalledDemoVerification(); }}
      onHideNextTimeChange={onInitialGuideHideNextTimeChange}
      onDismiss={onInitialGuideDismiss}
    />;
  }

  return (
    <>
      <OtaPanelView {...{ isConnected, initialSetupMode, initialSetupSupported, otaSupported,
        selectedFirmwareReady, networkReady, canDownloadFirmware, canStartUpdateNetwork,
        canUpload, firmwareReleases, selectedReleaseId, firmwareCatalogBusy,
        firmwareDownloadBusy, connectionFlowBusy, transferBusy, connectionPhase,
        connectionRemainingSeconds, wifiJoinResult, otaControlStatus, uploadProgress,
        firmwareStepDetail, session, httpStatus, message, autoJoinAvailable, updateComplete }}
      onReload={() => { void loadFirmwareReleases(); void onRefreshOtaControlStatus(); }}
      onToggleInitialSetup={() => {
        setInitialSetupMode((current) => !current);
        setInitialSession(null); setUpdateNetworkReady(false); setMessage(null);
      }}
      onSelectedReleaseIdChange={setSelectedReleaseId}
      onCacheFirmware={cacheSelectedFirmware}
      onStartUpdateNetwork={startUpdateNetwork}
      onUpload={upload}
      onClearMessage={() => setMessage(null)}
      onError={(error) => setMessage(alertMessage(error instanceof Error ? error.message : '更新準備に失敗しました'))}
      onRefreshHttpStatus={refreshHttpStatus} onCopySessionValue={(label, value) => { void copySessionValue(label, value); }}
      />
    </>
  );
};
