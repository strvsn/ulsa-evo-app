import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BLECapabilitiesStatus,
  Stm32UpdateControlOp,
  Stm32UpdateControlSessionBinding,
  Stm32UpdateControlStatus,
} from '../../types/ble';
import type { Stm32FirmwareReleaseOption } from '../../services/ota/stm32FirmwareReleaseCatalog';
import {
  Stm32CancelTimeoutError,
  Stm32SyncProbeRejectedError,
  Stm32SyncProbeTimeoutError,
  Stm32WriteStartTimeoutError,
  type Stm32UpdateHttpStatus,
} from '../../services/ota/stm32OtaTransfer';
import { Stm32FirmwareUpdatePanel } from './Stm32FirmwareUpdatePanel';
// Exercise protocol guards independently of the automatic preparation UI.
vi.mock('./Stm32FirmwareUpdatePanelView', () => import('../../../test-support/Stm32PanelControllerHarness'));

const mocks = vi.hoisted(() => ({
  cancelUpdate: vi.fn(),
  connectSoftAp: vi.fn(),
  downloadPackage: vi.fn(),
  fetchReleases: vi.fn(),
  monitorWrite: vi.fn(),
  nativeJoinAvailable: vi.fn(() => true),
  probeSync: vi.fn(),
  removeSoftApConfiguration: vi.fn(),
  startWrite: vi.fn(),
  uploadPackage: vi.fn(),
}));

vi.mock('../../services/ota/stm32FirmwareReleaseCatalog', async () => {
  const actual = await vi.importActual<typeof import('../../services/ota/stm32FirmwareReleaseCatalog')>(
    '../../services/ota/stm32FirmwareReleaseCatalog'
  );
  return {
    ...actual,
    downloadStm32FirmwarePackage: mocks.downloadPackage,
    fetchStm32FirmwareReleases: mocks.fetchReleases,
  };
});

vi.mock('../../services/ota/nativeSoftAp', async () => {
  const actual = await vi.importActual<typeof import('../../services/ota/nativeSoftAp')>(
    '../../services/ota/nativeSoftAp'
  );
  return {
    ...actual,
    connectToEsp32SoftAp: mocks.connectSoftAp,
    isNativeSoftApJoinAvailable: mocks.nativeJoinAvailable,
    removeEsp32SoftApConfiguration: mocks.removeSoftApConfiguration,
  };
});

vi.mock('../../services/ota/stm32OtaTransfer', async () => {
  const actual = await vi.importActual<typeof import('../../services/ota/stm32OtaTransfer')>(
    '../../services/ota/stm32OtaTransfer'
  );
  return {
    ...actual,
    cancelStm32FirmwareUpdate: mocks.cancelUpdate,
    monitorStm32FirmwareWrite: mocks.monitorWrite,
    probeStm32BootloaderSync: mocks.probeSync,
    startStm32FirmwareWrite: mocks.startWrite,
    uploadStm32FirmwarePackage: mocks.uploadPackage,
  };
});

const release: Stm32FirmwareReleaseOption = {
  id: 'release-1',
  tagName: 'stm32-1.0.0-field.1',
  title: 'STM32 1.0.0',
  publishedAt: '2026-09-03T00:00:00Z',
  assetName: 'ULSA_EVO_STM32_F411-1.0.0-stm32-1.0.0-field.1-field-preserve.ulsa-stm32pkg',
  target: 'ULSA_EVO_STM32_F411',
  version: '1.0.0',
  releaseTag: 'stm32-1.0.0-field.1',
  buildProfile: 'field',
  rdpPolicy: 'preserve',
  requiresAdmin: false,
  size: 3,
  packageSha256: 'a'.repeat(64),
  downloadUrl: '/api/stm32-firmware/download',
  downloadTokenUrl: '/api/stm32-firmware/download-token',
  latest: true,
};

const controlStatus = {
  protocolVersion: 3,
  lastOpCode: 0,
  lastOp: 'read',
  resultCode: 0,
  result: 'ok',
  stateCode: 3,
  progress: 0,
  flags: 0,
  portalActive: true,
  updating: false,
  hasCredentials: true,
  error: false,
  uploadedBytes: 0,
  totalBytes: 0,
  remainingSeconds: 240,
  nodeId: 7,
  ssid: 'ULSA-EVO-OTA-7',
  password: 'password',
  token: 'token',
  ip: '192.168.4.1',
} satisfies Stm32UpdateControlStatus;

const readyStatus: Stm32UpdateHttpStatus = {
  phase: 'ready_to_write',
  packageReady: true,
  canCancel: true,
  canWrite: true,
  scratchBytes: 3,
  totalBytes: 3,
  packageBytes: 3,
  packageSha256: release.packageSha256,
  writtenBytes: 0,
  verifiedBytes: 3,
  progress: 100,
  nodeId: 7,
  target: release.target,
  version: release.version,
  releaseTag: release.releaseTag,
  buildProfile: release.buildProfile,
  rdpPolicy: release.rdpPolicy,
  payloadBytes: 3,
  firmwareBytes: 3,
  bootloaderSyncOk: null,
  bootloaderSyncAttempts: 0,
  bootloaderSyncResponse: 0,
  bootloaderSyncError: null,
  bootloaderSessionActive: false,
  sessionBound: true,
  sessionExpectedNodeId: 7,
  sessionTarget: release.target,
  sessionReleaseTag: release.releaseTag,
  error: null,
};

const emptyStatus: Stm32UpdateHttpStatus = {
  ...readyStatus,
  phase: 'idle',
  packageReady: false,
  canWrite: false,
  packageBytes: 0,
  packageSha256: null,
  verifiedBytes: 0,
  progress: 0,
};

const probedStatus: Stm32UpdateHttpStatus = {
  ...readyStatus,
  bootloaderSyncOk: true,
  bootloaderSyncAttempts: 1,
};

const failedProbeStatus: Stm32UpdateHttpStatus = {
  ...readyStatus,
  bootloaderSyncOk: false,
  bootloaderSyncAttempts: 5,
  bootloaderSyncError: 'secure_loader_hello_timeout',
};

const writingStatus: Stm32UpdateHttpStatus = {
  ...probedStatus,
  phase: 'writing',
  canCancel: false,
  canWrite: false,
  progress: 73,
  writtenBytes: 2,
  bootloaderSessionActive: true,
};

const completeStatus: Stm32UpdateHttpStatus = {
  ...writingStatus,
  phase: 'complete',
  packageReady: false,
  packageBytes: 0,
  packageSha256: null,
  progress: 100,
  writtenBytes: 3,
  verifiedBytes: 3,
  bootloaderSessionActive: false,
  postWriteVersionMatchesPackage: true,
  currentFirmwareVersionRaw: 100,
};

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const getStatusDetailValue = (label: string): HTMLElement | null =>
  screen.getByText(label).parentElement?.querySelector('dd') ?? null;

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

type PanelOverrides = {
  isConnected?: boolean;
  capabilitiesStatus?: BLECapabilitiesStatus | null;
  controlStatus?: Stm32UpdateControlStatus | null;
  onWriteStm32UpdateControl?: (
    op: Stm32UpdateControlOp,
    binding?: Stm32UpdateControlSessionBinding,
  ) => Promise<Stm32UpdateControlStatus | null>;
};

const createPanel = ({
  isConnected = true,
  capabilitiesStatus = { stm32UpdateControl: true } as BLECapabilitiesStatus,
  controlStatus: currentControlStatus = controlStatus,
  onWriteStm32UpdateControl = vi.fn(async () => controlStatus),
}: PanelOverrides = {}) => (
  <Stm32FirmwareUpdatePanel
    isConnected={isConnected}
    capabilitiesStatus={capabilitiesStatus}
    stm32FirmwareVersion={null}
    stm32UpdateControlStatus={currentControlStatus}
    stm32UpdateControlBusy={false}
    observedBleNodeId={7}
    platformInfo={{ platform: 'ios', adapterType: 'Capacitor', isSupported: true }}
    onRefreshStm32FirmwareVersion={vi.fn()}
    onRefreshStm32UpdateControlStatus={vi.fn(async () => undefined)}
    onWriteStm32UpdateControl={onWriteStm32UpdateControl}
  />
);

const renderPanel = (overrides: PanelOverrides = {}) => render(createPanel(overrides));

describe('Stm32FirmwareUpdatePanel timeout and reattachment recovery', () => {
  beforeEach(() => {
    mocks.fetchReleases.mockResolvedValue([release]);
    mocks.downloadPackage.mockResolvedValue(new File(['pkg'], release.assetName));
    mocks.connectSoftAp.mockResolvedValue({
      ssid: controlStatus.ssid,
      connected: true,
      reason: 'connected',
    });
    mocks.cancelUpdate.mockResolvedValue(emptyStatus);
    mocks.removeSoftApConfiguration.mockResolvedValue(undefined);
    mocks.monitorWrite.mockImplementation(async ({ onStatus }) => {
      onStatus?.(completeStatus);
      return completeStatus;
    });
    mocks.nativeJoinAvailable.mockReturnValue(true);
    mocks.probeSync.mockResolvedValue(probedStatus);
    mocks.startWrite.mockResolvedValue(writingStatus);
    mocks.uploadPackage.mockResolvedValue(readyStatus);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows package and connection prerequisites without a false Node mismatch before session creation', async () => {
    renderPanel({ controlStatus: null });

    expect(await screen.findByText('Package取得後に有効')).toBeInTheDocument();
    const download = screen.getByRole('button', { name: /Packageを取得/ });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);

    expect(await screen.findByText('接続待機')).toBeInTheDocument();
    expect(screen.queryByText(/Node ID不一致/)).not.toBeInTheDocument();
    expect(mocks.downloadPackage).toHaveBeenCalledWith(release);
  });

  it('keeps the optional Node label on the legacy wire field without using it as a gate', async () => {
    mocks.nativeJoinAvailable.mockReturnValue(false);
    const onWriteStm32UpdateControl = vi.fn(async (op: Stm32UpdateControlOp) => ({
      ...controlStatus,
      lastOpCode: op === 'preparePortal' ? 1 : 2,
      lastOp: op,
      portalActive: op === 'activatePortal',
    }));
    const noSessionStatus: Stm32UpdateControlStatus = {
      ...controlStatus,
      portalActive: false,
      hasCredentials: false,
      ssid: '',
      password: '',
      token: '',
      ip: '',
    };
    renderPanel({ controlStatus: noSessionStatus, onWriteStm32UpdateControl });

    const download = await screen.findByRole('button', { name: /Packageを取得/ });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await screen.findByText('1 KB 取得済み');
    fireEvent.click(screen.getByRole('button', { name: /STM32用Wi-Fiを開始/ }));

    await waitFor(() => expect(onWriteStm32UpdateControl).toHaveBeenCalledTimes(2));
    expect(onWriteStm32UpdateControl).toHaveBeenNthCalledWith(1, 'preparePortal', {
      target: release.target,
      releaseTag: release.releaseTag,
      expectedNodeId: 7,
    });
    expect(onWriteStm32UpdateControl).toHaveBeenNthCalledWith(2, 'activatePortal');
  });

  it('prevents same-tick duplicate Step 2 prepare requests', async () => {
    mocks.nativeJoinAvailable.mockReturnValue(false);
    const deferredPrepare = createDeferred<Stm32UpdateControlStatus>();
    const onWriteStm32UpdateControl = vi.fn((op: Stm32UpdateControlOp) =>
      op === 'preparePortal' ? deferredPrepare.promise : Promise.resolve(controlStatus)
    );
    renderPanel({ onWriteStm32UpdateControl });

    fireEvent.click(await screen.findByRole('button', { name: /Packageを取得/ }));
    await screen.findByText('1 KB 取得済み');
    const start = screen.getByRole('button', { name: /STM32用Wi-Fiを開始/ });
    fireEvent.click(start);
    fireEvent.click(start);
    expect(onWriteStm32UpdateControl).toHaveBeenCalledOnce();

    await act(async () => deferredPrepare.resolve(controlStatus));
    await waitFor(() => expect(onWriteStm32UpdateControl).toHaveBeenCalledTimes(2));
  });

  it('accepts a native join error only when the token-bound STM32 status is reachable', async () => {
    mocks.connectSoftAp.mockResolvedValueOnce({
      ssid: controlStatus.ssid,
      connected: false,
      reason: 'systemConfiguration',
      errorDomain: 'NEHotspotConfigurationErrorDomain',
      errorCode: 10,
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) return jsonResponse(emptyStatus);
      throw new Error(`unexpected URL: ${url}`);
    }));
    const onWriteStm32UpdateControl = vi.fn(async (op: Stm32UpdateControlOp) => ({
      ...controlStatus,
      lastOp: op,
      portalActive: op === 'activatePortal',
    }));
    renderPanel({ onWriteStm32UpdateControl });

    const download = await screen.findByRole('button', { name: /Packageを取得/ });
    fireEvent.click(download);
    await screen.findByText('1 KB 取得済み');
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /STM32用Wi-Fiに接続/ }));
    await act(async () => vi.advanceTimersByTimeAsync(3500));
    vi.useRealTimers();

    expect(await screen.findByText(/token付きSTM32 statusで更新用Wi-Fi接続を確認しました/)).toBeInTheDocument();
    expect(mocks.connectSoftAp).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /Packageを転送/ })).toBeEnabled();
  });

  it('retries a transient native join error at most once and does not retry user denial', async () => {
    mocks.connectSoftAp
      .mockResolvedValueOnce({
        ssid: controlStatus.ssid,
        connected: false,
        reason: 'pending',
        errorCode: 9,
      })
      .mockResolvedValueOnce({
        ssid: controlStatus.ssid,
        connected: false,
        reason: 'userDenied',
        errorCode: 7,
      });
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    const onWriteStm32UpdateControl = vi.fn(async (op: Stm32UpdateControlOp) => ({
      ...controlStatus,
      lastOp: op,
      portalActive: op === 'activatePortal',
    }));
    renderPanel({ onWriteStm32UpdateControl });

    fireEvent.click(await screen.findByRole('button', { name: /Packageを取得/ }));
    await screen.findByText('1 KB 取得済み');
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /STM32用Wi-Fiに接続/ }));
    await act(async () => vi.advanceTimersByTimeAsync(3500));
    expect(screen.getByText(/同じsessionで1回だけ再試行/)).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(750));
    vi.useRealTimers();

    expect(await screen.findByText(/Wi-Fi接続確認がキャンセルされました/)).toBeInTheDocument();
    expect(mocks.connectSoftAp).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /Packageを転送/ })).toBeDisabled();
  });

  it('allows an explicit same-session Wi-Fi retry after BLE disconnect without repeating prepare', async () => {
    mocks.connectSoftAp.mockResolvedValueOnce({
      ssid: controlStatus.ssid,
      connected: false,
      reason: 'userDenied',
      errorCode: 7,
    });
    const fetchMock = vi.fn<() => Promise<Response>>(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    const onWriteStm32UpdateControl = vi.fn(async (op: Stm32UpdateControlOp) => ({
      ...controlStatus,
      lastOp: op,
      portalActive: op === 'activatePortal',
    }));
    const { rerender } = renderPanel({ onWriteStm32UpdateControl });

    fireEvent.click(await screen.findByRole('button', { name: /Packageを取得/ }));
    await screen.findByText('1 KB 取得済み');
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /STM32用Wi-Fiに接続/ }));
    await act(async () => vi.advanceTimersByTimeAsync(3500));
    vi.useRealTimers();
    expect(await screen.findByText(/Wi-Fi接続確認がキャンセルされました/)).toBeInTheDocument();
    expect(mocks.connectSoftAp).toHaveBeenCalledOnce();

    rerender(createPanel({ isConnected: false, onWriteStm32UpdateControl }));
    const retry = screen.getByRole('button', { name: /STM32用Wi-Fiへ再接続/ });
    expect(retry).toBeEnabled();
    mocks.connectSoftAp.mockResolvedValueOnce({
      ssid: controlStatus.ssid,
      connected: true,
      reason: 'connected',
    });
    fetchMock.mockImplementationOnce(async () => jsonResponse(emptyStatus));
    fireEvent.click(retry);

    expect(await screen.findByText('更新用Wi-Fi接続を確認しました')).toBeInTheDocument();
    expect(mocks.connectSoftAp).toHaveBeenCalledTimes(2);
    expect(onWriteStm32UpdateControl).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /Packageを転送/ })).toBeEnabled();
  });

  it('rejoins a matching recovery session after BLE capability disappears without preparing or uploading again', async () => {
    const recoveryStatus: Stm32UpdateHttpStatus = {
      ...readyStatus,
      phase: 'recovery_required',
      totalBytes: 281_520,
      writtenBytes: 0,
      verifiedBytes: 0,
      writeStartPending: false,
      writerStackMinFreeBytes: 8_192,
      espResetReason: 8,
      espResetReasonName: 'brownout',
      espBootCount: 4,
      recoveryReason: 'restart_unknown',
      recoveryStage: 'restart_confirming',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) return jsonResponse(recoveryStatus);
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const onWriteStm32UpdateControl = vi.fn(async () => controlStatus);
    renderPanel({
      capabilitiesStatus: { stm32UpdateControl: false } as BLECapabilitiesStatus,
      onWriteStm32UpdateControl,
    });

    const statusRefresh = (await screen.findByText('STM32 status再確認')).closest('ion-button');
    expect(statusRefresh).not.toBeNull();
    fireEvent.click(statusRefresh!);

    const retry = await screen.findByRole('button', { name: /STM32用Wi-Fiへ再接続/ });
    expect(retry).toBeEnabled();
    expect(retry).toHaveTextContent('Wi-Fi接続を再試行/状態確認');
    expect(screen.getByText('Recovery reason')).toBeInTheDocument();
    expect(screen.getByText('restart_unknown')).toBeInTheDocument();
    expect(screen.getByText('Recovery stage')).toBeInTheDocument();
    expect(screen.getByText('restart_confirming')).toBeInTheDocument();
    expect(screen.getAllByText('不明（再起動前の結果未取得）')).toHaveLength(2);
    expect(getStatusDetailValue('ESP reset')).toHaveTextContent('brownout (8)');
    expect(getStatusDetailValue('ESP boot count')).toHaveTextContent('4');
    expect(getStatusDetailValue('Writer stack min free')).toHaveTextContent('8192 bytes');
    fireEvent.click(retry);

    expect(await screen.findByText('更新用Wi-Fi接続を確認しました')).toBeInTheDocument();
    expect(mocks.connectSoftAp).toHaveBeenCalledOnce();
    expect(onWriteStm32UpdateControl).not.toHaveBeenCalled();
    expect(mocks.uploadPackage).not.toHaveBeenCalled();
    expect(mocks.startWrite).not.toHaveBeenCalled();
  });

  it('keeps the recovery rejoin action available when the first native join attempt fails', async () => {
    const recoveryStatus: Stm32UpdateHttpStatus = {
      ...readyStatus,
      phase: 'recovery_required',
    };
    let statusReads = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/stm32/status?')) throw new Error(`unexpected URL: ${url}`);
      statusReads += 1;
      if (statusReads === 1) return jsonResponse(recoveryStatus);
      throw new TypeError('Failed to fetch');
    }));
    mocks.connectSoftAp.mockResolvedValueOnce({
      ssid: controlStatus.ssid,
      connected: false,
      reason: 'userDenied',
      errorCode: 7,
    });
    renderPanel({
      capabilitiesStatus: { stm32UpdateControl: false } as BLECapabilitiesStatus,
    });

    fireEvent.click((await screen.findByText('STM32 status再確認')).closest('ion-button')!);
    const retry = await screen.findByRole('button', { name: /STM32用Wi-Fiへ再接続/ });
    fireEvent.click(retry);

    expect(await screen.findByText(/Wi-Fi接続確認がキャンセルされました/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /STM32用Wi-Fiへ再接続/ })).toBeEnabled();
    expect(screen.getByText('Wi-Fi接続を再試行/状態確認')).toBeInTheDocument();
    expect(mocks.uploadPackage).not.toHaveBeenCalled();
    expect(mocks.startWrite).not.toHaveBeenCalled();
  });

  it('shows placeholders for ESP reset and writer diagnostics from older status responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) return jsonResponse(readyStatus);
      throw new Error(`unexpected URL: ${url}`);
    }));
    renderPanel();

    fireEvent.click((await screen.findByText('STM32 status再確認')).closest('ion-button')!);
    await screen.findByText('ready_to_write');

    expect(getStatusDetailValue('ESP reset')).toHaveTextContent('-');
    expect(getStatusDetailValue('ESP boot count')).toHaveTextContent('-');
    expect(getStatusDetailValue('Writer stack min free')).toHaveTextContent('-');
  });

  it('requires upload and a successful non-destructive probe before explicit write', async () => {
    const statusQueue = [emptyStatus, emptyStatus, readyStatus, probedStatus];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) {
        return Promise.resolve(jsonResponse(statusQueue.shift() ?? probedStatus));
      }
      return Promise.reject(new Error(`unexpected URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    mocks.startWrite.mockRejectedValueOnce(new Stm32WriteStartTimeoutError(10_000));

    renderPanel();

    const download = await screen.findByRole('button', { name: /Packageを取得/ });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await screen.findByText('1 KB 取得済み');

    const statusRefresh = screen.getByText('STM32 status再確認').closest('ion-button');
    expect(statusRefresh).not.toBeNull();
    fireEvent.click(statusRefresh!);
    const transfer = screen.getByRole('button', { name: /Packageを転送/ });
    await waitFor(() => expect(transfer).toBeEnabled());
    expect(screen.getByRole('button', { name: /STM32へ書込み/ })).toBeDisabled();
    fireEvent.click(transfer);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('STM32はまだ消去していません'));
    expect(mocks.uploadPackage).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'token' }),
      expect.any(File),
      expect.any(Function),
      release.packageSha256,
      expect.any(AbortSignal),
    );

    const probe = screen.getByRole('button', { name: /消去せず接続確認/ });
    await waitFor(() => expect(probe).toBeEnabled());
    fireEvent.click(probe);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('非消去確認に成功しました'));
    const write = screen.getByRole('button', { name: /STM32へ書込み/ });
    await waitFor(() => expect(write).toBeEnabled());
    fireEvent.click(write);

    expect(await screen.findByText(/デバイス側の書込み状態は不明です/))
      .toHaveTextContent('取得済みpackageは保持しました');
    expect(mocks.uploadPackage.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.probeSync.mock.invocationCallOrder[0]);
    expect(mocks.probeSync.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.startWrite.mock.invocationCallOrder[0]);
    expect(screen.getByText('1 KB 取得済み')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('STM32 status再確認').closest('ion-button'))
      .not.toHaveAttribute('disabled'));
    expect(screen.getByRole('button', { name: /STM32へ書込み/ })).toBeDisabled();
  });

  it('cleans up join-once Wi-Fi, local state, and the retained session after cancel succeeds', async () => {
    renderPanel();

    const download = await screen.findByRole('button', { name: /Packageを取得/ });
    fireEvent.click(download);
    await screen.findByText('1 KB 取得済み');
    const cancel = screen.getByText('STM32更新を中止').closest('ion-button');
    expect(cancel).not.toBeNull();
    fireEvent.click(cancel!);

    expect(await screen.findByText(/通常のWi-Fiへ戻し、BLEへ再接続してください/)).toBeInTheDocument();
    expect(mocks.removeSoftApConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'token', ssid: controlStatus.ssid })
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /STM32用Wi-Fiに接続/ })).toBeDisabled());
    expect(screen.getByText('未取得')).toBeInTheDocument();
  });

  it('retains local recovery state when a 200 cancel response does not confirm scratch removal', async () => {
    mocks.cancelUpdate.mockResolvedValueOnce(readyStatus);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /Packageを取得/ }));
    await screen.findByText('1 KB 取得済み');
    const cancel = screen.getByText('STM32更新を中止').closest('ion-button');
    expect(cancel).not.toBeNull();
    fireEvent.click(cancel!);

    expect(await screen.findByText(/package消去を確認できませんでした/))
      .toHaveTextContent('中止結果は不明です');
    expect(screen.getByText('1 KB 取得済み')).toBeInTheDocument();
    expect(mocks.removeSoftApConfiguration).not.toHaveBeenCalled();
  });

  it('keeps the local package and restores status reattachment when cancel result is unknown', async () => {
    mocks.cancelUpdate.mockRejectedValueOnce(new Stm32CancelTimeoutError(5_000));
    renderPanel();

    const download = await screen.findByRole('button', { name: /Packageを取得/ });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await screen.findByText('1 KB 取得済み');

    await act(async () => {
      const cancel = screen.getByText('STM32更新を中止').closest('ion-button');
      expect(cancel).not.toBeNull();
      fireEvent.click(cancel!);
      await Promise.resolve();
    });
    expect(mocks.cancelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'token' }),
      expect.any(AbortSignal),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('中止結果は不明です');
    expect(screen.getByRole('alert')).toHaveTextContent('取得済みpackageは保持しました');
    expect(screen.getByRole('alert')).toHaveTextContent('通常BLEが戻った場合');
    expect(screen.getByText('1 KB 取得済み')).toBeInTheDocument();
    expect(mocks.removeSoftApConfiguration).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('STM32 status再確認').closest('ion-button')).not.toHaveAttribute('disabled'));
  });

  it('does not show completion or clear cache for a partial status response', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) {
        return jsonResponse({
          phase: 'complete',
          packageReady: false,
          packageBytes: 0,
          packageSha256: null,
        });
      }
      throw new Error(`unexpected URL: ${url}`);
    }));
    renderPanel();

    const download = await screen.findByRole('button', { name: /Packageを取得/ });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await screen.findByText('1 KB 取得済み');
    fireEvent.click(screen.getByText('STM32 status再確認'));

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid status response');
    expect(screen.getByText('1 KB 取得済み')).toBeInTheDocument();
    expect(screen.queryByText(/完了状態を再取得/)).not.toBeInTheDocument();
  });

  it('keeps explicit write disabled when probe failure is returned in bootloaderSyncError', async () => {
    mocks.probeSync.mockRejectedValueOnce(new Stm32SyncProbeRejectedError(failedProbeStatus));
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) return jsonResponse(readyStatus);
      throw new Error(`unexpected URL: ${url}`);
    }));
    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを取得/ })).toBeEnabled());
    fireEvent.click(screen.getByText('STM32 status再確認'));
    const probe = screen.getByRole('button', { name: /消去せず接続確認/ });
    await waitFor(() => expect(probe).toBeEnabled());
    fireEvent.click(probe);

    expect(await screen.findByRole('alert')).toHaveTextContent('secure_loader_hello_timeout');
    expect(screen.getByRole('button', { name: /STM32へ書込み/ })).toBeDisabled();
    expect(mocks.startWrite).not.toHaveBeenCalled();
  });

  it('invalidates probe proof after a 30-second probe timeout', async () => {
    mocks.probeSync.mockRejectedValueOnce(new Stm32SyncProbeTimeoutError(30_000));
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) return jsonResponse(readyStatus);
      throw new Error(`unexpected URL: ${url}`);
    }));
    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを取得/ })).toBeEnabled());
    fireEvent.click(screen.getByText('STM32 status再確認'));
    const probe = screen.getByRole('button', { name: /消去せず接続確認/ });
    await waitFor(() => expect(probe).toBeEnabled());
    fireEvent.click(probe);

    expect(await screen.findByRole('alert')).toHaveTextContent('30秒でタイムアウト');
    expect(screen.getByRole('button', { name: /STM32へ書込み/ })).toBeDisabled();
    await waitFor(() => expect(screen.getByText('STM32 status再確認').closest('ion-button'))
      .not.toHaveAttribute('disabled'));
  });

  it('invalidates a successful probe on reload before explicit write', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) return jsonResponse(readyStatus);
      throw new Error(`unexpected URL: ${url}`);
    }));
    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを取得/ })).toBeEnabled());
    fireEvent.click(screen.getByText('STM32 status再確認'));
    const probe = screen.getByRole('button', { name: /消去せず接続確認/ });
    await waitFor(() => expect(probe).toBeEnabled());
    fireEvent.click(probe);
    await waitFor(() => expect(screen.getByRole('button', { name: /STM32へ書込み/ })).toBeEnabled());

    fireEvent.click(screen.getByText('再読込'));
    await waitFor(() => expect(screen.getByRole('button', { name: /STM32へ書込み/ })).toBeDisabled());
    expect(screen.getByText('未確認 / 再確認が必要')).toBeInTheDocument();
  });

  it('keeps a successful probe through the expected BLE disconnect and an arbitrary Node label change', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) return jsonResponse(readyStatus);
      throw new Error(`unexpected URL: ${url}`);
    }));
    const { rerender } = renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを取得/ })).toBeEnabled());
    fireEvent.click(screen.getByText('STM32 status再確認'));
    const probe = screen.getByRole('button', { name: /消去せず接続確認/ });
    await waitFor(() => expect(probe).toBeEnabled());
    fireEvent.click(probe);
    await waitFor(() => expect(screen.getByRole('button', { name: /STM32へ書込み/ })).toBeEnabled());

    rerender(createPanel({
      isConnected: false,
      controlStatus: { ...controlStatus, nodeId: 0 },
    }));
    await waitFor(() => expect(screen.getByRole('button', { name: /STM32へ書込み/ })).toBeEnabled());
    expect(screen.getByText(/Node ID表示が変わっています/)).toHaveTextContent('更新を継続できます');
  });

  it('cannot resurrect probe proof from a delayed response after the purpose session token changes', async () => {
    const deferredProbe = createDeferred<Stm32UpdateHttpStatus>();
    mocks.probeSync.mockReturnValueOnce(deferredProbe.promise);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) return jsonResponse(readyStatus);
      throw new Error(`unexpected URL: ${url}`);
    }));
    const { rerender } = renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを取得/ })).toBeEnabled());
    fireEvent.click(screen.getByText('STM32 status再確認'));
    const probe = screen.getByRole('button', { name: /消去せず接続確認/ });
    await waitFor(() => expect(probe).toBeEnabled());
    fireEvent.click(probe);
    await waitFor(() => expect(mocks.probeSync).toHaveBeenCalledOnce());

    rerender(createPanel({
      controlStatus: { ...controlStatus, token: 'replacement-token' },
    }));
    await act(async () => deferredProbe.resolve(probedStatus));
    expect(screen.queryByText(/非消去確認に成功しました/)).not.toBeInTheDocument();
    rerender(createPanel());
    await waitFor(() => expect(screen.getByRole('button', { name: /STM32へ書込み/ })).toBeDisabled());
  });

  it.each([
    ['package SHA', { ...readyStatus, packageSha256: 'b'.repeat(64) }],
    ['package size', { ...readyStatus, packageBytes: readyStatus.packageBytes + 1 }],
  ])('does not reuse a stored package with mismatched %s', async (_label, mismatchedStatus) => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) return jsonResponse(mismatchedStatus);
      throw new Error(`unexpected URL: ${url}`);
    }));
    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを取得/ })).toBeEnabled());
    fireEvent.click(screen.getByText('STM32 status再確認'));

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを転送/ })).toBeDisabled());
    expect(screen.getByRole('button', { name: /消去せず接続確認/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /STM32へ書込み/ })).toBeDisabled();
  });

  it('rechecks binding and probe success immediately before write', async () => {
    let statusReads = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/stm32/status?')) throw new Error(`unexpected URL: ${url}`);
      statusReads += 1;
      return jsonResponse(statusReads < 3 ? readyStatus : {
        ...probedStatus,
        sessionReleaseTag: 'different-release',
      });
    }));
    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを取得/ })).toBeEnabled());
    fireEvent.click(screen.getByText('STM32 status再確認'));
    const probe = screen.getByRole('button', { name: /消去せず接続確認/ });
    await waitFor(() => expect(probe).toBeEnabled());
    fireEvent.click(probe);
    const write = screen.getByRole('button', { name: /STM32へ書込み/ });
    await waitFor(() => expect(write).toBeEnabled());
    fireEvent.click(write);

    expect(await screen.findByRole('alert')).toHaveTextContent('書込み直前のbinding');
    expect(mocks.startWrite).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /STM32へ書込み/ })).toBeDisabled();
  });

  it('does not send write when binding changes during the pre-write status read', async () => {
    const deferredPreWrite = createDeferred<Response>();
    let statusReads = 0;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/stm32/status?')) return Promise.reject(new Error(`unexpected URL: ${url}`));
      statusReads += 1;
      if (statusReads < 3) return Promise.resolve(jsonResponse(readyStatus));
      return deferredPreWrite.promise;
    }));
    const { rerender } = renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを取得/ })).toBeEnabled());
    fireEvent.click(screen.getByText('STM32 status再確認'));
    const probe = screen.getByRole('button', { name: /消去せず接続確認/ });
    await waitFor(() => expect(probe).toBeEnabled());
    fireEvent.click(probe);
    const write = screen.getByRole('button', { name: /STM32へ書込み/ });
    await waitFor(() => expect(write).toBeEnabled());
    fireEvent.click(write);
    await waitFor(() => expect(statusReads).toBe(3));

    rerender(createPanel({
      controlStatus: { ...controlStatus, token: 'replacement-token' },
    }));
    await act(async () => deferredPreWrite.resolve(jsonResponse(probedStatus)));
    expect(mocks.startWrite).not.toHaveBeenCalled();
  });

  it('keeps unknown-state recovery semantics when binding changes after write starts', async () => {
    const deferredWrite = createDeferred<Stm32UpdateHttpStatus>();
    mocks.startWrite.mockReturnValueOnce(deferredWrite.promise);
    let statusReads = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/stm32/status?')) throw new Error(`unexpected URL: ${url}`);
      statusReads += 1;
      return jsonResponse(statusReads < 3 ? readyStatus : probedStatus);
    }));
    const { rerender } = renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを取得/ })).toBeEnabled());
    fireEvent.click(screen.getByText('STM32 status再確認'));
    const probe = screen.getByRole('button', { name: /消去せず接続確認/ });
    await waitFor(() => expect(probe).toBeEnabled());
    fireEvent.click(probe);
    const write = screen.getByRole('button', { name: /STM32へ書込み/ });
    await waitFor(() => expect(write).toBeEnabled());
    fireEvent.click(write);
    await waitFor(() => expect(mocks.startWrite).toHaveBeenCalledOnce());

    rerender(createPanel({
      controlStatus: { ...controlStatus, token: 'replacement-token' },
    }));
    expect(await screen.findByRole('alert')).toHaveTextContent('デバイス側の状態は不明です');
    expect(screen.getByRole('alert')).toHaveTextContent('STM32 status再確認');
    await act(async () => deferredWrite.resolve(writingStatus));
  });

  it('starts and monitors an explicit write after a fresh matching probe despite the expected BLE disconnect', async () => {
    let statusReads = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/stm32/status?')) throw new Error(`unexpected URL: ${url}`);
      statusReads += 1;
      return jsonResponse(statusReads < 3 ? readyStatus : probedStatus);
    }));
    renderPanel({ isConnected: false });

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを取得/ })).toBeEnabled());
    fireEvent.click(screen.getByText('STM32 status再確認'));
    const probe = screen.getByRole('button', { name: /消去せず接続確認/ });
    await waitFor(() => expect(probe).toBeEnabled());
    fireEvent.click(probe);
    const write = screen.getByRole('button', { name: /STM32へ書込み/ });
    await waitFor(() => expect(write).toBeEnabled());
    fireEvent.click(write);

    await waitFor(() => expect(mocks.startWrite).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.monitorWrite).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('status'))
      .toHaveTextContent('起動後version確認が完了しました'));
    await waitFor(() => expect(mocks.removeSoftApConfiguration).toHaveBeenCalledOnce());
    expect(mocks.removeSoftApConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'token', ssid: controlStatus.ssid })
    );
    expect(getStatusDetailValue('Phase')).toHaveTextContent('complete');
    expect(getStatusDetailValue('SSID')).toHaveTextContent('-');
    expect(screen.getByRole('status')).toHaveTextContent('起動後version確認が完了しました');
    expect(screen.getByText('STM32 status再確認').closest('ion-button'))
      .toHaveAttribute('data-control-interaction', 'disabled');
    expect(mocks.probeSync).toHaveBeenCalledOnce();
    expect(mocks.startWrite).toHaveBeenCalledOnce();
    expect(mocks.monitorWrite).toHaveBeenCalledOnce();
  });

  it('prevents same-tick duplicate package upload actions', async () => {
    const deferredUpload = createDeferred<Stm32UpdateHttpStatus>();
    mocks.uploadPackage.mockReturnValueOnce(deferredUpload.promise);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) return jsonResponse(emptyStatus);
      throw new Error(`unexpected URL: ${url}`);
    }));
    renderPanel({ isConnected: false });

    const download = await screen.findByRole('button', { name: /Packageを取得/ });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);
    await screen.findByText('1 KB 取得済み');
    fireEvent.click(screen.getByText('STM32 status再確認'));
    const transfer = screen.getByRole('button', { name: /Packageを転送/ });
    await waitFor(() => expect(transfer).toBeEnabled());
    fireEvent.click(transfer);
    fireEvent.click(transfer);

    await waitFor(() => expect(mocks.uploadPackage).toHaveBeenCalledOnce());
    await act(async () => deferredUpload.resolve(readyStatus));
  });

  it('prevents same-tick duplicate write POST actions', async () => {
    const deferredPreWrite = createDeferred<Response>();
    let statusReads = 0;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/stm32/status?')) return Promise.reject(new Error(`unexpected URL: ${url}`));
      statusReads += 1;
      if (statusReads < 3) return Promise.resolve(jsonResponse(readyStatus));
      return deferredPreWrite.promise;
    }));
    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを取得/ })).toBeEnabled());
    fireEvent.click(screen.getByText('STM32 status再確認'));
    const probe = screen.getByRole('button', { name: /消去せず接続確認/ });
    await waitFor(() => expect(probe).toBeEnabled());
    fireEvent.click(probe);
    const write = screen.getByRole('button', { name: /STM32へ書込み/ });
    await waitFor(() => expect(write).toBeEnabled());
    fireEvent.click(write);
    fireEvent.click(write);
    await waitFor(() => expect(statusReads).toBe(3));

    await act(async () => deferredPreWrite.resolve(jsonResponse(probedStatus)));
    await waitFor(() => expect(mocks.startWrite).toHaveBeenCalledOnce());
  });

  it('does not accept an old recovery bootloaderSyncOk without a fresh probe', async () => {
    const recoveryStatus: Stm32UpdateHttpStatus = {
      ...probedStatus,
      phase: 'recovery_required',
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) return jsonResponse(recoveryStatus);
      throw new Error(`unexpected URL: ${url}`);
    }));
    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを取得/ })).toBeEnabled());
    fireEvent.click(screen.getByText('STM32 status再確認'));

    await waitFor(() => expect(screen.getByRole('button', { name: /消去せず接続確認/ })).toBeEnabled());
    expect(screen.getByRole('button', { name: /STM32へ書込み/ })).toBeDisabled();
    expect(screen.getByText('未確認 / 再確認が必要')).toBeInTheDocument();
    expect(mocks.startWrite).not.toHaveBeenCalled();
  });

  it('resumes the bounded monitor from a matching nonterminal reattached status without another write', async () => {
    let statusReads = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) {
        statusReads += 1;
        return Promise.resolve(jsonResponse(writingStatus));
      }
      return Promise.reject(new Error(`unexpected URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPanel({ isConnected: false });

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを取得/ })).toBeEnabled());
    const statusRefresh = (await screen.findByText('STM32 status再確認')).closest('ion-button');
    expect(statusRefresh).not.toBeNull();
    fireEvent.click(statusRefresh!);
    await waitFor(() => expect(statusReads).toBe(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /書込み監視を再開/ })).toBeEnabled());
    const resume = screen.getByRole('button', { name: /書込み監視を再開/ });
    expect(screen.getByRole('status')).toHaveTextContent('書込み監視を再開');

    fireEvent.click(resume);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('起動後version確認が完了しました'));
    expect(mocks.monitorWrite).toHaveBeenCalledOnce();
    expect(mocks.uploadPackage).not.toHaveBeenCalled();
    expect(mocks.probeSync).not.toHaveBeenCalled();
    expect(mocks.startWrite).not.toHaveBeenCalled();
  });

  it('treats a pending write start as locked and resumes monitoring without another write POST', async () => {
    const pendingStatus: Stm32UpdateHttpStatus = {
      ...readyStatus,
      phase: 'ready_to_write',
      canWrite: false,
      bootloaderSessionActive: false,
      writeStartPending: true,
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) return jsonResponse(pendingStatus);
      throw new Error(`unexpected URL: ${url}`);
    }));
    renderPanel();

    fireEvent.click((await screen.findByText('STM32 status再確認')).closest('ion-button')!);
    const resume = await screen.findByRole('button', { name: /書込み監視を再開/ });
    expect(resume).toBeEnabled();
    expect(screen.getByText('書込み中断不可')).toBeInTheDocument();
    fireEvent.click(resume);

    await waitFor(() => expect(mocks.monitorWrite).toHaveBeenCalledOnce());
    expect(mocks.monitorWrite).toHaveBeenCalledWith(expect.objectContaining({
      initialStatus: expect.objectContaining({ writeStartPending: true }),
    }));
    expect(mocks.startWrite).not.toHaveBeenCalled();
  });

  it('keeps monitor resume fail-closed when the reattached release binding differs', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stm32/status?')) {
        return Promise.resolve(jsonResponse({
          ...writingStatus,
          sessionReleaseTag: 'different-release',
        }));
      }
      return Promise.reject(new Error(`unexpected URL: ${url}`));
    }));
    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: /Packageを取得/ })).toBeEnabled());
    const statusRefresh = screen.getByText('STM32 status再確認').closest('ion-button');
    expect(statusRefresh).not.toBeNull();
    fireEvent.click(statusRefresh!);

    expect(await screen.findByRole('alert')).toHaveTextContent('sessionまたは選択release');
    expect(screen.queryByRole('button', { name: /書込み監視を再開/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /STM32へ書込み/ })).toBeDisabled();
  });
});
