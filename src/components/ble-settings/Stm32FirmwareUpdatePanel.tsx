import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Stm32UpdateControlSessionBinding } from '../../types/ble';
import {
  readStm32UpdateHttpStatus,
  STM32_STATUS_REQUEST_TIMEOUT_MS,
  STM32_WEB_CONNECTION_REQUEST_TIMEOUT_MS,
  type Stm32PackageUploadProgress,
  type Stm32UpdateHttpStatus,
} from '../../services/ota/stm32OtaTransfer';
import { readLocalNetworkAccessPermissionState } from '../../services/ble/platformDetector';
import {
  connectToEsp32SoftAp,
  describeNativeSoftApJoinFailure,
  isNativeSoftApJoinAvailable,
  removeEsp32SoftApConfiguration,
  shouldRetryNativeSoftApJoin,
  type NativeSoftApJoinResult,
} from '../../services/ota/nativeSoftAp';
import type { Stm32FirmwareUpdatePanelProps } from './Stm32FirmwareUpdatePanel.types';
import { Stm32FirmwareUpdatePanelView } from './Stm32FirmwareUpdatePanelView';
import { useStm32ReleaseCatalog } from './useStm32ReleaseCatalog';
import { useStm32SafeWriteFlow } from './useStm32SafeWriteFlow';
import { assertStm32PreparationStatus, Stm32UnexpectedCompletionError } from './stm32CompletionGuard';
import {
  canContinueAfterActivatePortal,
  describeOtaResult,
  toSession,
  wait,
  type OtaConnectionPhase,
} from './otaPanelHelpers';
import { confirmLegacyOtaMigration, resolveOtaAuthorization } from './otaAuthorizationFlow';
import {
  describeReattachedStm32Status,
  describeStm32StatusReadFailure,
  describeStm32WebConnectionFailure,
  isStm32WriteLocked,
  stm32AlertMessage,
  stm32StatusMessage,
  shouldClearCachedPackageAfterStatus,
  statusSessionMatchesRelease,
  type Stm32PanelMessage,
} from './stm32UpdatePanelHelpers';
const SOFT_AP_BOOT_WAIT_MS = 3500;
const IOS_CONNECTION_ESTIMATE_SECONDS = 18;
const WEB_CONNECTION_ESTIMATE_SECONDS = 8;
export const Stm32FirmwareUpdatePanel = ({
  isConnected,
  capabilitiesStatus,
  stm32FirmwareVersion,
  stm32UpdateControlStatus,
  stm32UpdateControlBusy,
  observedBleNodeId,
  platformInfo,
  onRefreshStm32FirmwareVersion,
  onRefreshStm32UpdateControlStatus,
  onWriteStm32UpdateControl,
}: Stm32FirmwareUpdatePanelProps) => {
  const [httpStatus, setHttpStatus] = useState<Stm32UpdateHttpStatus | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Stm32PackageUploadProgress | null>(null);
  const [networkReady, setNetworkReady] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [connectionFlowBusy, setConnectionFlowBusy] = useState(false);
  const [connectionPhase, setConnectionPhase] = useState<OtaConnectionPhase>('idle');
  const [connectionDeadlineMs, setConnectionDeadlineMs] = useState<number | null>(null);
  const [connectionRemainingSeconds, setConnectionRemainingSeconds] = useState<number | null>(null);
  const [wifiJoinResult, setWifiJoinResult] = useState<NativeSoftApJoinResult | null>(null);
  const [message, setMessage] = useState<Stm32PanelMessage | null>(null);
  const [closedSessionToken, setClosedSessionToken] = useState<string | null>(null);
  const versionRefreshRequestKeyRef = useRef<string | null>(null);
  const connectionFlowInFlightRef = useRef(false);
  const completedSessionCleanupTokenRef = useRef<string | null>(null);
  const freshSessionTokenRef = useRef<string | null>(null);
  const connectionGenerationRef = useRef(0);

  const controlSession = useMemo(() => toSession(stm32UpdateControlStatus), [stm32UpdateControlStatus]);
  const session = controlSession?.token === closedSessionToken ? null : controlSession;
  const stm32UpdateSupported = capabilitiesStatus?.stm32UpdateControl === true;
  const autoJoinAvailable = platformInfo?.adapterType === 'Capacitor' && isNativeSoftApJoinAvailable();
  const onReleaseSelectionInvalidated = useCallback(() => {
    setUploadProgress(null);
    setNetworkReady(false);
  }, []);
  const releaseCatalog = useStm32ReleaseCatalog({
    adapterType: platformInfo?.adapterType,
    connectionFlowBusy,
    transferBusy,
    onSelectionInvalidated: onReleaseSelectionInvalidated,
    onMessage: setMessage,
  });
  const {
    releases,
    selectedReleaseId,
    setSelectedReleaseId,
    selectedRelease,
    catalogBusy,
    downloadBusy,
    cachedPackage,
    selectedPackageReady,
    browserReleaseBlocked,
    browserUpdateUnavailableReason,
    canDownloadPackage,
    loadReleases,
    cacheSelectedPackage,
    clearCachedPackage: clearReleasePackage,
  } = releaseCatalog;
  const clearCachedPackage = useCallback(() => {
    clearReleasePackage();
    setUploadProgress(null);
  }, [clearReleasePackage]);
  const recoverySessionAvailable = Boolean(
    session && autoJoinAvailable && httpStatus?.phase === 'recovery_required' &&
    statusSessionMatchesRelease(httpStatus, selectedRelease)
  );
  const retryConnectionAvailable = Boolean(
    session && autoJoinAvailable && (
      recoverySessionAvailable ||
      (!networkReady && (!isConnected || connectionPhase === 'wifi'))
    )
  );
  const canStartUpdateNetwork = Boolean(
    (
      recoverySessionAvailable ||
      (stm32UpdateSupported && (isConnected || retryConnectionAvailable))
    ) &&
    (selectedPackageReady || recoverySessionAvailable) &&
    !browserReleaseBlocked && !stm32UpdateControlBusy &&
    !connectionFlowBusy &&
    !transferBusy
  );
  const writeLocked = isStm32WriteLocked(httpStatus);
  useEffect(() => {
    if (!connectionDeadlineMs) return;
    const updateRemainingSeconds = () => {
      setConnectionRemainingSeconds(Math.max(0, Math.ceil((connectionDeadlineMs - Date.now()) / 1000)));
    };
    updateRemainingSeconds();
    const intervalId = window.setInterval(updateRemainingSeconds, 250);
    return () => window.clearInterval(intervalId);
  }, [connectionDeadlineMs]);

  const startConnectionCountdown = useCallback((seconds: number) => {
    setConnectionDeadlineMs(Date.now() + seconds * 1000);
    setConnectionRemainingSeconds(seconds);
  }, []);

  const stopConnectionCountdown = useCallback(() => {
    setConnectionDeadlineMs(null);
    setConnectionRemainingSeconds(null);
  }, []);

  const readStatus = useCallback(async (
    targetSession = session,
    signal?: AbortSignal,
    timeoutMs = STM32_STATUS_REQUEST_TIMEOUT_MS,
  ): Promise<Stm32UpdateHttpStatus | null> => {
    if (!targetSession) return null;
    const generation = connectionGenerationRef.current;
    const preparing = freshSessionTokenRef.current === targetSession.token;
    const status = await readStm32UpdateHttpStatus(targetSession, signal, timeoutMs);
    if (generation !== connectionGenerationRef.current) return null;
    if (preparing) assertStm32PreparationStatus(status);
    setHttpStatus(status);
    return status;
  }, [session]);

  const safeWriteFlow = useStm32SafeWriteFlow({
    session,
    selectedRelease,
    cachedPackage,
    httpStatus,
    networkReady: networkReady && !browserReleaseBlocked,
    connectionFlowBusy,
    transferBusy,
    setHttpStatus,
    setUploadProgress,
    setTransferBusy,
    setNetworkReady,
    setMessage,
    clearCachedPackage,
    onWriteRequested: (writeSession) => {
      if (freshSessionTokenRef.current === writeSession.token) freshSessionTokenRef.current = null;
    },
    onCancelConfirmed: async () => {
      if (session && autoJoinAvailable) {
        try {
          await removeEsp32SoftApConfiguration(session);
        } catch (error) {
          console.warn('STM32更新用Wi-Fi設定を明示削除できませんでした。joinOnce cleanupへ委ねます:', error);
        }
      }
      const closedToken = session?.token ?? null;
      window.setTimeout(() => setClosedSessionToken(closedToken), 0);
      setWifiJoinResult(null);
      setConnectionPhase('idle');
      stopConnectionCountdown();
    },
  });

  useEffect(() => {
    if (
      httpStatus?.phase !== 'complete' || !session || transferBusy || connectionFlowBusy ||
      !statusSessionMatchesRelease(httpStatus, selectedRelease) ||
      completedSessionCleanupTokenRef.current === session.token
    ) return;

    const completedSession = session;
    completedSessionCleanupTokenRef.current = completedSession.token;
    void (async () => {
      if (autoJoinAvailable) {
        try {
          await removeEsp32SoftApConfiguration(completedSession);
        } catch (error) {
          console.warn('完了したSTM32更新用Wi-Fi設定を明示削除できませんでした。joinOnce cleanupへ委ねます:', error);
        }
      }
      setClosedSessionToken(completedSession.token);
      setNetworkReady(false);
      setWifiJoinResult(null);
      setConnectionPhase('idle');
      stopConnectionCountdown();
    })();
  }, [
    autoJoinAvailable,
    connectionFlowBusy,
    httpStatus,
    selectedRelease,
    session,
    stopConnectionCountdown,
    transferBusy,
  ]);

  useEffect(() => {
    if (httpStatus?.phase !== 'complete' || !isConnected) return;
    const refreshKey = `${httpStatus.releaseTag || selectedReleaseId || 'complete'}:${stm32FirmwareVersion?.firmwareVersionRaw ?? 'unknown'}`;
    if (versionRefreshRequestKeyRef.current === refreshKey) return;
    versionRefreshRequestKeyRef.current = refreshKey;
    onRefreshStm32FirmwareVersion();
  }, [
    httpStatus?.phase,
    httpStatus?.releaseTag,
    isConnected,
    onRefreshStm32FirmwareVersion,
    selectedReleaseId,
    stm32FirmwareVersion?.firmwareVersionRaw,
  ]);

  useEffect(() => {
    if (!session || transferBusy || connectionFlowBusy) return;
    const reattachStatus = () => {
      if (document.visibilityState !== 'visible') return;
      // The first browser request must come from the visible connection action,
      // not a focus event while the user is switching Wi-Fi or granting access.
      if (!autoJoinAvailable && !networkReady && freshSessionTokenRef.current === session.token) return;
      void readStatus(session)
        .then((status) => {
          if (!status) return;
          const matchesSession = statusSessionMatchesRelease(status, selectedRelease);
          setNetworkReady(matchesSession);
          if (matchesSession && shouldClearCachedPackageAfterStatus(status)) {
            clearCachedPackage();
          }
        })
        .catch(() => undefined);
    };
    document.addEventListener('visibilitychange', reattachStatus);
    window.addEventListener('focus', reattachStatus);
    return () => {
      document.removeEventListener('visibilitychange', reattachStatus);
      window.removeEventListener('focus', reattachStatus);
    };
  }, [autoJoinAvailable, clearCachedPackage, connectionFlowBusy, networkReady, readStatus, selectedRelease, session, transferBusy]);

  const waitForStm32Status = async (targetSession: NonNullable<typeof session>, timeoutSeconds: number) => {
    const deadline = Date.now() + timeoutSeconds * 1000;
    startConnectionCountdown(timeoutSeconds);
    while (Date.now() <= deadline) {
      try {
        const status = await readStatus(targetSession);
        if (
          status &&
          statusSessionMatchesRelease(status, selectedRelease)
        ) return true;
        if (status) {
          setMessage(stm32AlertMessage('STM32 update endpointのsessionまたは選択releaseが一致しません。更新準備からやり直してください'));
          return false;
        }
      } catch (error) {
        if (error instanceof Stm32UnexpectedCompletionError) throw error;
        // Retry until the SoftAP HTTP server is reachable from the current Wi-Fi.
      }
      await wait(1000);
    }
    setMessage(stm32AlertMessage(
      `iOSの接続要求は受理されましたが「${targetSession.ssid}」のSTM32 update endpointへ到達できません。設定 > Wi-Fiで接続先を確認し、本体が白表示ならStep 2を再試行してください。SSIDが見つからない場合はBLE接続から更新準備をやり直してください`
    ));
    return false;
  };

  const probeStatusAfterJoinError = async (
    targetSession: NonNullable<typeof session>,
  ): Promise<'matched' | 'handled' | 'unreachable'> => {
    try {
      const status = await readStatus(targetSession);
      if (status && statusSessionMatchesRelease(status, selectedRelease)) return 'matched';
      if (status) {
        setMessage(stm32AlertMessage(
          'STM32 update endpointへ到達しましたがsessionまたは選択releaseが一致しません。BLE接続から更新準備をやり直してください'
        ));
        return 'handled';
      }
    } catch (error) {
      if (error instanceof Stm32UnexpectedCompletionError) throw error;
      const detail = error instanceof Error ? error.message : '';
      if (/HTTP (401|403)\b/.test(detail)) {
        setMessage(stm32AlertMessage(
          'STM32更新sessionのtokenが期限切れまたは無効です。本体を通常起動へ戻し、BLE接続から更新準備をやり直してください'
        ));
        return 'handled';
      }
    }
    return 'unreachable';
  };

  const joinSoftAp = async (targetSession: NonNullable<typeof session>): Promise<boolean> => {
    if (!autoJoinAvailable) return false;
    try {
      setConnectionPhase('iosPrompt');
      stopConnectionCountdown();
      setMessage(stm32StatusMessage('iOSの確認ダイアログで接続を承認してください'));
      let result = await connectToEsp32SoftAp(targetSession);
      setWifiJoinResult(result);

      if (!result.connected) {
        setConnectionPhase('wifi');
        let statusProbe = await probeStatusAfterJoinError(targetSession);
        if (statusProbe === 'matched') {
          setWifiJoinResult({
            ...result,
            connected: true,
            reason: 'statusReachableAfterJoinError',
          });
          setMessage(stm32StatusMessage(
            'iOSの接続APIはerrorを返しましたが、token付きSTM32 statusで更新用Wi-Fi接続を確認しました'
          ));
          return true;
        }
        if (statusProbe === 'handled') return false;

        if (shouldRetryNativeSoftApJoin(result)) {
          setConnectionPhase('iosPrompt');
          setMessage(stm32StatusMessage('iOSの一時的なWi-Fi接続エラーを同じsessionで1回だけ再試行しています'));
          await wait(750);
          result = await connectToEsp32SoftAp(targetSession);
          setWifiJoinResult(result);
          if (result.connected) {
            setConnectionPhase('wifi');
            const reachable = await waitForStm32Status(targetSession, IOS_CONNECTION_ESTIMATE_SECONDS);
            if (reachable) setMessage(stm32StatusMessage('更新用Wi-Fi接続を確認しました'));
            return reachable;
          }
          setConnectionPhase('wifi');
          statusProbe = await probeStatusAfterJoinError(targetSession);
          if (statusProbe === 'matched') {
            setWifiJoinResult({
              ...result,
              connected: true,
              reason: 'statusReachableAfterJoinError',
            });
            setMessage(stm32StatusMessage(
              'iOSの接続APIはerrorを返しましたが、token付きSTM32 statusで更新用Wi-Fi接続を確認しました'
            ));
            return true;
          }
          if (statusProbe === 'handled') return false;
        }

        setMessage(stm32AlertMessage(describeNativeSoftApJoinFailure(result)));
        return false;
      }
      setConnectionPhase('wifi');
      const reachable = await waitForStm32Status(targetSession, IOS_CONNECTION_ESTIMATE_SECONDS);
      if (reachable) setMessage(stm32StatusMessage('更新用Wi-Fi接続を確認しました'));
      return reachable;
    } catch (error) {
      setWifiJoinResult({
        ssid: targetSession.ssid,
        connected: false,
        reason: 'pluginError',
        message: error instanceof Error ? error.message : 'Wi-Fi自動接続に失敗しました',
      });
      setMessage(stm32AlertMessage(error instanceof Error ? error.message : 'Wi-Fi自動接続に失敗しました'));
      return false;
    }
  };

  const startUpdateNetwork = async () => {
    if (browserUpdateUnavailableReason) {
      setMessage(stm32AlertMessage(browserUpdateUnavailableReason));
      return;
    }
    if (!selectedPackageReady && !recoverySessionAvailable) {
      setMessage(stm32AlertMessage('SoftAP接続前にSTM32 FW packageを取得してください'));
      return;
    }
    if (connectionFlowInFlightRef.current) return;
    connectionFlowInFlightRef.current = true;
    connectionGenerationRef.current += 1;
    safeWriteFlow.resetSafeWriteFlow();
    setMessage(null);
    setConnectionFlowBusy(true);
    setNetworkReady(false);
    setWifiJoinResult(null);
    if (!recoverySessionAvailable) setHttpStatus(null);
    setConnectionPhase('credentials');
    if (!autoJoinAvailable) startConnectionCountdown(WEB_CONNECTION_ESTIMATE_SECONDS);

    try {
      if (retryConnectionAvailable && session && autoJoinAvailable) {
        setMessage(stm32StatusMessage('保持済みSTM32更新sessionでWi-Fi接続を再試行します'));
        const joined = await joinSoftAp(session);
        if (!joined) return;
        setNetworkReady(true);
        setConnectionPhase('done');
        return;
      }

      if (!isConnected) {
        setMessage(stm32AlertMessage('BLE接続からSTM32更新準備を開始してください'));
        return;
      }

      const binding: Stm32UpdateControlSessionBinding | undefined = selectedRelease
        ? {
            target: selectedRelease.target,
            releaseTag: selectedRelease.releaseTag,
            // Legacy ESP32 builds require this wire field. Current firmware
            // treats it as an optional user label and never as OTA identity.
            expectedNodeId: observedBleNodeId,
          }
        : undefined;
      let preparedStatus = await onWriteStm32UpdateControl('preparePortal', binding);
      const authorization = await resolveOtaAuthorization({
        initialStatus: preparedStatus,
        readStatus: () => onWriteStm32UpdateControl('read'),
        waitingMessage: '更新準備ができました。LEDが黄色で点滅している間に本体ボタンを押し続け、白の確認表示に変わったら離してください',
        describeResult: describeOtaResult,
        onWaiting: (text, seconds) => {
          setConnectionPhase('physicalAuth');
          startConnectionCountdown(seconds);
          setMessage(stm32StatusMessage(text));
        },
        onFinishedWaiting: stopConnectionCountdown,
      });
      if (authorization.error !== null) {
        setMessage(stm32AlertMessage(authorization.error));
        return;
      }
      preparedStatus = authorization.status;
      if (!confirmLegacyOtaMigration(preparedStatus, '接続中のESP32 firmwareは本体ボタン認可に未対応です。旧方式のSTM32更新を続けますか？')) {
        await onWriteStm32UpdateControl('stopOrCancel');
        setMessage(stm32AlertMessage('旧方式でのSTM32更新を中止しました'));
        return;
      }
      let activeSession = toSession(preparedStatus);
      if (!activeSession) {
        setMessage(stm32AlertMessage('更新用Wi-Fi sessionを取得できませんでした'));
        return;
      }
      freshSessionTokenRef.current = activeSession.token;

      setConnectionPhase('softAp');
      const activatedStatus = await onWriteStm32UpdateControl('activatePortal');
      if (!canContinueAfterActivatePortal(activatedStatus)) {
        setMessage(stm32AlertMessage('STM32更新用Wi-Fiを起動できませんでした'));
        return;
      }
      activeSession = toSession(activatedStatus) ?? activeSession;
      if (!activeSession) {
        setMessage(stm32AlertMessage('更新用Wi-Fi sessionを取得できませんでした'));
        return;
      }
      freshSessionTokenRef.current = activeSession.token;

      if (autoJoinAvailable) {
        setMessage(stm32StatusMessage('更新用Wi-Fiの起動を待っています'));
        await wait(SOFT_AP_BOOT_WAIT_MS);
        const joined = await joinSoftAp(activeSession);
        if (!joined) return;
      } else {
        setMessage(stm32StatusMessage('更新用Wi-Fiを開始しました。接続後に状態確認を実行してください'));
      }
      setNetworkReady(autoJoinAvailable);
      setConnectionPhase(autoJoinAvailable ? 'done' : 'wifi');
    } finally {
      connectionFlowInFlightRef.current = false;
      setConnectionFlowBusy(false);
      stopConnectionCountdown();
    }
  };

  const refreshStm32HttpStatus = async () => {
    setTransferBusy(true);
    const manualWeb = platformInfo?.adapterType !== 'Capacitor';
    try {
      const permission = manualWeb ? await readLocalNetworkAccessPermissionState() : null;
      if (permission === 'denied') {
        safeWriteFlow.invalidateProbeProof();
        setNetworkReady(false);
        setMessage(stm32AlertMessage(describeStm32WebConnectionFailure(null, session?.ssid ?? '', permission)));
        return false;
      }
      const timeoutMs = manualWeb && permission !== 'granted'
        ? STM32_WEB_CONNECTION_REQUEST_TIMEOUT_MS : STM32_STATUS_REQUEST_TIMEOUT_MS;
      const status = await readStatus(session, undefined, timeoutMs);
      const matchesSession = Boolean(
        session &&
        status &&
        statusSessionMatchesRelease(status, selectedRelease)
      );
      setNetworkReady(matchesSession);
      if (matchesSession && status && shouldClearCachedPackageAfterStatus(status)) {
        clearCachedPackage();
      }
      setMessage(
        matchesSession && status
          ? describeReattachedStm32Status(status)
          : stm32AlertMessage('STM32 update endpointのsessionまたは選択releaseが一致しません')
      );
      return matchesSession;
    } catch (error) {
      safeWriteFlow.invalidateProbeProof();
      setNetworkReady(false);
      const permission = manualWeb ? await readLocalNetworkAccessPermissionState() : null;
      setMessage(stm32AlertMessage(manualWeb
        ? describeStm32WebConnectionFailure(error, session?.ssid ?? '', permission)
        : describeStm32StatusReadFailure(error)));
      return false;
    } finally {
      setTransferBusy(false);
    }
  };
  return (
    <Stm32FirmwareUpdatePanelView
      {...{
        isConnected, releases, selectedReleaseId, selectedRelease, cachedPackage, catalogBusy, downloadBusy,
        connectionFlowBusy, transferBusy, selectedPackageReady, canDownloadPackage,
        browserReleaseBlocked, browserUpdateUnavailableReason, networkReady, canStartUpdateNetwork, autoJoinAvailable,
        retryConnectionAvailable, recoverySessionAvailable, stm32UpdateSupported, connectionPhase,
        connectionRemainingSeconds, session, writeLocked, uploadProgress, httpStatus, message,
        stm32UpdateControlStatus, stm32FirmwareVersion, observedBleNodeId,
        wifiJoinResult, safeWriteFlow,
      }}
      onSelectedReleaseIdChange={setSelectedReleaseId}
      onReload={async () => {
        safeWriteFlow.resetSafeWriteFlow();
        await loadReleases();
        await onRefreshStm32UpdateControlStatus();
      }}
      onCacheSelectedPackage={cacheSelectedPackage}
      onStartUpdateNetwork={startUpdateNetwork}
      onRefreshStm32HttpStatus={refreshStm32HttpStatus}
      onClearMessage={() => setMessage(null)}
      onError={(error) => setMessage(stm32AlertMessage(error instanceof Error ? error.message : '更新準備に失敗しました'))}
    />
  );
};
