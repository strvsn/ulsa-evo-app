import type { Esp32OtaSession } from './esp32OtaTransfer';
import { isStm32UpdateHttpStatus } from './stm32OtaStatusValidator';

export { isStm32UpdateHttpStatus } from './stm32OtaStatusValidator';

export type Stm32UpdatePhase =
  | 'idle'
  | 'receiving'
  | 'package_stored'
  | 'verifying'
  | 'ready_to_write'
  | 'writing'
  | 'verifying_flash'
  | 'restarting'
  | 'complete'
  | 'error'
  | 'recovery_required';

export type Stm32RecoveryReason = 'restart_unknown' | 'write_failed';

export type Stm32RecoveryStage =
  | 'package_verified'
  | 'write_scheduled'
  | 'writer_starting'
  | 'destructive_command_sent'
  | 'firmware_transferred'
  | 'restart_confirming';

export interface Stm32UpdateHttpStatus {
  phase: Stm32UpdatePhase;
  packageReady: boolean;
  canCancel: boolean;
  canWrite: boolean;
  scratchBytes: number;
  totalBytes: number;
  packageBytes: number;
  packageSha256: string | null;
  writtenBytes: number;
  packageVerifiedBytes?: number;
  verifiedBytes: number;
  progress: number;
  nodeId?: number;
  target: string | null;
  version: string | null;
  releaseTag: string | null;
  buildProfile: string | null;
  rdpPolicy: string | null;
  payloadBytes?: number;
  firmwareBytes?: number;
  antiRollback?: number | null;
  antiRollbackFloor?: number;
  currentFirmwareVersionRaw?: number | null;
  currentFirmwareVersionFloor?: number;
  postWriteVersionCheckComplete?: boolean;
  postWriteVersionRead?: boolean;
  postWriteVersionMatchesPackage?: boolean;
  postWriteVersionCheckAttempts?: number;
  effectiveAntiRollbackFloor?: number;
  bootloaderSyncOk?: boolean | null;
  bootloaderSyncAttempts?: number;
  bootloaderSyncResponse?: number;
  bootloaderSyncError?: string | null;
  bootloaderSessionActive?: boolean;
  writeStartPending?: boolean;
  writerStackMinFreeBytes?: number | null;
  espResetReason?: number;
  espResetReasonName?: string;
  espBootCount?: number;
  recoveryReason?: Stm32RecoveryReason | null;
  recoveryStage?: Stm32RecoveryStage | null;
  error: string | null;
  errorCode?: string | null;
  sessionBound?: boolean;
  /** Legacy status echo for maintenance display only; not part of the write authorization binding. */
  sessionExpectedNodeId?: number | null;
  sessionTarget?: string | null;
  sessionReleaseTag?: string | null;
}

export interface Stm32PackageUploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export const STM32_STATUS_REQUEST_TIMEOUT_MS = 2_500;
// The first browser status request can wait for the user to grant LNA permission.
export const STM32_WEB_CONNECTION_REQUEST_TIMEOUT_MS = 30_000;
export const STM32_WRITE_START_TIMEOUT_MS = 10_000;
export const STM32_CANCEL_TIMEOUT_MS = 5_000;
export const STM32_SYNC_PROBE_TIMEOUT_MS = 30_000;
export const STM32_WRITE_MONITOR_TIMEOUT_MS = 240_000;
export const STM32_WRITE_MONITOR_POLL_INTERVAL_MS = 1_000;

export class Stm32StatusRequestTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`STM32 update status timed out after ${timeoutMs} ms`);
    this.name = 'Stm32StatusRequestTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class Stm32WriteStartTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`STM32 update write start timed out after ${timeoutMs} ms`);
    this.name = 'Stm32WriteStartTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class Stm32CancelTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`STM32 update cancel timed out after ${timeoutMs} ms`);
    this.name = 'Stm32CancelTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class Stm32SyncProbeTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`STM32 bootloader sync probe timed out after ${timeoutMs} ms`);
    this.name = 'Stm32SyncProbeTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class Stm32SyncProbeResponseError extends Error {
  readonly httpStatus: number;

  constructor(httpStatus: number) {
    super(`STM32 bootloader sync probe returned an invalid status response: HTTP ${httpStatus}`);
    this.name = 'Stm32SyncProbeResponseError';
    this.httpStatus = httpStatus;
  }
}

export class Stm32StatusResponseError extends Error {
  readonly context: string;
  readonly httpStatus: number;

  constructor(context: string, httpStatus: number) {
    super(`${context} returned an invalid status response: HTTP ${httpStatus}`);
    this.name = 'Stm32StatusResponseError';
    this.context = context;
    this.httpStatus = httpStatus;
  }
}

export class Stm32HttpStatusError extends Error {
  readonly context: string;
  readonly httpStatus: number;
  readonly status: Stm32UpdateHttpStatus;

  constructor(context: string, httpStatus: number, status: Stm32UpdateHttpStatus) {
    super(status.error || status.errorCode || `${context} failed: HTTP ${httpStatus}`);
    this.name = 'Stm32HttpStatusError';
    this.context = context;
    this.httpStatus = httpStatus;
    this.status = status;
  }
}

export class Stm32SyncProbeRejectedError extends Error {
  readonly httpStatus = 409;
  readonly status: Stm32UpdateHttpStatus;

  constructor(status: Stm32UpdateHttpStatus) {
    super(status.bootloaderSyncError || status.error || 'STM32 bootloader sync probe was rejected');
    this.name = 'Stm32SyncProbeRejectedError';
    this.status = status;
  }
}

export class Stm32PackageUploadTimeoutError extends Error {
  constructor() {
    super('STM32 package upload timed out');
    this.name = 'Stm32PackageUploadTimeoutError';
  }
}

export class Stm32PackageUploadConnectionError extends Error {
  constructor() {
    super('STM32 package upload connection error');
    this.name = 'Stm32PackageUploadConnectionError';
  }
}

export const isAmbiguousStm32TransferError = (error: unknown): boolean =>
  error instanceof Stm32WriteMonitorError ||
  error instanceof Stm32StatusRequestTimeoutError ||
  error instanceof Stm32WriteStartTimeoutError ||
  error instanceof Stm32CancelTimeoutError ||
  error instanceof Stm32SyncProbeTimeoutError ||
  error instanceof Stm32StatusResponseError ||
  error instanceof Stm32SyncProbeResponseError ||
  error instanceof Stm32SyncProbeRejectedError ||
  error instanceof Stm32PackageUploadTimeoutError ||
  error instanceof Stm32PackageUploadConnectionError;

export type Stm32WriteMonitorFailureReason =
  | 'overall_timeout'
  | 'status_timeout'
  | 'status_error';

export class Stm32WriteMonitorError extends Error {
  readonly reason: Stm32WriteMonitorFailureReason;
  readonly lastStatus: Stm32UpdateHttpStatus;
  readonly originalError: unknown;

  constructor(
    reason: Stm32WriteMonitorFailureReason,
    lastStatus: Stm32UpdateHttpStatus,
    originalError?: unknown,
  ) {
    super(reason === 'overall_timeout'
      ? 'STM32 write monitor reached its overall deadline'
      : reason === 'status_timeout'
        ? 'STM32 write monitor status request timed out'
        : 'STM32 write monitor status request failed');
    this.name = 'Stm32WriteMonitorError';
    this.reason = reason;
    this.lastStatus = lastStatus;
    this.originalError = originalError;
  }
}

export interface MonitorStm32FirmwareWriteOptions {
  session: Esp32OtaSession;
  initialStatus: Stm32UpdateHttpStatus;
  onStatus?: (status: Stm32UpdateHttpStatus) => void;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  overallTimeoutMs?: number;
  pollIntervalMs?: number;
}

const getBaseUrl = (session: Esp32OtaSession): string =>
  `http://${session.ip || '192.168.4.1'}`;

const getTokenQuery = (session: Esp32OtaSession): string =>
  `token=${encodeURIComponent(session.token)}`;

const LOCAL_FETCH_OPTIONS = {
  cache: 'no-store',
  mode: 'cors',
  targetAddressSpace: 'local',
} as RequestInit & { targetAddressSpace: 'local' };

const parseStm32StatusText = (
  text: string,
  context: string,
  httpStatus: number,
  createInvalidError: () => Error = () => new Stm32StatusResponseError(context, httpStatus),
): Stm32UpdateHttpStatus => {
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw createInvalidError();
  }
  if (!isStm32UpdateHttpStatus(payload)) throw createInvalidError();
  return payload;
};

const parseStm32FetchStatus = async (
  response: Response,
  context: string,
  createInvalidError?: () => Error,
): Promise<Stm32UpdateHttpStatus> => parseStm32StatusText(
  await response.text(), context, response.status, createInvalidError
);

const runWithBoundedAbort = async <T>(
  signal: AbortSignal | undefined,
  timeoutMs: number,
  createTimeoutError: () => Error,
  request: (requestSignal: AbortSignal) => Promise<T>,
): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('STM32 HTTP timeout must be greater than zero');
  }
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = createTimeoutError();
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(timeoutError);
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([request(controller.signal), timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromCaller);
  }
};

export const readStm32UpdateHttpStatus = async (
  session: Esp32OtaSession,
  signal?: AbortSignal,
  timeoutMs = STM32_STATUS_REQUEST_TIMEOUT_MS,
): Promise<Stm32UpdateHttpStatus> =>
  runWithBoundedAbort(
    signal,
    timeoutMs,
    () => new Stm32StatusRequestTimeoutError(timeoutMs),
    async (requestSignal) => {
      const response = await fetch(`${getBaseUrl(session)}/stm32/status?${getTokenQuery(session)}`, {
        ...LOCAL_FETCH_OPTIONS,
        signal: requestSignal,
      });
      const status = await parseStm32FetchStatus(response, 'STM32 update status');
      if (!response.ok) throw new Stm32HttpStatusError('STM32 update status', response.status, status);
      return status;
    },
  );

export const monitorStm32FirmwareWrite = async ({
  session,
  initialStatus,
  onStatus,
  signal,
  requestTimeoutMs = STM32_STATUS_REQUEST_TIMEOUT_MS,
  overallTimeoutMs = STM32_WRITE_MONITOR_TIMEOUT_MS,
  pollIntervalMs = STM32_WRITE_MONITOR_POLL_INTERVAL_MS,
}: MonitorStm32FirmwareWriteOptions): Promise<Stm32UpdateHttpStatus> => {
  if (requestTimeoutMs <= 0 || overallTimeoutMs <= 0 || pollIntervalMs <= 0) {
    throw new RangeError('STM32 write monitor timeouts must be greater than zero');
  }
  const deadline = Date.now() + overallTimeoutMs;
  let latestStatus = initialStatus;
  while (!isTerminalStm32UpdateStatus(latestStatus)) {
    const remainingBeforePoll = deadline - Date.now();
    if (remainingBeforePoll <= 0) {
      throw new Stm32WriteMonitorError('overall_timeout', latestStatus);
    }
    await waitForMonitorPoll(Math.min(pollIntervalMs, remainingBeforePoll), signal);
    const remainingForRequest = deadline - Date.now();
    if (remainingForRequest <= 0) {
      throw new Stm32WriteMonitorError('overall_timeout', latestStatus);
    }
    try {
      latestStatus = await readStm32UpdateHttpStatus(
        session,
        signal,
        Math.min(requestTimeoutMs, remainingForRequest),
      );
    } catch (error) {
      const reason = Date.now() >= deadline
        ? 'overall_timeout'
        : error instanceof Stm32StatusRequestTimeoutError
          ? 'status_timeout'
          : 'status_error';
      throw new Stm32WriteMonitorError(reason, latestStatus, error);
    }
    onStatus?.(latestStatus);
  }
  return latestStatus;
};

const isTerminalStm32UpdateStatus = (status: Stm32UpdateHttpStatus): boolean =>
  status.phase === 'complete' || status.phase === 'error' || status.phase === 'recovery_required';

const waitForMonitorPoll = (durationMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'));
      return;
    }
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', abortWait);
      resolve();
    }, durationMs);
    const abortWait = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortWait);
      reject(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abortWait, { once: true });
  });

export const uploadStm32FirmwarePackage = (
  session: Esp32OtaSession,
  file: File,
  onProgress?: (progress: Stm32PackageUploadProgress) => void,
  expectedPackageSha256?: string,
  signal?: AbortSignal,
): Promise<Stm32UpdateHttpStatus> => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append('package', file, file.name || 'stm32.ulsa-stm32pkg');

  xhr.open('POST', `${getBaseUrl(session)}/stm32/package?${getTokenQuery(session)}`);
  if (expectedPackageSha256) {
    xhr.setRequestHeader('X-ULSA-STM32-Package-SHA256', expectedPackageSha256);
  }
  xhr.timeout = 10 * 60 * 1000;

  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    const percent = Math.round((event.loaded / event.total) * 100);
    onProgress?.({ loaded: event.loaded, total: event.total, percent });
  };

  let settled = false;
  const cleanup = () => signal?.removeEventListener('abort', abortFromCaller);
  const resolveOnce = (status: Stm32UpdateHttpStatus) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve(status);
  };
  const rejectOnce = (error: unknown) => {
    if (settled) return;
    settled = true;
    cleanup();
    reject(error);
  };
  const abortFromCaller = () => {
    rejectOnce(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    xhr.abort();
  };

  xhr.onload = () => {
    try {
      const status = parseStm32StatusText(xhr.responseText, 'STM32 package upload', xhr.status);
      if (xhr.status < 200 || xhr.status >= 300) {
        rejectOnce(new Stm32HttpStatusError('STM32 package upload', xhr.status, status));
        return;
      }
      resolveOnce(status);
    } catch (error) {
      rejectOnce(error);
    }
  };
  xhr.onerror = () => rejectOnce(new Stm32PackageUploadConnectionError());
  xhr.ontimeout = () => rejectOnce(new Stm32PackageUploadTimeoutError());
  xhr.onabort = () => rejectOnce(new DOMException('The operation was aborted', 'AbortError'));
  if (signal?.aborted) {
    abortFromCaller();
    return;
  }
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  xhr.send(formData);
});

export const startStm32FirmwareWrite = async (
  session: Esp32OtaSession,
  signal?: AbortSignal,
  timeoutMs = STM32_WRITE_START_TIMEOUT_MS,
): Promise<Stm32UpdateHttpStatus> =>
  runWithBoundedAbort(
    signal,
    timeoutMs,
    () => new Stm32WriteStartTimeoutError(timeoutMs),
    async (requestSignal) => {
      const response = await fetch(`${getBaseUrl(session)}/stm32/write?${getTokenQuery(session)}`, {
        ...LOCAL_FETCH_OPTIONS,
        method: 'POST',
        signal: requestSignal,
      });
      const status = await parseStm32FetchStatus(response, 'STM32 update write');
      if (!response.ok) throw new Stm32HttpStatusError('STM32 update write', response.status, status);
      return status;
    },
  );

export const probeStm32BootloaderSync = async (
  session: Esp32OtaSession,
  signal?: AbortSignal,
  timeoutMs = STM32_SYNC_PROBE_TIMEOUT_MS,
): Promise<Stm32UpdateHttpStatus> =>
  runWithBoundedAbort(
    signal,
    timeoutMs,
    () => new Stm32SyncProbeTimeoutError(timeoutMs),
    async (requestSignal) => {
      const response = await fetch(`${getBaseUrl(session)}/stm32/sync-probe?${getTokenQuery(session)}`, {
        ...LOCAL_FETCH_OPTIONS,
        method: 'POST',
        signal: requestSignal,
      });
      const status = await parseStm32FetchStatus(
        response,
        'STM32 bootloader sync probe',
        () => new Stm32SyncProbeResponseError(response.status),
      );
      if (response.status === 409) throw new Stm32SyncProbeRejectedError(status);
      if (!response.ok) {
        throw new Stm32HttpStatusError('STM32 bootloader sync probe', response.status, status);
      }
      return status;
    },
  );

export const cancelStm32FirmwareUpdate = async (
  session: Esp32OtaSession,
  signal?: AbortSignal,
  timeoutMs = STM32_CANCEL_TIMEOUT_MS,
): Promise<Stm32UpdateHttpStatus> =>
  runWithBoundedAbort(
    signal,
    timeoutMs,
    () => new Stm32CancelTimeoutError(timeoutMs),
    async (requestSignal) => {
      const response = await fetch(`${getBaseUrl(session)}/stm32/cancel?${getTokenQuery(session)}`, {
        ...LOCAL_FETCH_OPTIONS,
        method: 'POST',
        signal: requestSignal,
      });
      const status = await parseStm32FetchStatus(response, 'STM32 update cancel');
      if (!response.ok) throw new Stm32HttpStatusError('STM32 update cancel', response.status, status);
      return status;
    },
  );
