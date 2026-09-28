import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BrowserLogWriter,
  createEmptyBrowserLogStatus,
  deliverBrowserLogArchive,
} from '../../services/browserLog';
import type {
  BrowserLogExportPlan,
  BrowserLogExportScope,
  BrowserLogPreparedArchive,
  BrowserLogStatus,
  LogRecordingMode,
} from '../../services/browserLog';
import type { BLEConnectionState, TimelineSampleListener } from '../ble/types';
import {
  getLogRecordingDestinations,
  isLogRecordingStartBlocked,
  type LogRecordingDestination,
  type LogRecordingDestinationStatus,
} from './logRecordingVisuals';
import {
  readBrowserLogIntervalPreference,
  readLogRecordingModePreference,
  storeBrowserLogIntervalPreference,
  storeLogRecordingModePreference,
} from './logRecordingPreferences';
import { useRecordingElapsedTime } from './useRecordingElapsedTime';

const EMPTY_BROWSER_LOG_STATUS = createEmptyBrowserLogStatus();

const LOG_MODE_LABELS: Record<LogRecordingMode, string> = {
  none: '保存先未選択',
  browser: 'アプリ',
  card: 'カード',
  dual: 'カード＋アプリ',
};

const modeUsesBrowser = (mode: LogRecordingMode): boolean => mode === 'browser' || mode === 'dual';
const modeUsesCard = (mode: LogRecordingMode): boolean => mode === 'card' || mode === 'dual';

interface UseLogRecordingOptions {
  connectionState: BLEConnectionState;
  subscribeTimelineSamples: (listener: TimelineSampleListener) => () => void;
  cardLoggingActive: boolean;
  cardAvailable: boolean;
  cardLogErrorActive: boolean;
  cardActivityNotice?: string;
  cardStopReasonCode?: number | null;
  cardLogOperationBusy: boolean;
  cardLogButtonDisabled: boolean;
  cardLogButtonTitle: string;
  setCardLoggingOnDevice: (enabled: boolean) => Promise<void>;
}

interface BrowserLogNextExportBatch {
  sessionId: string | null;
  batchIndex: number;
  batchCount: number;
  createdAt: number;
  plan: BrowserLogExportPlan;
}

export interface UseLogRecordingReturn {
  logRecordingMode: LogRecordingMode;
  setLogRecordingMode: (mode: LogRecordingMode) => void;
  toggleLogRecordingDestination: (destination: LogRecordingDestination) => void;
  logRecordingModeLabel: string;
  canChangeLogRecordingMode: boolean;
  browserLogIntervalMs: number;
  setBrowserLogIntervalMs: (intervalMs: number) => boolean;
  browserLogStatus: BrowserLogStatus;
  browserLogExportBusy: boolean;
  browserLogExportDisabled: boolean;
  browserLogExportTitle: string;
  browserLogPreparedArchive: BrowserLogPreparedArchive | null;
  browserLogNextExportBatch: BrowserLogNextExportBatch | null;
  browserLogExportNotice: string | null;
  browserLogExportError: string | null;
  browserLogMaintenanceOperation: 'refresh' | 'delete-all' | string | null;
  browserLogMaintenanceError: string | null;
  logButtonActive: boolean;
  recordingElapsedLabel: string;
  recordingDestinations: LogRecordingDestinationStatus[];
  recordingHasError: boolean;
  logButtonDisabled: boolean;
  logButtonTitle: string;
  toggleLogRecording: () => void;
  prepareBrowserLogExport: (scope?: string | string[]) => void;
  deliverPreparedBrowserLogExport: () => void;
  prepareNextBrowserLogExport: () => void;
  discardPreparedBrowserLogExport: () => void;
  refreshBrowserLogs: () => void;
  deleteBrowserLogSession: (sessionId: string) => void;
  deleteAllBrowserLogs: () => void;
}

export const useLogRecording = ({
  connectionState,
  subscribeTimelineSamples,
  cardLoggingActive,
  cardAvailable,
  cardLogErrorActive,
  cardActivityNotice,
  cardStopReasonCode,
  cardLogOperationBusy,
  cardLogButtonDisabled,
  cardLogButtonTitle,
  setCardLoggingOnDevice,
}: UseLogRecordingOptions): UseLogRecordingReturn => {
  const writerRef = useRef<BrowserLogWriter | null>(null);
  const [logRecordingMode, setLogRecordingModeState] = useState<LogRecordingMode>(
    readLogRecordingModePreference
  );
  const [browserLogIntervalMs, setBrowserLogIntervalMsState] = useState(
    readBrowserLogIntervalPreference
  );
  const [browserLogStatus, setBrowserLogStatus] = useState<BrowserLogStatus>(EMPTY_BROWSER_LOG_STATUS);
  const [operationBusy, setOperationBusy] = useState(false);
  const [browserLogExportBusy, setBrowserLogExportBusy] = useState(false);
  const [browserLogPreparedArchive, setBrowserLogPreparedArchive] = useState<BrowserLogPreparedArchive | null>(null);
  const [browserLogNextExportBatch, setBrowserLogNextExportBatch] = useState<BrowserLogNextExportBatch | null>(null);
  const [browserLogExportNotice, setBrowserLogExportNotice] = useState<string | null>(null);
  const [browserLogExportError, setBrowserLogExportError] = useState<string | null>(null);
  const [browserLogMaintenanceOperation, setBrowserLogMaintenanceOperation] = useState<'refresh' | 'delete-all' | string | null>(null);
  const [browserLogMaintenanceError, setBrowserLogMaintenanceError] = useState<string | null>(null);
  const lastBrowserStatusPublishAtRef = useRef(0);
  const lastBrowserLogObservedAtRef = useRef<number | null>(null);
  const nextBrowserLogDueAtRef = useRef<number | null>(null);
  const browserLogIntervalMsRef = useRef(browserLogIntervalMs);
  browserLogIntervalMsRef.current = browserLogIntervalMs;

  if (writerRef.current === null) {
    writerRef.current = new BrowserLogWriter();
  }

  useEffect(() => {
    let disposed = false;
    const writer = writerRef.current;
    if (!writer) return undefined;

    void writer.initialize().then((status) => {
      if (!disposed && (
        status.storedSessionCount > 0 ||
        status.error !== null ||
        status.maintenanceNotice !== null ||
        status.storageQuotaBytes !== null ||
        status.storageUsageBytes !== null ||
        status.storageLimitReached
      )) {
        setBrowserLogStatus(status);
      }
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => subscribeTimelineSamples((sample) => {
    const writer = writerRef.current;
    if (!writer || !writer.isActive()) return;

    const sampleAt = Number.isFinite(sample.timestamp) ? sample.timestamp : Date.now();
    if (lastBrowserLogObservedAtRef.current !== null && sampleAt < lastBrowserLogObservedAtRef.current) {
      // A wall-clock rollback starts a fresh cadence rather than suppressing logs indefinitely.
      nextBrowserLogDueAtRef.current = null;
    }
    lastBrowserLogObservedAtRef.current = sampleAt;
    if (nextBrowserLogDueAtRef.current !== null && sampleAt < nextBrowserLogDueAtRef.current) return;
    const intervalMs = browserLogIntervalMsRef.current;
    const previousDueAt = nextBrowserLogDueAtRef.current;
    nextBrowserLogDueAtRef.current = previousDueAt === null ? sampleAt + intervalMs : previousDueAt;
    while (nextBrowserLogDueAtRef.current <= sampleAt) {
      nextBrowserLogDueAtRef.current += intervalMs;
    }

    void writer.appendSample({ sample }).then((status) => {
      const now = Date.now();
      const urgent = !status.active || status.error !== null || status.storageLimitReached;
      if (!urgent && now - lastBrowserStatusPublishAtRef.current < 1000) return;
      lastBrowserStatusPublishAtRef.current = now;
      setBrowserLogStatus(status);
    });
  }), [subscribeTimelineSamples]);

  const logButtonActive = browserLogStatus.active || cardLoggingActive;
  const { elapsedLabel: recordingElapsedLabel } = useRecordingElapsedTime(browserLogStatus.active);
  const recordingDestinations = useMemo(() => getLogRecordingDestinations({
    mode: logRecordingMode,
    connectionState,
    cardLoggingActive,
    cardAvailable,
    cardErrorActive: cardLogErrorActive,
    cardActivityNotice,
    cardStopReasonCode,
    browserLogStatus,
  }), [browserLogStatus, connectionState, logRecordingMode, cardAvailable, cardLogErrorActive, cardLoggingActive, cardStopReasonCode, cardActivityNotice]);
  const recordingHasError = recordingDestinations.some(({ state }) => state === 'error');

  const needsDeviceStop = cardLoggingActive;

  const browserLogManagementBusy = browserLogMaintenanceOperation !== null;
  const canChangeLogRecordingMode = !logButtonActive &&
    !operationBusy &&
    !browserLogExportBusy &&
    !browserLogManagementBusy &&
    browserLogPreparedArchive === null &&
    browserLogNextExportBatch === null;

  const setLogRecordingMode = useCallback((mode: LogRecordingMode) => {
    setLogRecordingModeState(mode);
    storeLogRecordingModePreference(mode);
  }, []);

  const setBrowserLogIntervalMs = useCallback((intervalMs: number): boolean => {
    if (browserLogStatus.active || !storeBrowserLogIntervalPreference(intervalMs)) return false;
    browserLogIntervalMsRef.current = intervalMs;
    setBrowserLogIntervalMsState(intervalMs);
    return true;
  }, [browserLogStatus.active]);

  const toggleLogRecordingDestination = useCallback((destination: LogRecordingDestination) => {
    if (!canChangeLogRecordingMode) return;

    const usesCard = modeUsesCard(logRecordingMode);
    const usesBrowser = modeUsesBrowser(logRecordingMode);
    const nextUsesCard = destination === 'card' ? !usesCard
      : usesCard && (usesBrowser || (cardAvailable && !cardLogButtonDisabled));
    const nextUsesBrowser = destination === 'browser' ? !usesBrowser : usesBrowser;
    const nextMode: LogRecordingMode = nextUsesCard
      ? nextUsesBrowser ? 'dual' : 'card'
      : nextUsesBrowser ? 'browser' : 'none';
    setLogRecordingMode(nextMode);
  }, [canChangeLogRecordingMode, logRecordingMode, cardAvailable, cardLogButtonDisabled, setLogRecordingMode]);

  const appLogOperationBlocksStart = !logButtonActive && (
    browserLogExportBusy ||
    browserLogManagementBusy ||
    browserLogPreparedArchive !== null ||
    browserLogNextExportBatch !== null
  );
  const logButtonDisabled = operationBusy ||
    appLogOperationBlocksStart ||
    (logButtonActive
    ? needsDeviceStop && (cardLogOperationBusy || connectionState !== 'connected')
    : isLogRecordingStartBlocked({
      mode: logRecordingMode,
      connectionState,
      cardLogButtonDisabled,
    }));

  const logRecordingModeLabel = LOG_MODE_LABELS[logRecordingMode];

  const logButtonTitle = useMemo(() => {
    if (operationBusy) {
      return logRecordingMode === 'card' ? 'カードログ操作中' : `${logRecordingModeLabel}ログ操作中`;
    }
    if (logButtonActive) {
      if (needsDeviceStop && cardLogOperationBusy) {
        return 'カードログ操作中';
      }
      if (needsDeviceStop && connectionState !== 'connected') {
        return 'BLE接続後にカードログを停止できます';
      }
      return 'ログ記録を停止';
    }
    if (browserLogExportBusy) return 'アプリ内ログのダウンロードを準備中です';
    if (browserLogManagementBusy) return 'アプリ内ログの保存状態を更新中です';
    if (browserLogPreparedArchive) return '準備済みZIPを共有/保存または破棄してください';
    if (browserLogNextExportBatch) return '分割書き出しの次のZIPを保存または終了してください';
    if (connectionState !== 'connected') return 'BLEデバイスを接続するとログ記録を開始できます';
    if (logRecordingMode === 'none') return '保存先を選択してください';
    if (modeUsesCard(logRecordingMode) && cardLogButtonDisabled) {
      return modeUsesBrowser(logRecordingMode)
        ? `${cardLogButtonTitle}。カード内保存を解除するとアプリ内保存だけで記録できます`
        : cardLogButtonTitle;
    }
    return `${logRecordingModeLabel}ログ記録を開始`;
  }, [
    connectionState,
    logButtonActive,
    logRecordingMode,
    logRecordingModeLabel,
    operationBusy,
    browserLogExportBusy,
    browserLogManagementBusy,
    browserLogNextExportBatch,
    browserLogPreparedArchive,
    needsDeviceStop,
    cardLogOperationBusy,
    cardLogButtonDisabled,
    cardLogButtonTitle,
  ]);

  const stopBrowserLogging = useCallback(async () => {
    const writer = writerRef.current;
    if (!writer || !writer.getStatus().active) return;
    setBrowserLogStatus(await writer.stop());
    lastBrowserLogObservedAtRef.current = null;
    nextBrowserLogDueAtRef.current = null;
  }, []);

  const startBrowserLogging = useCallback(async () => {
    const writer = writerRef.current;
    if (!writer || writer.getStatus().active) return;
    lastBrowserLogObservedAtRef.current = null;
    nextBrowserLogDueAtRef.current = null;
    setBrowserLogStatus(await writer.start());
  }, []);

  const toggleLogRecording = useCallback(() => {
    if (logButtonDisabled || (!logButtonActive && connectionState !== 'connected')) return;

    setOperationBusy(true);
    void (async () => {
      try {
        if (logButtonActive) {
          if (browserLogStatus.active) await stopBrowserLogging();
          if (cardLoggingActive) await setCardLoggingOnDevice(false);
          return;
        }

        let browserStarted = false;
        if (modeUsesBrowser(logRecordingMode)) {
          await startBrowserLogging();
          browserStarted = true;
        }
        if (modeUsesCard(logRecordingMode)) {
          try {
            await setCardLoggingOnDevice(true);
          } catch (error) {
            if (browserStarted) await stopBrowserLogging();
            throw error;
          }
        }
      } catch (error) {
        const writer = writerRef.current;
        if (writer) {
          setBrowserLogStatus({
            ...writer.getStatus(),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        setOperationBusy(false);
      }
    })();
  }, [
    logButtonActive,
    logButtonDisabled,
    connectionState,
    logRecordingMode,
    browserLogStatus.active,
    cardLoggingActive,
    setCardLoggingOnDevice,
    startBrowserLogging,
    stopBrowserLogging,
  ]);

  const prepareBrowserLogExportBatch = useCallback((
    sessionId: BrowserLogExportScope,
    batchIndex: number,
    createdAt?: number,
    plan?: BrowserLogExportPlan,
  ) => {
    if (!browserLogStatus.hasExportableData || browserLogStatus.active || browserLogExportBusy || browserLogManagementBusy) return;
    const writer = writerRef.current;
    if (!writer) return;
    const nextBatchToRestore = browserLogNextExportBatch &&
      browserLogNextExportBatch.sessionId === sessionId &&
      browserLogNextExportBatch.batchIndex === batchIndex
      ? browserLogNextExportBatch
      : null;

    setBrowserLogExportBusy(true);
    setBrowserLogExportError(null);
    setBrowserLogExportNotice(null);
    setBrowserLogNextExportBatch(null);
    void writer.prepareExport(sessionId, batchIndex, createdAt, plan ?? null)
      .then((archive) => {
        setBrowserLogPreparedArchive(archive);
        setBrowserLogExportNotice(
          `${archive.sessionCount}件・CSV ${archive.segmentCount}件のZIP${archive.batchCount > 1 ? ` (${archive.batchIndex + 1}/${archive.batchCount})` : ''}を準備しました。「共有/保存」を押してください。`,
        );
        setBrowserLogStatus(writer.getStatus());
      })
      .catch((error: unknown) => {
        if (nextBatchToRestore) setBrowserLogNextExportBatch(nextBatchToRestore);
        setBrowserLogExportError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setBrowserLogExportBusy(false));
  }, [
    browserLogExportBusy,
    browserLogManagementBusy,
    browserLogNextExportBatch,
    browserLogStatus.active,
    browserLogStatus.hasExportableData,
  ]);

  const prepareBrowserLogExport = useCallback((scope?: string | string[]) => {
    prepareBrowserLogExportBatch(scope ?? null, 0);
  }, [prepareBrowserLogExportBatch]);

  const prepareNextBrowserLogExport = useCallback(() => {
    if (!browserLogNextExportBatch) return;
    prepareBrowserLogExportBatch(
      browserLogNextExportBatch.sessionId,
      browserLogNextExportBatch.batchIndex,
      browserLogNextExportBatch.createdAt,
      browserLogNextExportBatch.plan,
    );
  }, [browserLogNextExportBatch, prepareBrowserLogExportBatch]);

  const deliverPreparedBrowserLogExport = useCallback(() => {
    if (!browserLogPreparedArchive || browserLogExportBusy) return;
    const archive = browserLogPreparedArchive;
    setBrowserLogExportBusy(true);
    setBrowserLogExportError(null);
    void deliverBrowserLogArchive(archive.file)
      .then(() => {
        setBrowserLogPreparedArchive(null);
        if (archive.batchIndex + 1 < archive.batchCount) {
          setBrowserLogNextExportBatch({
            sessionId: archive.scopeSessionId,
            batchIndex: archive.batchIndex + 1,
            batchCount: archive.batchCount,
            createdAt: archive.createdAt,
            plan: archive.plan,
          });
          setBrowserLogExportNotice(
            `ZIP ${archive.batchIndex + 1}/${archive.batchCount}を共有/保存しました。次のZIPを準備してください。`,
          );
        } else {
          setBrowserLogNextExportBatch(null);
          setBrowserLogExportNotice('ZIPを共有/保存しました。保存済みログは自動削除されません。');
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setBrowserLogExportNotice('共有をキャンセルしました。ZIPは準備済みなので、もう一度「共有/保存」を押せます。');
          return;
        }
        setBrowserLogExportError(
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? '共有を開始できませんでした。ZIPは準備済みです。「共有/保存」をもう一度押してください。'
            : error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => setBrowserLogExportBusy(false));
  }, [browserLogExportBusy, browserLogPreparedArchive]);

  const discardPreparedBrowserLogExport = useCallback(() => {
    const wasBatchSequence = browserLogNextExportBatch !== null;
    setBrowserLogPreparedArchive(null);
    setBrowserLogNextExportBatch(null);
    setBrowserLogExportNotice(
      wasBatchSequence
        ? '分割ZIPの書き出しを終了しました。保存済みログは残っています。'
        : '準備済みZIPを破棄しました。保存済みログは残っています。',
    );
    setBrowserLogExportError(null);
  }, [browserLogNextExportBatch]);

  const runBrowserLogMaintenance = useCallback((
    operation: 'refresh' | 'delete-all' | string,
    action: (writer: BrowserLogWriter) => Promise<BrowserLogStatus>,
  ) => {
    if (
      browserLogStatus.active ||
      browserLogExportBusy ||
      browserLogManagementBusy ||
      browserLogPreparedArchive !== null ||
      browserLogNextExportBatch !== null
    ) return;
    const writer = writerRef.current;
    if (!writer) return;
    setBrowserLogMaintenanceOperation(operation);
    setBrowserLogMaintenanceError(null);
    void action(writer)
      .then(setBrowserLogStatus)
      .catch((error: unknown) => {
        setBrowserLogMaintenanceError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setBrowserLogMaintenanceOperation(null));
  }, [
    browserLogExportBusy,
    browserLogManagementBusy,
    browserLogNextExportBatch,
    browserLogPreparedArchive,
    browserLogStatus.active,
  ]);

  const refreshBrowserLogs = useCallback(() => {
    runBrowserLogMaintenance('refresh', (writer) => writer.refreshStorage());
  }, [runBrowserLogMaintenance]);

  const deleteBrowserLogSession = useCallback((sessionId: string) => {
    runBrowserLogMaintenance(sessionId, (writer) => writer.deleteSession(sessionId));
  }, [runBrowserLogMaintenance]);

  const deleteAllBrowserLogs = useCallback(() => {
    runBrowserLogMaintenance('delete-all', (writer) => writer.deleteAll());
  }, [runBrowserLogMaintenance]);

  const browserLogExportDisabled =
    browserLogExportBusy ||
    browserLogManagementBusy ||
    browserLogStatus.active ||
    !browserLogStatus.hasExportableData ||
    browserLogPreparedArchive !== null ||
    browserLogNextExportBatch !== null;

  const browserLogExportTitle = browserLogPreparedArchive
    ? '準備済みZIPを共有/保存するか破棄してください'
    : browserLogNextExportBatch
      ? '分割書き出しの次のZIPを準備してください'
    : browserLogStatus.active
    ? 'アプリ内ログ停止後に書き出せます'
    : browserLogStatus.hasExportableData
      ? `保存済みログ${browserLogStatus.storedSessionCount}件をダウンロード`
      : '書き出せるアプリ内ログがありません';

  return {
    logRecordingMode,
    setLogRecordingMode,
    toggleLogRecordingDestination,
    logRecordingModeLabel,
    canChangeLogRecordingMode,
    browserLogIntervalMs,
    setBrowserLogIntervalMs,
    browserLogStatus,
    browserLogExportBusy,
    browserLogExportDisabled,
    browserLogExportTitle,
    browserLogPreparedArchive,
    browserLogNextExportBatch,
    browserLogExportNotice,
    browserLogExportError,
    browserLogMaintenanceOperation,
    browserLogMaintenanceError,
    logButtonActive,
    recordingElapsedLabel,
    recordingDestinations,
    recordingHasError,
    logButtonDisabled,
    logButtonTitle,
    toggleLogRecording,
    prepareBrowserLogExport,
    deliverPreparedBrowserLogExport,
    prepareNextBrowserLogExport,
    discardPreparedBrowserLogExport,
    refreshBrowserLogs,
    deleteBrowserLogSession,
    deleteAllBrowserLogs,
  };
};
