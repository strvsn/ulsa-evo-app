import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { Esp32OtaSession } from '../../services/ota/esp32OtaTransfer';
import type { Stm32FirmwareReleaseOption } from '../../services/ota/stm32FirmwareReleaseCatalog';
import {
  cancelStm32FirmwareUpdate,
  isAmbiguousStm32TransferError,
  monitorStm32FirmwareWrite,
  probeStm32BootloaderSync,
  readStm32UpdateHttpStatus,
  startStm32FirmwareWrite,
  Stm32SyncProbeResponseError,
  Stm32SyncProbeRejectedError,
  Stm32SyncProbeTimeoutError,
  Stm32HttpStatusError,
  Stm32WriteMonitorError,
  uploadStm32FirmwarePackage,
  type Stm32PackageUploadProgress,
  type Stm32UpdateHttpStatus,
} from '../../services/ota/stm32OtaTransfer';
import {
  canReuseStoredStm32Package,
  describeStm32TerminalMessage,
  describeUnknownStm32CancelState,
  describeUnknownStm32WriteState,
  isTerminalStatus,
  isStm32WriteLocked,
  shouldClearCachedPackageAfterStatus,
  stm32AlertMessage,
  stm32StatusMessage,
  type CachedStm32Package,
  type Stm32PanelMessage,
  type Stm32SafeWriteAction,
} from './stm32UpdatePanelHelpers';
import {
  createStm32SyncProbeProof,
  doesStm32SessionReleaseMatch,
  doesStm32StatusMatchBinding,
  doesStm32SyncProbeProofMatch,
  type Stm32SyncProbeProof,
} from './stm32SyncProbeProof';
import { assertStm32PreparationStatus, Stm32UnexpectedCompletionError } from './stm32CompletionGuard';

type Args = {
  session: Esp32OtaSession | null;
  selectedRelease: Stm32FirmwareReleaseOption | null;
  cachedPackage: CachedStm32Package | null;
  httpStatus: Stm32UpdateHttpStatus | null;
  networkReady: boolean;
  connectionFlowBusy: boolean;
  transferBusy: boolean;
  setHttpStatus: Dispatch<SetStateAction<Stm32UpdateHttpStatus | null>>;
  setUploadProgress: Dispatch<SetStateAction<Stm32PackageUploadProgress | null>>;
  setTransferBusy: Dispatch<SetStateAction<boolean>>;
  setNetworkReady: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<Stm32PanelMessage | null>>;
  clearCachedPackage: () => void;
  onWriteRequested?: (session: Esp32OtaSession) => void;
  onCancelConfirmed: () => void | Promise<void>;
};

type InFlightOperation = {
  bindingKey: string;
  controller: AbortController;
  generation: number;
  writeMayHaveStarted: boolean;
};

const describeProbeFailure = (status: Stm32UpdateHttpStatus): string =>
  status.bootloaderSyncError || status.error || 'STM32 bootloaderの非消去確認に失敗しました';

const describeProbeRequestError = (error: unknown): string => {
  if (error instanceof Stm32SyncProbeTimeoutError) {
    return 'STM32 bootloaderの非消去確認が30秒でタイムアウトしました。STM32 status再確認後にやり直してください';
  }
  if (error instanceof Stm32SyncProbeResponseError) {
    return 'STM32 bootloaderの非消去確認応答が不正です。接続先と更新用sessionを確認してください';
  }
  return error instanceof Error ? error.message : 'STM32 bootloaderの非消去確認に失敗しました';
};

export const useStm32SafeWriteFlow = ({
  session,
  selectedRelease,
  cachedPackage,
  httpStatus,
  networkReady,
  connectionFlowBusy,
  transferBusy,
  setHttpStatus,
  setUploadProgress,
  setTransferBusy,
  setNetworkReady,
  setMessage,
  clearCachedPackage,
  onWriteRequested,
  onCancelConfirmed,
}: Args) => {
  const [probeProof, setProbeProof] = useState<Stm32SyncProbeProof | null>(null);
  const [activeAction, setActiveAction] = useState<Stm32SafeWriteAction>('idle');
  const generationRef = useRef(0);
  const operationInFlightRef = useRef(false);
  const activeOperationRef = useRef<InFlightOperation | null>(null);
  const bindingKey = [
    session?.token ?? '',
    session?.ip ?? '',
    selectedRelease?.target ?? '',
    selectedRelease?.releaseTag ?? '',
    selectedRelease?.packageSha256 ?? '',
    selectedRelease?.size ?? '',
  ].join('\u0000');
  const bindingKeyRef = useRef(bindingKey);
  const writeLocked = isStm32WriteLocked(httpStatus);
  const storedPackageReady = Boolean(
    session && canReuseStoredStm32Package(httpStatus) &&
    selectedRelease && httpStatus &&
    doesStm32StatusMatchBinding(httpStatus, session, selectedRelease)
  );
  const probeReady = doesStm32SyncProbeProofMatch(
    probeProof, session, selectedRelease, httpStatus
  );
  const canUploadPackage = Boolean(
    session && (cachedPackage || storedPackageReady) && networkReady &&
    !connectionFlowBusy && !transferBusy && !writeLocked
  );
  const canProbePackage = Boolean(
    session && storedPackageReady && networkReady &&
    !connectionFlowBusy && !transferBusy && !writeLocked
  );
  const canStartWrite = Boolean(
    probeReady && !connectionFlowBusy && !transferBusy && !writeLocked
  );
  const canResumeMonitoring = Boolean(
    session && selectedRelease && httpStatus && networkReady && writeLocked &&
    !isTerminalStatus(httpStatus) &&
    doesStm32SessionReleaseMatch(httpStatus, session, selectedRelease) &&
    !connectionFlowBusy && !transferBusy
  );
  const canCancelUpdate = Boolean(
    (session || cachedPackage || httpStatus || networkReady) &&
    !connectionFlowBusy && !transferBusy && !writeLocked
  );

  const invalidateProbeProof = useCallback(() => setProbeProof(null), []);

  const abortActiveOperation = useCallback((bindingChanged: boolean, updateUi = true) => {
    const operation = activeOperationRef.current;
    activeOperationRef.current = null;
    operationInFlightRef.current = false;
    operation?.controller.abort();
    if (updateUi) {
      setActiveAction('idle');
      setTransferBusy(false);
    }
    if (updateUi && bindingChanged && operation?.writeMayHaveStarted) {
      setNetworkReady(false);
      setMessage(stm32AlertMessage(
        'STM32書込み開始後に接続またはrelease bindingが変わりました。デバイス側の状態は不明です。STM32 status再確認で現在状態を確認してください'
      ));
    }
  }, [setMessage, setNetworkReady, setTransferBusy]);

  const resetSafeWriteFlow = useCallback(() => {
    generationRef.current += 1;
    invalidateProbeProof();
    abortActiveOperation(false);
  }, [abortActiveOperation, invalidateProbeProof]);

  useLayoutEffect(() => {
    if (bindingKeyRef.current === bindingKey) return;
    bindingKeyRef.current = bindingKey;
    generationRef.current += 1;
    invalidateProbeProof();
    abortActiveOperation(true);
  }, [abortActiveOperation, bindingKey, invalidateProbeProof]);

  useEffect(() => () => {
    generationRef.current += 1;
    abortActiveOperation(false, false);
  }, [abortActiveOperation]);

  useEffect(() => {
    if (probeProof && !probeReady) invalidateProbeProof();
  }, [invalidateProbeProof, probeProof, probeReady]);

  const beginOperation = (): InFlightOperation | null => {
    if (operationInFlightRef.current) return null;
    const operation: InFlightOperation = {
      bindingKey: bindingKeyRef.current,
      controller: new AbortController(),
      generation: generationRef.current,
      writeMayHaveStarted: false,
    };
    operationInFlightRef.current = true;
    activeOperationRef.current = operation;
    return operation;
  };

  const isCurrentOperation = (operation: InFlightOperation): boolean =>
    activeOperationRef.current === operation &&
    generationRef.current === operation.generation &&
    bindingKeyRef.current === operation.bindingKey &&
    !operation.controller.signal.aborted;

  const finishOperation = (operation: InFlightOperation) => {
    if (activeOperationRef.current !== operation) return;
    activeOperationRef.current = null;
    operationInFlightRef.current = false;
    setActiveAction('idle');
    setTransferBusy(false);
  };

  const rejectStaleCompletion = (error: unknown): boolean => {
    const stale = error instanceof Stm32UnexpectedCompletionError ||
      ((error instanceof Stm32HttpStatusError || error instanceof Stm32SyncProbeRejectedError) &&
        error.status.phase === 'complete');
    if (!stale) return false;
    invalidateProbeProof();
    setHttpStatus(null);
    setNetworkReady(false);
    setMessage(stm32AlertMessage(new Stm32UnexpectedCompletionError().message));
    return true;
  };

  const uploadPackage = async () => {
    if (!session || (!cachedPackage && !storedPackageReady)) {
      setMessage(stm32AlertMessage('SoftAP接続前にSTM32 FW packageを取得してください'));
      return;
    }
    const operation = beginOperation();
    if (!operation) return;
    invalidateProbeProof();
    setTransferBusy(true);
    setActiveAction('upload');
    try {
      setMessage(stm32StatusMessage('暗号化STM32 packageをESP32へ転送しています'));
      setUploadProgress(null);
      let uploadStatus = await readStm32UpdateHttpStatus(session, operation.controller.signal);
      if (!isCurrentOperation(operation)) return;
      assertStm32PreparationStatus(uploadStatus);
      setHttpStatus(uploadStatus);
      const canReuseStored = Boolean(
        uploadStatus && selectedRelease &&
        doesStm32StatusMatchBinding(uploadStatus, session, selectedRelease) &&
        canReuseStoredStm32Package(uploadStatus)
      );
      if (!canReuseStored) {
        if (!cachedPackage) {
          setMessage(stm32AlertMessage('ESP32内のpackageが再利用できません。Packageを再取得してください'));
          return;
        }
        uploadStatus = await uploadStm32FirmwarePackage(
          session,
          cachedPackage.file,
          (progress) => {
            if (isCurrentOperation(operation)) setUploadProgress(progress);
          },
          selectedRelease?.packageSha256,
          operation.controller.signal,
        );
        if (!isCurrentOperation(operation)) return;
        assertStm32PreparationStatus(uploadStatus);
        setHttpStatus(uploadStatus);
        setUploadProgress(null);
      }
      if (!uploadStatus || !selectedRelease ||
          !doesStm32StatusMatchBinding(uploadStatus, session, selectedRelease)) {
        setNetworkReady(false);
        setMessage(stm32AlertMessage('STM32 update endpointのbindingが一致しません。Package転送を停止しました'));
        return;
      }
      if (!canReuseStoredStm32Package(uploadStatus)) {
        setMessage(stm32AlertMessage(uploadStatus.error || '暗号化packageの検証が完了していません'));
        return;
      }
      setMessage(stm32StatusMessage('暗号化packageの転送とESP32上の検証が完了しました。STM32はまだ消去していません'));
    } catch (error) {
      if (!isCurrentOperation(operation)) return;
      invalidateProbeProof();
      if (rejectStaleCompletion(error)) return;
      if (error instanceof Stm32HttpStatusError) {
        setHttpStatus(error.status);
        if (shouldClearCachedPackageAfterStatus(error.status)) clearCachedPackage();
        setMessage(describeStm32TerminalMessage(error.status));
        return;
      }
      if (isAmbiguousStm32TransferError(error)) {
        setNetworkReady(false);
        setMessage(stm32AlertMessage(describeUnknownStm32WriteState(error, false)));
      } else {
        clearCachedPackage();
        setMessage(stm32AlertMessage(error instanceof Error ? error.message : 'STM32 package転送に失敗しました'));
      }
    } finally {
      finishOperation(operation);
    }
  };

  const probePackage = async () => {
    if (!session || !selectedRelease || !storedPackageReady) {
      setMessage(stm32AlertMessage('暗号化package転送後に非消去確認を実行してください'));
      return;
    }
    const operation = beginOperation();
    if (!operation) return;
    invalidateProbeProof();
    setTransferBusy(true);
    setActiveAction('probe');
    try {
      setMessage(stm32StatusMessage('STM32を消去せずbootloader接続を確認しています'));
      const preProbeStatus = await readStm32UpdateHttpStatus(session, operation.controller.signal);
      if (!isCurrentOperation(operation)) return;
      assertStm32PreparationStatus(preProbeStatus);
      setHttpStatus(preProbeStatus);
      if (!preProbeStatus ||
          !doesStm32StatusMatchBinding(preProbeStatus, session, selectedRelease) ||
          !canReuseStoredStm32Package(preProbeStatus)) {
        setNetworkReady(false);
        setMessage(stm32AlertMessage('非消去確認前のpackage/session bindingが一致しません'));
        return;
      }
      const probeStatus = await probeStm32BootloaderSync(session, operation.controller.signal);
      if (!isCurrentOperation(operation)) return;
      assertStm32PreparationStatus(probeStatus);
      setHttpStatus(probeStatus);
      if (!doesStm32StatusMatchBinding(probeStatus, session, selectedRelease)) {
        setNetworkReady(false);
        setMessage(stm32AlertMessage('非消去確認結果のsessionまたはrelease bindingが一致しません'));
        return;
      }
      const proof = createStm32SyncProbeProof(session, selectedRelease, probeStatus);
      if (!proof) {
        setMessage(stm32AlertMessage(describeProbeFailure(probeStatus)));
        return;
      }
      setProbeProof(proof);
      setMessage(stm32StatusMessage('非消去確認に成功しました。STM32はまだ消去していません。次の明示操作で書込みを開始します'));
    } catch (error) {
      if (!isCurrentOperation(operation)) return;
      invalidateProbeProof();
      if (rejectStaleCompletion(error)) return;
      if (error instanceof Stm32SyncProbeRejectedError) {
        setHttpStatus(error.status);
        setMessage(stm32AlertMessage(describeProbeFailure(error.status)));
        return;
      }
      setNetworkReady(false);
      setMessage(stm32AlertMessage(describeProbeRequestError(error)));
    } finally {
      finishOperation(operation);
    }
  };

  const writeOrResume = async () => {
    const resumeStatus = canResumeMonitoring && httpStatus ? httpStatus : null;
    if (!session || (!resumeStatus && !probeReady)) {
      setMessage(stm32AlertMessage('非消去確認を完了してからSTM32書込みを開始してください'));
      return;
    }
    const operation = beginOperation();
    if (!operation) return;
    setTransferBusy(true);
    setActiveAction(resumeStatus ? 'monitor' : 'write');
    operation.writeMayHaveStarted = Boolean(resumeStatus);
    try {
      setMessage(resumeStatus
        ? stm32StatusMessage('STM32書込み状態の監視を再開しています')
        : stm32StatusMessage('書込み直前のpackage/session/probe状態を再確認しています'));
      setUploadProgress(null);
      let writeStartedStatus = resumeStatus;
      if (!writeStartedStatus) {
        const preWriteStatus = await readStm32UpdateHttpStatus(session, operation.controller.signal);
        if (!isCurrentOperation(operation)) return;
        assertStm32PreparationStatus(preWriteStatus);
        setHttpStatus(preWriteStatus);
        if (!doesStm32SyncProbeProofMatch(
          probeProof, session, selectedRelease, preWriteStatus
        )) {
          invalidateProbeProof();
          if (!preWriteStatus || !selectedRelease ||
              !doesStm32StatusMatchBinding(preWriteStatus, session, selectedRelease)) {
            setNetworkReady(false);
          }
          setMessage(stm32AlertMessage('書込み直前のbindingまたは非消去確認結果が一致しません。非消去確認からやり直してください'));
          return;
        }
        invalidateProbeProof();
        operation.writeMayHaveStarted = true;
        onWriteRequested?.(session);
        writeStartedStatus = await startStm32FirmwareWrite(session, operation.controller.signal);
        if (!isCurrentOperation(operation)) return;
        setHttpStatus(writeStartedStatus);
      }
      if (!selectedRelease ||
          !doesStm32SessionReleaseMatch(writeStartedStatus, session, selectedRelease)) {
        setNetworkReady(false);
        setMessage(stm32AlertMessage('STM32 update endpointのbindingが一致しません。状態確認を中止しました'));
        return;
      }
      const latestStatus = await monitorStm32FirmwareWrite({
        session,
        initialStatus: writeStartedStatus,
        signal: operation.controller.signal,
        onStatus: (nextStatus) => {
          if (!isCurrentOperation(operation)) return;
          setHttpStatus(nextStatus);
          if (!selectedRelease ||
              !doesStm32SessionReleaseMatch(nextStatus, session, selectedRelease)) {
            throw new Error('STM32 update endpointのbindingが一致しません');
          }
        },
      });
      if (!isCurrentOperation(operation)) return;
      if (shouldClearCachedPackageAfterStatus(latestStatus)) clearCachedPackage();
      setMessage(describeStm32TerminalMessage(latestStatus));
    } catch (error) {
      if (!isCurrentOperation(operation)) return;
      invalidateProbeProof();
      if (!operation.writeMayHaveStarted && rejectStaleCompletion(error)) return;
      if (error instanceof Stm32HttpStatusError && error.status.phase !== 'complete') {
        setHttpStatus(error.status);
        if (shouldClearCachedPackageAfterStatus(error.status)) clearCachedPackage();
        setMessage(describeStm32TerminalMessage(error.status));
        return;
      }
      const preserveForUnknownState = operation.writeMayHaveStarted || isAmbiguousStm32TransferError(error);
      if (preserveForUnknownState) {
        if (error instanceof Stm32WriteMonitorError) setHttpStatus(error.lastStatus);
        setNetworkReady(false);
        setMessage(stm32AlertMessage(describeUnknownStm32WriteState(error, operation.writeMayHaveStarted)));
      } else {
        clearCachedPackage();
        setMessage(stm32AlertMessage(error instanceof Error ? error.message : 'STM32 FW更新に失敗しました'));
      }
    } finally {
      finishOperation(operation);
    }
  };

  const cancelUpdate = async () => {
    if (writeLocked) {
      setMessage(stm32AlertMessage('STM32消去/書込み開始後は中断できません。statusを待ってください'));
      return;
    }
    const operation = beginOperation();
    if (!operation) return;
    invalidateProbeProof();
    setTransferBusy(true);
    try {
      if (session) {
        const canceledStatus = await cancelStm32FirmwareUpdate(
          session, operation.controller.signal
        );
        if (!isCurrentOperation(operation)) return;
        setHttpStatus(canceledStatus);
        if (canceledStatus.phase !== 'idle' ||
            canceledStatus.packageReady ||
            canceledStatus.packageBytes !== 0 ||
            canceledStatus.packageSha256 !== null ||
            canceledStatus.canWrite) {
          throw new Error('STM32更新中止後のpackage消去を確認できませんでした');
        }
      }
      if (!isCurrentOperation(operation)) return;
      clearCachedPackage();
      setNetworkReady(false);
      await onCancelConfirmed();
      if (!isCurrentOperation(operation)) return;
      setHttpStatus(null);
      setMessage(stm32StatusMessage(
        'STM32 FW更新を中止し、download済みpackageと更新sessionを削除しました。通常のWi-Fiへ戻し、BLEへ再接続してください'
      ));
    } catch (error) {
      if (!isCurrentOperation(operation)) return;
      invalidateProbeProof();
      setNetworkReady(false);
      setMessage(stm32AlertMessage(describeUnknownStm32CancelState(error)));
    } finally {
      finishOperation(operation);
    }
  };

  return {
    activeAction,
    probeReady,
    storedPackageReady,
    canUploadPackage,
    canProbePackage,
    canStartWrite,
    canResumeMonitoring,
    canCancelUpdate,
    invalidateProbeProof,
    resetSafeWriteFlow,
    uploadPackage,
    probePackage,
    writeOrResume,
    cancelUpdate,
  };
};
