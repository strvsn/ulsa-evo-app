import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelStm32FirmwareUpdate,
  Stm32CancelTimeoutError,
  Stm32PackageUploadConnectionError,
  Stm32PackageUploadTimeoutError,
  Stm32HttpStatusError,
  monitorStm32FirmwareWrite,
  probeStm32BootloaderSync,
  readStm32UpdateHttpStatus,
  startStm32FirmwareWrite,
  Stm32StatusRequestTimeoutError,
  Stm32SyncProbeResponseError,
  Stm32SyncProbeRejectedError,
  Stm32SyncProbeTimeoutError,
  Stm32StatusResponseError,
  Stm32WriteStartTimeoutError,
  Stm32WriteMonitorError,
  uploadStm32FirmwarePackage,
  type Stm32UpdateHttpStatus,
} from './stm32OtaTransfer';
import type { Esp32OtaSession } from './esp32OtaTransfer';

const session: Esp32OtaSession = {
  ssid: 'ULSA-EVO-OTA-7',
  password: 'pass',
  token: 'token value',
  ip: '192.168.4.1',
  nodeId: 7,
};

const status = (overrides: Partial<Stm32UpdateHttpStatus> = {}): Stm32UpdateHttpStatus => ({
  phase: 'ready_to_write',
  packageReady: true,
  canCancel: true,
  canWrite: true,
  scratchBytes: 1024,
  totalBytes: 1024,
  packageBytes: 1024,
  packageSha256: 'a'.repeat(64),
  writtenBytes: 0,
  verifiedBytes: 1024,
  progress: 100,
  nodeId: 7,
  target: 'ULSA_EVO_STM32_F411',
  version: '20260708',
  releaseTag: 'stm32-fw-test',
  buildProfile: 'debug',
  rdpPolicy: 'none',
  payloadBytes: 924,
  firmwareBytes: 896,
  antiRollback: 1,
  antiRollbackFloor: 2,
  currentFirmwareVersionRaw: 20260708,
  currentFirmwareVersionFloor: 2026070800,
  effectiveAntiRollbackFloor: 2026070800,
  bootloaderSyncOk: null,
  bootloaderSyncAttempts: 0,
  bootloaderSyncResponse: 0,
  bootloaderSyncError: null,
  bootloaderSessionActive: false,
  error: null,
  errorCode: null,
  ...overrides,
});

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = [];

  method = '';
  url = '';
  timeout = 0;
  status = 0;
  responseText = '';
  body: Document | XMLHttpRequestBodyInit | null = null;
  headers = new Map<string, string>();
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: ((event: ProgressEvent) => void) | null = null;
  onerror: ((event: ProgressEvent) => void) | null = null;
  ontimeout: ((event: ProgressEvent) => void) | null = null;
  onabort: ((event: ProgressEvent) => void) | null = null;

  constructor() {
    MockXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  send(body?: Document | XMLHttpRequestBodyInit | null) {
    this.body = body ?? null;
  }

  abort() {
    this.onabort?.({} as ProgressEvent);
  }
}

describe('stm32OtaTransfer', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    MockXMLHttpRequest.instances = [];
  });

  it.each([
    ['status', readStm32UpdateHttpStatus],
    ['write', startStm32FirmwareWrite],
    ['sync-probe', probeStm32BootloaderSync],
    ['cancel', cancelStm32FirmwareUpdate],
  ] as const)('marks the %s request as local-network HTTP', async (endpoint, request) => {
    const fetchMock = vi.fn(async () => jsonResponse(status()));
    vi.stubGlobal('fetch', fetchMock);
    await request(session);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://192.168.4.1/stm32/${endpoint}?token=token%20value`,
      expect.objectContaining({ cache: 'no-store', mode: 'cors', targetAddressSpace: 'local' }),
    );
  });

  it('reads STM32 update status from the ESP32 SoftAP endpoint', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(status({ phase: 'writing' })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await readStm32UpdateHttpStatus(session);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.4.1/stm32/status?token=token%20value',
      expect.objectContaining({ cache: 'no-store', mode: 'cors', targetAddressSpace: 'local' })
    );
    expect(result.phase).toBe('writing');
    expect(result.nodeId).toBe(7);
    expect(result.packageBytes).toBe(1024);
    expect(result.payloadBytes).toBe(924);
    expect(result.firmwareBytes).toBe(896);
  });

  it('accepts pending-write and recovery metadata while preserving corrected firmware counters', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(status({
      phase: 'recovery_required',
      totalBytes: 281_520,
      writtenBytes: 0,
      packageVerifiedBytes: 288_262,
      verifiedBytes: 0,
      writeStartPending: false,
      writerStackMinFreeBytes: 8_192,
      espResetReason: 8,
      espResetReasonName: 'brownout',
      espBootCount: 4,
      recoveryReason: 'restart_unknown',
      recoveryStage: 'restart_confirming',
    }))));

    await expect(readStm32UpdateHttpStatus(session)).resolves.toMatchObject({
      totalBytes: 281_520,
      writtenBytes: 0,
      packageVerifiedBytes: 288_262,
      verifiedBytes: 0,
      writeStartPending: false,
      writerStackMinFreeBytes: 8_192,
      espResetReason: 8,
      espResetReasonName: 'brownout',
      espBootCount: 4,
      recoveryReason: 'restart_unknown',
      recoveryStage: 'restart_confirming',
    });
  });

  it.each([
    ['writeStartPending', 'pending'],
    ['writerStackMinFreeBytes', '8192'],
    ['espResetReason', '8'],
    ['espResetReasonName', 8],
    ['espBootCount', '4'],
    ['recoveryReason', 'unknown_reason'],
    ['recoveryStage', 'unknown_stage'],
    ['errorCode', 7],
    ['sessionBound', 'true'],
    ['sessionExpectedNodeId', '7'],
    ['sessionTarget', 7],
    ['sessionReleaseTag', 7],
    ['antiRollback', '2'],
    ['bootloaderSessionActive', 'true'],
    ['progress', 101],
    ['writtenBytes', -1],
  ])('rejects invalid optional STM32 status field %s', async (field, value) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      ...status(),
      [field]: value,
    })));

    await expect(readStm32UpdateHttpStatus(session))
      .rejects.toBeInstanceOf(Stm32StatusResponseError);
  });

  it('normalizes an AbortError race from a stalled status request to the custom timeout', async () => {
    vi.useFakeTimers();
    const observedRequest: { input?: RequestInfo | URL; init?: RequestInit } = {};
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      observedRequest.input = input;
      observedRequest.init = init;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        }, { once: true });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = readStm32UpdateHttpStatus(session, undefined, 1_000);
    const rejection = expect(result).rejects.toBeInstanceOf(Stm32StatusRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(observedRequest.init?.signal?.aborted).toBe(true);
  });

  it('stops a responsive but nonterminal write monitor at the overall deadline', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => jsonResponse(status({ phase: 'writing' })));
    vi.stubGlobal('fetch', fetchMock);

    const result = monitorStm32FirmwareWrite({
      session,
      initialStatus: status({ phase: 'writing' }),
      requestTimeoutMs: 500,
      overallTimeoutMs: 2_500,
      pollIntervalMs: 1_000,
    });
    const rejection = expect(result).rejects.toMatchObject({
      reason: 'overall_timeout',
      lastStatus: expect.objectContaining({ phase: 'writing' }),
    });
    await vi.advanceTimersByTimeAsync(2_500);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a bounded status timeout with the last recovery context intact', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    const initialStatus = status({ phase: 'verifying_flash', progress: 84 });

    const result = monitorStm32FirmwareWrite({
      session,
      initialStatus,
      requestTimeoutMs: 500,
      overallTimeoutMs: 5_000,
      pollIntervalMs: 1_000,
    });
    const rejection = expect(result).rejects.toBeInstanceOf(Stm32WriteMonitorError);
    await vi.advanceTimersByTimeAsync(1_500);

    await rejection;
    await expect(result).rejects.toMatchObject({
      reason: 'status_timeout',
      lastStatus: initialStatus,
    });
  });

  it('returns an already-terminal recovery status without polling', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const recovery = status({ phase: 'recovery_required', packageReady: true, canWrite: true });

    await expect(monitorStm32FirmwareWrite({ session, initialStatus: recovery }))
      .resolves.toBe(recovery);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts writing with POST and treats HTTP 202 as task-started status', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(status({
      phase: 'writing',
      packageReady: false,
      canCancel: false,
      canWrite: false,
      bootloaderSessionActive: true,
    }), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await startStm32FirmwareWrite(session);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.4.1/stm32/write?token=token%20value',
      expect.objectContaining({ method: 'POST', cache: 'no-store', mode: 'cors' })
    );
    expect(result.bootloaderSessionActive).toBe(true);
  });

  it('preserves a definitive ESP32 rejection instead of classifying it as ambiguous', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(status({
      phase: 'error',
      packageReady: false,
      canWrite: false,
      error: 'stm32_revision_rollback',
      errorCode: 'revision_rollback',
    }), { status: 409 })));

    await expect(readStm32UpdateHttpStatus(session)).rejects.toMatchObject({
      name: 'Stm32HttpStatusError',
      status: expect.objectContaining({ errorCode: 'revision_rollback' }),
      message: 'stm32_revision_rollback',
    } satisfies Partial<Stm32HttpStatusError>);
  });

  it('bounds a write-start POST whose response stops after the device may accept it', async () => {
    vi.useFakeTimers();
    const observedRequest: { init?: RequestInit } = {};
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      observedRequest.init = init;
      return new Promise<Response>(() => undefined);
    }));

    const result = startStm32FirmwareWrite(session, undefined, 10_000);
    const rejection = expect(result).rejects.toBeInstanceOf(Stm32WriteStartTimeoutError);
    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
    expect(observedRequest.init?.method).toBe('POST');
    expect(observedRequest.init?.signal?.aborted).toBe(true);
  });

  it('bounds a cancel POST and aborts the stalled request', async () => {
    vi.useFakeTimers();
    const observedRequest: { init?: RequestInit } = {};
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      observedRequest.init = init;
      return new Promise<Response>(() => undefined);
    }));

    const result = cancelStm32FirmwareUpdate(session, undefined, 5_000);
    const rejection = expect(result).rejects.toBeInstanceOf(Stm32CancelTimeoutError);
    await vi.advanceTimersByTimeAsync(5_000);

    await rejection;
    expect(observedRequest.init?.method).toBe('POST');
    expect(observedRequest.init?.signal?.aborted).toBe(true);
  });

  it('rejects HTTP 409 probe failure while preserving validated status context', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(status({
      bootloaderSyncOk: false,
      bootloaderSyncAttempts: 5,
      bootloaderSyncError: 'sync_timeout',
      error: null,
      errorCode: null,
    }), { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeStm32BootloaderSync(session)).rejects.toMatchObject({
      name: 'Stm32SyncProbeRejectedError',
      status: expect.objectContaining({
        bootloaderSyncOk: false,
        bootloaderSyncError: 'sync_timeout',
        error: null,
      }),
    } satisfies Partial<Stm32SyncProbeRejectedError>);
  });

  it('returns a successful non-destructive sync-probe status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(status({
      bootloaderSyncOk: true,
      bootloaderSyncAttempts: 1,
      bootloaderSyncError: null,
    }))));

    await expect(probeStm32BootloaderSync(session)).resolves.toMatchObject({
      phase: 'ready_to_write',
      bootloaderSyncOk: true,
      bootloaderSyncAttempts: 1,
    });
  });

  it('never treats HTTP 409 as probe success even when the body says sync OK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(status({
      bootloaderSyncOk: true,
      bootloaderSyncAttempts: 1,
      bootloaderSyncError: null,
    }), { status: 409 })));

    await expect(probeStm32BootloaderSync(session))
      .rejects.toBeInstanceOf(Stm32SyncProbeRejectedError);
  });

  it('bounds sync-probe at 30 seconds and aborts the stalled request', async () => {
    vi.useFakeTimers();
    const observedRequest: { init?: RequestInit } = {};
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      observedRequest.init = init;
      return new Promise<Response>(() => undefined);
    }));

    const result = probeStm32BootloaderSync(session, undefined, 30_000);
    const rejection = expect(result).rejects.toBeInstanceOf(Stm32SyncProbeTimeoutError);
    await vi.advanceTimersByTimeAsync(30_000);

    await rejection;
    expect(observedRequest.init?.method).toBe('POST');
    expect(observedRequest.init?.signal?.aborted).toBe(true);
  });

  it.each([
    ['wrong-purpose JSON', jsonResponse({ error: 'wrong_purpose' }, { status: 409 })],
    ['malformed JSON', new Response('{', { status: 409 })],
  ])('rejects %s instead of treating HTTP 409 as a probe status', async (_label, response) => {
    vi.stubGlobal('fetch', vi.fn(async () => response));
    await expect(probeStm32BootloaderSync(session))
      .rejects.toBeInstanceOf(Stm32SyncProbeResponseError);
  });

  it.each([
    ['status', () => readStm32UpdateHttpStatus(session)],
    ['write', () => startStm32FirmwareWrite(session)],
    ['cancel', () => cancelStm32FirmwareUpdate(session)],
  ])('rejects a partial %s response through the shared runtime validator', async (_label, request) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      phase: 'complete',
      packageReady: false,
      packageBytes: 0,
      packageSha256: null,
    })));

    await expect(request()).rejects.toBeInstanceOf(Stm32StatusResponseError);
  });

  it('uploads the package as multipart form data and resolves status JSON', async () => {
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
    const progress = vi.fn();
    const file = new File(['pkg'], 'stm32.ulsa-stm32pkg', {
      type: 'application/octet-stream',
    });

    const resultPromise = uploadStm32FirmwarePackage(session, file, progress, 'a'.repeat(64));
    const xhr = MockXMLHttpRequest.instances[0];
    xhr.upload.onprogress?.({
      lengthComputable: true,
      loaded: 50,
      total: 100,
    } as ProgressEvent);
    xhr.status = 200;
    xhr.responseText = JSON.stringify(status());
    xhr.onload?.({} as ProgressEvent);

    const result = await resultPromise;

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('http://192.168.4.1/stm32/package?token=token%20value');
    expect(xhr.headers.get('X-ULSA-STM32-Package-SHA256')).toBe('a'.repeat(64));
    expect(xhr.body).toBeInstanceOf(FormData);
    expect(progress).toHaveBeenCalledWith({ loaded: 50, total: 100, percent: 50 });
    expect(result.canWrite).toBe(true);
  });

  it('distinguishes ambiguous package upload timeout and connection failures', async () => {
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
    const file = new File(['pkg'], 'stm32.ulsa-stm32pkg');

    const timeoutPromise = uploadStm32FirmwarePackage(session, file);
    MockXMLHttpRequest.instances[0].ontimeout?.({} as ProgressEvent);
    await expect(timeoutPromise).rejects.toBeInstanceOf(Stm32PackageUploadTimeoutError);

    const connectionPromise = uploadStm32FirmwarePackage(session, file);
    MockXMLHttpRequest.instances[1].onerror?.({} as ProgressEvent);
    await expect(connectionPromise).rejects.toBeInstanceOf(Stm32PackageUploadConnectionError);
  });

  it('rejects a partial upload response through the shared runtime validator', async () => {
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
    const result = uploadStm32FirmwarePackage(session, new File(['pkg'], 'stm32.ulsa-stm32pkg'));
    const rejection = expect(result).rejects.toBeInstanceOf(Stm32StatusResponseError);
    const xhr = MockXMLHttpRequest.instances[0];
    xhr.status = 200;
    xhr.responseText = JSON.stringify({ phase: 'complete', packageSha256: null });
    xhr.onload?.({} as ProgressEvent);

    await rejection;
  });

  it('aborts an in-flight upload when the caller signal changes', async () => {
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
    const controller = new AbortController();
    const result = uploadStm32FirmwarePackage(
      session,
      new File(['pkg'], 'stm32.ulsa-stm32pkg'),
      undefined,
      'a'.repeat(64),
      controller.signal,
    );
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();

    await rejection;
  });
});
