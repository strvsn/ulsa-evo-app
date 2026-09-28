import { useState, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OtaPanel } from './OtaPanel';
import { Stm32FirmwareUpdatePanel } from './Stm32FirmwareUpdatePanel';
import { FirmwareUpdateWizard } from './FirmwareUpdateWizard';
import { firmwareUpdateError } from './firmwareUpdateError';
import { STM32_STATUS_REQUEST_TIMEOUT_MS, STM32_WEB_CONNECTION_REQUEST_TIMEOUT_MS, Stm32WriteStartTimeoutError } from '../../services/ota/stm32OtaTransfer';
import { controlStatus, release, emptyStatus, readyStatus, probedStatus, writingStatus, completeStatus } from '../../../test-support/stm32-update-fixtures';
import type { BLECapabilitiesStatus, OtaControlStatus, Stm32UpdateControlOp } from '../../types/ble';

const mocks = vi.hoisted(() => ({
  downloadStm: vi.fn(), downloadEsp: vi.fn(), readStm: vi.fn(), readEsp: vi.fn(),
  uploadStm: vi.fn(), uploadEsp: vi.fn(), probe: vi.fn(), write: vi.fn(), monitor: vi.fn(),
  join: vi.fn(), remove: vi.fn(), cancel: vi.fn(), control: vi.fn(), native: vi.fn(() => true),
  inspectDemo: vi.fn(), verifyDemo: vi.fn(), claimInitial: vi.fn(), wait: vi.fn(), probeInitial: vi.fn(),
}));
vi.mock('@ionic/react', async () => ({
  ...await vi.importActual('@ionic/react'),
  IonModal: ({ isOpen, children, 'aria-label': label, canDismiss }: {
    isOpen: boolean; children: ReactNode; 'aria-label': string; canDismiss: boolean;
  }) => isOpen ? <div role="dialog" aria-label={label} data-can-dismiss={String(canDismiss)}>{children}</div> : null,
}));
vi.mock('./otaPanelHelpers', async () => ({
  ...await vi.importActual('./otaPanelHelpers'), wait: mocks.wait,
}));
vi.mock('../../services/ota/nativeSoftAp', async () => ({
  ...await vi.importActual('../../services/ota/nativeSoftAp'),
  isNativeSoftApJoinAvailable: mocks.native, connectToEsp32SoftAp: mocks.join,
  connectToInitialSoftApWithTimeout: mocks.join,
  probeInitialPortalFromIos: mocks.probeInitial,
  removeEsp32SoftApConfiguration: mocks.remove,
}));
vi.mock('../../services/ota/stm32FirmwareReleaseCatalog', async () => ({
  ...await vi.importActual('../../services/ota/stm32FirmwareReleaseCatalog'),
  fetchStm32FirmwareReleases: async () => [release], downloadStm32FirmwarePackage: mocks.downloadStm,
}));
vi.mock('../../services/ota/firmwareReleaseCatalog', async () => ({
  ...await vi.importActual('../../services/ota/firmwareReleaseCatalog'),
  fetchEsp32FirmwareReleases: async () => [{ id: 'esp', tagName: 'esp32-fw-v1.0.0-r2', title: 'ESP32 1.0.0', size: 10, latest: true,
    assetName: 'ulsa-evo-esp32-demo-firmware.bin', firmwareSha256: '0'.repeat(64) }],
  downloadEsp32FirmwareRelease: mocks.downloadEsp,
}));
vi.mock('../../services/ota/esp32FirmwareIdentity', async () => ({
  ...await vi.importActual('../../services/ota/esp32FirmwareIdentity'),
  inspectEsp32FirmwareArtifact: mocks.inspectDemo,
  verifyDemoFirmwareArtifact: mocks.verifyDemo,
}));
vi.mock('../../services/ota/initialDemoOta', async () => ({
  ...await vi.importActual('../../services/ota/initialDemoOta'),
  claimInitialDemoSession: mocks.claimInitial,
}));
vi.mock('../../services/ota/stm32OtaTransfer', async () => ({
  ...await vi.importActual('../../services/ota/stm32OtaTransfer'),
  readStm32UpdateHttpStatus: mocks.readStm, uploadStm32FirmwarePackage: mocks.uploadStm,
  probeStm32BootloaderSync: mocks.probe, startStm32FirmwareWrite: mocks.write,
  monitorStm32FirmwareWrite: mocks.monitor, cancelStm32FirmwareUpdate: mocks.cancel,
}));
vi.mock('../../services/ota/esp32OtaTransfer', async () => ({
  ...await vi.importActual('../../services/ota/esp32OtaTransfer'),
  readEsp32OtaHttpStatus: mocks.readEsp, uploadEsp32Firmware: mocks.uploadEsp,
}));

const Panel = ({ target = 'stm32', web = false }: { target?: 'stm32' | 'esp32'; web?: boolean }) => {
  const [status, setStatus] = useState<OtaControlStatus | null>(null);
  const control = async (op: Stm32UpdateControlOp) => {
    const override = await mocks.control(op);
    const next = override ?? { ...controlStatus, lastOp: op };
    setStatus(next);
    return next;
  };
  return target === 'stm32' ? <Stm32FirmwareUpdatePanel isConnected
    capabilitiesStatus={{ stm32UpdateControl: true } as BLECapabilitiesStatus}
    stm32FirmwareVersion={null} stm32UpdateControlStatus={status} stm32UpdateControlBusy={false}
    platformInfo={{ platform: web ? 'web' : 'ios', adapterType: web ? 'WebBluetooth' : 'Capacitor', isSupported: true }}
    onRefreshStm32FirmwareVersion={vi.fn()} onRefreshStm32UpdateControlStatus={async () => undefined}
    onWriteStm32UpdateControl={control} /> : <OtaPanel isConnected capabilitiesStatus={null}
    otaControlStatus={status} otaControlBusy={false}
    platformInfo={{ platform: 'ios', adapterType: 'Capacitor', isSupported: true }}
    onRefreshOtaControlStatus={async () => undefined} onWriteOtaControl={control} />;
};

const prepare = async () => {
  const button = await screen.findByRole('button', { name: '更新を準備' });
  await waitFor(() => expect(button).toBeEnabled());
  await act(async () => { fireEvent.click(button); });
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.downloadStm.mockResolvedValue(new File(['pkg'], release.assetName));
  mocks.downloadEsp.mockResolvedValue(new File(['firmware'], 'firmware.bin'));
  mocks.readStm.mockResolvedValue(emptyStatus);
  mocks.uploadStm.mockImplementation(async () => { mocks.readStm.mockResolvedValue(readyStatus); return readyStatus; });
  mocks.probe.mockImplementation(async () => { mocks.readStm.mockResolvedValue(probedStatus); return probedStatus; });
  mocks.write.mockResolvedValue(writingStatus);
  mocks.monitor.mockImplementation(async ({ onStatus }) => { onStatus(completeStatus); return completeStatus; });
  mocks.join.mockResolvedValue({ connected: true, ssid: controlStatus.ssid });
  mocks.probeInitial.mockResolvedValue({ reachable: false, reason: 'nativeNetworkError', errorCode: -1009 });
  mocks.wait.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(emptyStatus);
  mocks.native.mockReturnValue(true);
  mocks.readEsp.mockResolvedValue({ state: 'ready', portalActive: true, ssid: controlStatus.ssid, updating: false });
  mocks.uploadEsp.mockResolvedValue(undefined);
  const demoIdentity = { profile: 'demo', version: '1.0.0', revision: 2,
    commit: 'a'.repeat(40), dirty: false, sha256: '0'.repeat(64) };
  mocks.inspectDemo.mockResolvedValue(demoIdentity);
  mocks.verifyDemo.mockResolvedValue(demoIdentity);
  mocks.claimInitial.mockResolvedValue({ ssid: 'ULSA-EVO-INITIAL', password: 'ulsa-evo-initial',
    token: 'initial-token', ip: '192.168.4.1', contractVersion: 1, sessionOrigin: 'initial_setup',
    firmwareProfile: 'initial', targetProfile: 'demo', purpose: 'esp32_ota', remainingSeconds: 60 });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const webBrowser = (permissions?: { query: ReturnType<typeof vi.fn> }, android = false) => {
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { userAgent: `${android ? 'Android 15 ' : ''}Chrome/142.0.0.0`,
    bluetooth: {}, language: 'ja-JP', permissions });
};

describe('STM32 Web update workflow', () => {
  it.each([false, true])('requires manual Wi-Fi and an explicit write on Web (Android=%s)', async (android) => {
    webBrowser(undefined, android);
    render(<Panel web />);
    await prepare();
    await screen.findByRole('button', { name: '接続を確認' });
    expect(screen.getByText('ネットワーク名').parentElement).toHaveTextContent(controlStatus.ssid);
    expect(screen.getByText(/この画面を開いたまま、端末のWi-Fi設定/)).toBeInTheDocument();
    expect(mocks.downloadStm.mock.invocationCallOrder[0]).toBeLessThan(mocks.control.mock.invocationCallOrder[0]);
    expect(mocks.join).not.toHaveBeenCalled();
    expect(mocks.uploadStm).not.toHaveBeenCalled();
    fireEvent(window, new Event('focus'));
    expect(mocks.readStm).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '接続を確認' })); });
    const write = await screen.findByRole('button', { name: '更新を開始' });
    expect(mocks.readStm).toHaveBeenNthCalledWith(1, expect.objectContaining({ token: controlStatus.token }), undefined, STM32_WEB_CONNECTION_REQUEST_TIMEOUT_MS);
    expect(mocks.uploadStm).toHaveBeenCalledOnce();
    expect(mocks.probe).toHaveBeenCalledOnce();
    expect(mocks.write).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(write); });
    await screen.findByText('更新が完了しました');
    expect(mocks.write).toHaveBeenCalledOnce();
    expect(mocks.join).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('keeps Wi-Fi credentials and the cached package after connection failure', async () => {
    webBrowser();
    mocks.readStm.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<Panel web />);
    await prepare();
    const connection = await screen.findByRole('button', { name: '接続を確認' });
    await act(async () => { fireEvent.click(connection); });
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('インターネット未接続');
    expect(screen.getByText('ネットワーク名').parentElement).toHaveTextContent(controlStatus.ssid);
    expect(screen.getByText('パスワード').parentElement).toHaveTextContent(controlStatus.password);
    expect(mocks.uploadStm).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '接続を確認' })); });
    await screen.findByRole('button', { name: '更新を開始' });
    fireEvent.click(screen.getByRole('button', { name: '更新画面を閉じる' }));
    const reopen = await screen.findByRole('button', { name: '更新を準備' });
    await act(async () => { fireEvent.click(reopen); });
    await screen.findByRole('button', { name: '更新を開始' });
    expect(mocks.downloadStm).toHaveBeenCalledOnce();
    expect(mocks.control.mock.calls.map(([op]) => op)).toEqual(['preparePortal', 'activatePortal']);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('explains a denied permission and retries only after the user grants it', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'denied' });
    webBrowser({ query });
    render(<Panel web />);
    await prepare();
    const connection = await screen.findByRole('button', { name: '接続を確認' });
    await act(async () => { fireEvent.click(connection); });
    expect(await screen.findByRole('alert')).toHaveTextContent('サイトの設定でアクセスを許可');
    expect(screen.getByText('ネットワーク名').parentElement).toHaveTextContent(controlStatus.ssid);
    expect(mocks.readStm).not.toHaveBeenCalled();
    expect(mocks.uploadStm).not.toHaveBeenCalled();
    query.mockResolvedValue({ state: 'granted' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '接続を確認' })); });
    await screen.findByRole('button', { name: '更新を開始' });
    expect(mocks.readStm).toHaveBeenNthCalledWith(1, expect.objectContaining({ token: controlStatus.token }), undefined, STM32_STATUS_REQUEST_TIMEOUT_MS);
    expect(mocks.downloadStm).toHaveBeenCalledOnce();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('does not transfer or write when the HTTP release binding differs', async () => {
    webBrowser();
    mocks.readStm.mockResolvedValue({ ...emptyStatus, sessionReleaseTag: 'another-release' });
    render(<Panel web />);
    await prepare();
    const connection = await screen.findByRole('button', { name: '接続を確認' });
    await act(async () => { fireEvent.click(connection); });
    expect(await screen.findByRole('alert')).toHaveTextContent('本体と更新データの組み合わせ');
    expect(mocks.uploadStm).not.toHaveBeenCalled();
    expect(mocks.probe).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('observes an ambiguous Web write without resending the destructive request', async () => {
    webBrowser();
    mocks.write.mockRejectedValueOnce(new Stm32WriteStartTimeoutError(10_000));
    render(<Panel web />);
    await prepare();
    const connection = await screen.findByRole('button', { name: '接続を確認' });
    await act(async () => { fireEvent.click(connection); });
    const write = await screen.findByRole('button', { name: '更新を開始' });
    await act(async () => { fireEvent.click(write); });
    expect(await screen.findByRole('alert')).toHaveTextContent('更新が続いている可能性');
    mocks.readStm.mockResolvedValue(writingStatus);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '接続を確認' })); });
    const resume = await screen.findByRole('button', { name: '更新の確認を続ける' });
    await act(async () => { fireEvent.click(resume); });
    await screen.findByText('更新が完了しました');
    expect(mocks.write).toHaveBeenCalledOnce();
    expect(mocks.uploadStm).toHaveBeenCalledOnce();
    expect(mocks.probe).toHaveBeenCalledOnce();
  });
});

describe('One user-facing update workflow', () => {
  it('waits for the user to confirm the white LED before joining Wi-Fi in initial setup', async () => {
    let finishSoftApBoot!: () => void;
    mocks.wait.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSoftApBoot = resolve; }));
    mocks.readEsp.mockResolvedValue({ state: 'ready', portalActive: true, updating: false,
      ssid: 'ULSA-EVO-INITIAL', initialSetup: true, firmwareProfile: 'initial' });
    render(<OtaPanel presentation="initialSetup" isConnected={false} capabilitiesStatus={null}
      otaControlStatus={null} otaControlBusy={false}
      platformInfo={{ platform: 'ios', adapterType: 'Capacitor', isSupported: true }}
      onRefreshOtaControlStatus={vi.fn()} onWriteOtaControl={vi.fn()} />);
    await screen.findByRole('heading', { name: 'アプリ接続にはファームウェア更新が必要です' });
    for (const label of ['評価・開発用デモファームウェア', '動作保証はありません', '保証・補償について', 'オープンソースとして公開']) {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(label) }));
    }
    fireEvent.click(screen.getByText('インストールを始める'));
    await waitFor(() => expect(mocks.downloadEsp).toHaveBeenCalledOnce());
    await screen.findByText('白く点灯したので次へ');
    expect(mocks.join).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('白く点灯したので次へ'));
    await waitFor(() => expect(mocks.wait).toHaveBeenCalledWith(3500));
    expect(mocks.join).not.toHaveBeenCalled();
    await act(async () => { finishSoftApBoot(); });
    await waitFor(() => expect(mocks.join).toHaveBeenCalledOnce());
    const warmupCall = mocks.wait.mock.calls.findIndex(([milliseconds]) => milliseconds === 3500);
    expect(warmupCall).toBeGreaterThanOrEqual(0);
    expect(mocks.wait.mock.invocationCallOrder[warmupCall]).toBeLessThan(mocks.join.mock.invocationCallOrder[0]);
    await screen.findByRole('heading', { name: 'デモファームウェアをインストール' });
  });

  it('shows a bounded Initial Wi-Fi failure and retries without another button hold or BLE', async () => {
    mocks.claimInitial.mockRejectedValue(new Error('network unavailable'));
    mocks.readEsp.mockResolvedValue({ state: 'ready', portalActive: true, updating: false,
      ssid: 'ULSA-EVO-INITIAL', initialSetup: true, firmwareProfile: 'initial' });
    render(<OtaPanel presentation="initialSetup" isConnected={false} capabilitiesStatus={null}
      otaControlStatus={null} otaControlBusy={false}
      platformInfo={{ platform: 'ios', adapterType: 'Capacitor', isSupported: true }}
      onRefreshOtaControlStatus={vi.fn()} onWriteOtaControl={mocks.control} />);
    for (const label of ['評価・開発用デモファームウェア', '動作保証はありません', '保証・補償について', 'オープンソースとして公開']) {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(label) }));
    }
    fireEvent.click(screen.getByText('インストールを始める'));
    fireEvent.click(await screen.findByText('白く点灯したので次へ'));
    expect(await screen.findByRole('alert')).toHaveTextContent('本体の更新ページに到達できません');
    expect(screen.getByRole('alert')).toHaveTextContent('iOS code -1009');
    expect(mocks.probeInitial).toHaveBeenCalledOnce();
    const retry = screen.getByText('接続を再確認');
    mocks.claimInitial.mockResolvedValue({ ssid: 'ULSA-EVO-INITIAL', password: 'ulsa-evo-initial',
      token: 'initial-token', ip: '192.168.4.1', contractVersion: 1, sessionOrigin: 'initial_setup',
      firmwareProfile: 'initial', targetProfile: 'demo', purpose: 'esp32_ota', remainingSeconds: 60 });
    fireEvent.click(retry);
    await screen.findByRole('heading', { name: 'デモファームウェアをインストール' });
    expect(mocks.join).toHaveBeenCalledOnce();
    expect(mocks.control).not.toHaveBeenCalled();
  });

  it('distinguishes native portal reachability from an app-side Initial request failure', async () => {
    mocks.claimInitial.mockRejectedValue(new Error('network unavailable'));
    mocks.probeInitial.mockResolvedValue({ reachable: true, reason: 'portalIdentity', httpStatus: 200 });
    render(<OtaPanel presentation="initialSetup" isConnected={false} capabilitiesStatus={null}
      otaControlStatus={null} otaControlBusy={false}
      platformInfo={{ platform: 'ios', adapterType: 'Capacitor', isSupported: true }}
      onRefreshOtaControlStatus={vi.fn()} onWriteOtaControl={mocks.control} />);
    for (const label of ['評価・開発用デモファームウェア', '動作保証はありません', '保証・補償について', 'オープンソースとして公開']) {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(label) }));
    }
    fireEvent.click(screen.getByText('インストールを始める'));
    fireEvent.click(await screen.findByText('白く点灯したので次へ'));
    expect(await screen.findByRole('alert')).toHaveTextContent('更新ページには到達できますが');
    expect(mocks.probeInitial).toHaveBeenCalledOnce();
  });

  it('preserves a confirmed Initial endpoint mismatch instead of masking it as Wi-Fi failure', async () => {
    mocks.claimInitial.mockRejectedValue(new Error('Initial OTA session取得に失敗しました: HTTP 404'));
    mocks.probeInitial.mockResolvedValue({ reachable: true, reason: 'portalIdentity', httpStatus: 200 });
    render(<OtaPanel presentation="initialSetup" isConnected={false} capabilitiesStatus={null}
      otaControlStatus={null} otaControlBusy={false}
      platformInfo={{ platform: 'ios', adapterType: 'Capacitor', isSupported: true }}
      onRefreshOtaControlStatus={vi.fn()} onWriteOtaControl={mocks.control} />);
    for (const label of ['評価・開発用デモファームウェア', '動作保証はありません', '保証・補償について', 'オープンソースとして公開']) {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(label) }));
    }
    fireEvent.click(screen.getByText('インストールを始める'));
    fireEvent.click(await screen.findByText('白く点灯したので次へ'));
    expect(await screen.findByRole('alert')).toHaveTextContent('初回更新方式に対応していません');
    expect(screen.getByRole('alert')).toHaveTextContent('応答番号 404');
    expect(mocks.claimInitial).toHaveBeenCalledOnce();
  });

  it('retries one transient iOS Wi-Fi join error during Initial setup', async () => {
    mocks.join.mockResolvedValueOnce({ ssid: 'ULSA-EVO-INITIAL', connected: false, reason: 'pending' })
      .mockResolvedValueOnce({ ssid: 'ULSA-EVO-INITIAL', connected: true });
    mocks.readEsp.mockResolvedValue({ state: 'ready', portalActive: true, updating: false,
      ssid: 'ULSA-EVO-INITIAL', initialSetup: true, firmwareProfile: 'initial' });
    render(<OtaPanel presentation="initialSetup" isConnected={false} capabilitiesStatus={null}
      otaControlStatus={null} otaControlBusy={false}
      platformInfo={{ platform: 'ios', adapterType: 'Capacitor', isSupported: true }}
      onRefreshOtaControlStatus={vi.fn()} onWriteOtaControl={mocks.control} />);
    for (const label of ['評価・開発用デモファームウェア', '動作保証はありません', '保証・補償について', 'オープンソースとして公開']) {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(label) }));
    }
    fireEvent.click(screen.getByText('インストールを始める'));
    fireEvent.click(await screen.findByText('白く点灯したので次へ'));
    await screen.findByRole('heading', { name: 'デモファームウェアをインストール' });
    expect(mocks.join).toHaveBeenCalledTimes(2);
    expect(mocks.claimInitial).toHaveBeenCalledOnce();
    expect(mocks.control).not.toHaveBeenCalled();
  });

  it('rejects an earlier completion received when connecting a newly prepared STM32 session', async () => {
    mocks.readStm.mockResolvedValue(completeStatus);
    mocks.uploadStm.mockRejectedValue(new Error('Portal closed after stale completion'));
    render(<Panel />);
    await prepare();
    await screen.findByRole('alert');
    expect(screen.queryByText('更新が完了しました')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('前回の更新完了状態');
    expect(mocks.uploadStm).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.monitor).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('rejects stale completion when manually confirming Wi-Fi, too', async () => {
    mocks.native.mockReturnValue(false);
    mocks.readStm.mockResolvedValue(completeStatus);
    render(<Panel />);
    await prepare();
    fireEvent.click(await screen.findByRole('button', { name: '接続を確認' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('前回の更新完了状態');
    expect(screen.queryByText('更新が完了しました')).not.toBeInTheDocument();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each(['uploadRead', 'uploadResponse', 'probeRead', 'probeResponse', 'writeRead'] as const)(
    'rejects completion at the pre-write boundary %s', async (boundary) => {
      if (boundary === 'uploadRead') mocks.readStm.mockResolvedValueOnce(emptyStatus).mockResolvedValueOnce(completeStatus);
      if (boundary === 'uploadResponse') mocks.uploadStm.mockResolvedValueOnce(completeStatus);
      if (boundary === 'probeRead') mocks.uploadStm.mockImplementationOnce(async () => {
        mocks.readStm.mockResolvedValue(completeStatus);
        return readyStatus;
      });
      if (boundary === 'probeResponse') mocks.probe.mockResolvedValueOnce(completeStatus);
      render(<Panel />);
      await prepare();
      if (boundary === 'writeRead') {
        const write = await screen.findByRole('button', { name: '更新を開始' });
        mocks.readStm.mockResolvedValue(completeStatus);
        fireEvent.click(write);
      }
      await screen.findByRole('alert');
      expect(screen.getByRole('alert')).toHaveTextContent('前回の更新完了状態');
      expect(screen.queryByText('更新が完了しました')).not.toBeInTheDocument();
      expect(mocks.write).not.toHaveBeenCalled();
      expect(mocks.monitor).not.toHaveBeenCalled();
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.downloadStm).toHaveBeenCalledOnce();
    },
  );

  it('completes two distinct STM32 sessions with the same firmware only after each explicit write', async () => {
    let deviceStatus = completeStatus;
    let sessions = 0;
    mocks.control.mockImplementation(async (op) => {
      if (op === 'preparePortal') { sessions += 1; deviceStatus = emptyStatus; }
      return { ...controlStatus, lastOp: op, token: `session-${sessions}` };
    });
    mocks.readStm.mockImplementation(async () => deviceStatus);
    mocks.uploadStm.mockImplementation(async () => { deviceStatus = readyStatus; return deviceStatus; });
    mocks.probe.mockImplementation(async () => { deviceStatus = probedStatus; return deviceStatus; });
    mocks.write.mockImplementation(async () => { deviceStatus = writingStatus; return deviceStatus; });
    mocks.monitor.mockImplementation(async ({ onStatus }) => {
      deviceStatus = completeStatus;
      onStatus(deviceStatus);
      return deviceStatus;
    });
    const panel = render(<Panel key="first" />);
    for (let round = 1; round <= 2; round += 1) {
      if (round === 2) panel.rerender(<Panel key="second" />);
      await prepare();
      const write = await screen.findByRole('button', { name: '更新を開始' });
      expect(screen.queryByText('更新が完了しました')).not.toBeInTheDocument();
      expect(mocks.write).toHaveBeenCalledTimes(round - 1);
      fireEvent.click(write);
      await screen.findByText('更新が完了しました');
      await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(round));
      expect(mocks.write).toHaveBeenCalledTimes(round);
      expect(mocks.monitor).toHaveBeenCalledTimes(round);
    }
    expect(sessions).toBe(2);
  });

  it.each(['esp32', 'stm32'] as const)('starts %s with button instructions and does not claim Wi-Fi connection during preparation', async (target) => {
    let downloaded!: (file: File) => void;
    let prepared!: () => void;
    let joined!: () => void;
    const download = new Promise<File>((resolve) => { downloaded = resolve; });
    const preparation = new Promise<void>((resolve) => { prepared = resolve; });
    const connection = new Promise<void>((resolve) => { joined = resolve; });
    (target === 'stm32' ? mocks.downloadStm : mocks.downloadEsp).mockReturnValueOnce(download);
    mocks.control.mockImplementation(async (op) => { if (op === 'preparePortal') await preparation; });
    mocks.join.mockImplementationOnce(async () => {
      await connection;
      return { connected: true, ssid: controlStatus.ssid };
    });
    render(<Panel target={target} />);
    await prepare();
    expect(screen.getByRole('heading', { name: '更新データを準備しています' })).toBeInTheDocument();
    expect(screen.queryByText('本体に接続しています')).not.toBeInTheDocument();
    await act(async () => { downloaded(new File(['data'], 'firmware.bin')); });
    await waitFor(() => expect(mocks.control).toHaveBeenCalledWith('preparePortal'));
    expect(screen.getByRole('heading', { name: '本体操作の準備中です' })).toBeInTheDocument();
    expect(screen.getByText('本体ボタンはまだ押さずにお待ちください。')).toBeInTheDocument();
    expect(mocks.join).not.toHaveBeenCalled();
    await act(async () => { prepared(); });
    await waitFor(() => expect(mocks.join).toHaveBeenCalledOnce());
    expect(screen.getByRole('heading', { name: '本体に接続しています' })).toBeInTheDocument();
    const wifiInstruction = screen.getByText('iPhoneのWi-Fi接続確認で「接続」を選んでください。');
    expect(wifiInstruction.closest('.firmware-update-footer')).not.toBeNull();
    expect(screen.getByRole('heading', { name: '本体に接続しています' }).parentElement)
      .not.toHaveTextContent('iPhoneのWi-Fi接続確認で「接続」を選んでください。');
    await act(async () => { joined(); });
    await screen.findByRole('button', { name: '更新を開始' });
  });

  it('automatically prepares STM32 and still waits for one explicit write confirmation', async () => {
    render(<Panel />);
    await prepare();
    const write = await screen.findByRole('button', { name: '更新を開始' });
    expect(mocks.downloadStm).toHaveBeenCalledOnce();
    expect(mocks.uploadStm).toHaveBeenCalledOnce();
    expect(mocks.probe).toHaveBeenCalledOnce();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'あとで行う' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更新を中止' })).toBeEnabled();
    expect(screen.queryByText('Packageを転送')).not.toBeInTheDocument();
    expect(screen.queryByText('STM32更新状態')).not.toBeInTheDocument();
    expect(screen.queryByText('転送画面へ進む')).not.toBeInTheDocument();
    fireEvent.click(write);
    fireEvent.click(write);
    await screen.findByText('更新が完了しました');
    expect(mocks.write).toHaveBeenCalledOnce();
    expect(mocks.monitor).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '更新結果を見る' }));
    expect(screen.getByText('更新が完了しました')).toBeInTheDocument();
    expect(mocks.write).toHaveBeenCalledOnce();
  });

  it('stops on a failed download and retries only when requested', async () => {
    mocks.downloadStm.mockRejectedValueOnce(new Error('接続できませんでした'));
    render(<Panel />);
    await prepare();
    await screen.findByRole('alert');
    expect(mocks.downloadStm).toHaveBeenCalledOnce();
    expect(mocks.control).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: '準備をやり直す' }));
    await screen.findByRole('button', { name: '更新を開始' });
    expect(mocks.downloadStm).toHaveBeenCalledTimes(2);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('stops on probe failure and never writes or retries it automatically', async () => {
    mocks.probe.mockResolvedValueOnce({ ...readyStatus, bootloaderSyncOk: false, bootloaderSyncError: 'secure_bad_frame' });
    render(<Panel />);
    await prepare();
    expect(await screen.findByRole('alert')).toHaveTextContent('本体の更新準備を確認できませんでした');
    expect(mocks.probe).toHaveBeenCalledOnce();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '更新を開始' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '準備をやり直す' }));
    await screen.findByRole('button', { name: '更新を開始' });
    expect(mocks.uploadStm).toHaveBeenCalledOnce();
    expect(mocks.probe).toHaveBeenCalledTimes(2);
  });

  it('keeps unknown write outcomes actionable, without issuing another write', async () => {
    mocks.write.mockRejectedValueOnce(new Error('response lost'));
    render(<Panel />);
    await prepare();
    fireEvent.click(await screen.findByRole('button', { name: '更新を開始' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('更新が続いている可能性');
    expect(screen.getByRole('button', { name: '更新画面を閉じる' })).toBeEnabled();
    expect(mocks.write).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: '更新を開始' })).not.toBeInTheDocument();
  });

  it('confirms cancellation in the same wizard and does not write', async () => {
    render(<Panel />);
    await prepare();
    await screen.findByRole('button', { name: '更新を開始' });
    fireEvent.click(screen.getByRole('button', { name: '更新を中止' }));
    await screen.findByText('更新を中止しました');
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '閉じる' })).toBeEnabled();
  });

  it('prepares ESP32 in the same wizard and retains completion without another upload', async () => {
    render(<Panel target="esp32" />);
    await prepare();
    const write = await screen.findByRole('button', { name: '更新を開始' });
    expect(mocks.downloadEsp).toHaveBeenCalledOnce();
    expect(mocks.uploadEsp).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'あとで行う' })).not.toBeInTheDocument();
    fireEvent.click(write);
    fireEvent.click(write);
    await screen.findByText('更新が完了しました');
    expect(mocks.uploadEsp).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '更新結果を見る' }));
    expect(screen.getByText('更新が完了しました')).toBeInTheDocument();
    expect(mocks.uploadEsp).toHaveBeenCalledOnce();
  });

  it('shows manual Wi-Fi credentials and only continues after a status check', async () => {
    mocks.native.mockReturnValue(false);
    render(<Panel />);
    await prepare();
    await screen.findByText('更新用Wi-Fiに接続');
    expect(screen.getByText(controlStatus.ssid)).toBeInTheDocument();
    expect(screen.getByText(controlStatus.password)).toBeInTheDocument();
    expect(mocks.uploadStm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '接続を確認' }));
    await screen.findByRole('button', { name: '更新を開始' });
    expect(mocks.probe).toHaveBeenCalledOnce();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(['ESP32', 'STM32'] as const)('preserves the white hold cue and three stages for %s', (target) => {
    const { rerender } = render(<FirmwareUpdateWizard isOpen target={target} stage="button" busy buttonReady={false}
      primaryAction={null} onDismiss={vi.fn()} />);
    expect(screen.getByRole('heading', { name: '本体操作の準備中です' })).toBeInTheDocument();
    expect(screen.getByText('本体ボタンはまだ押さずにお待ちください。')).toBeInTheDocument();
    expect(screen.queryByText('白になったら離す')).not.toBeInTheDocument();

    rerender(<FirmwareUpdateWizard isOpen target={target} stage="button" busy buttonReady
      primaryAction={null} onDismiss={vi.fn()} />);
    expect(screen.getByLabelText('待機中はLEDが黄色で点滅し、白に点灯したらボタンを離す')).toBeInTheDocument();
    expect(screen.getByText('黄色点滅')).toBeInTheDocument();
    expect(screen.queryByLabelText('更新LED色の説明')).not.toBeInTheDocument();
    expect(screen.getByText(/約3秒/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-can-dismiss', 'true');
  });

  it.each([
    ['ESP32 OTA Controlの応答が不正です', '本体との接続を確認できませんでした。Wi-Fiの接続先を確認して、もう一度お試しください。'],
    ['本体での許可時間が終了しました', '本体ボタンの受付時間が終了しました。更新準備からやり直してください。'],
    ['Demo firmwareのBLE identityを確認できませんでした', '更新後の本体へ接続できませんでした。本体の再起動を待ってから、接続を確認してください。'],
    ['Initialの更新はiOSアプリ、またはLocal Network Access対応Chromiumで実行してください', 'この端末では更新できません。iPhoneアプリか対応するパソコンのブラウザを使用してください。'],
  ])('replaces internal update wording with an actionable message', (raw, expected) => {
    expect(firmwareUpdateError(raw)).toBe(expected);
  });

  it('keeps the close control available while the update operation is busy', () => {
    const onDismiss = vi.fn();
    render(<FirmwareUpdateWizard isOpen target="ESP32" stage="updating" busy
      primaryAction={null} onDismiss={onDismiss} />);
    const close = screen.getByRole('button', { name: '更新画面を閉じる' });
    expect(close).toBeEnabled();
    expect(screen.getByRole('dialog')).toHaveAttribute('data-can-dismiss', 'true');
    fireEvent.click(close);
    fireEvent.click(close);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it.each(['ESP32', 'STM32'] as const)('allows %s to close at every update stage', (target) => {
    for (const [stage, busy] of [
      ['download', true], ['button', true], ['connection', true], ['manualWifi', false],
      ['checking', true], ['ready', false], ['updating', true], ['complete', false],
      ['canceled', false], ['error', false],
    ] as const) {
      const onDismiss = vi.fn();
      const view = render(<FirmwareUpdateWizard isOpen target={target} stage={stage} busy={busy}
        primaryAction={null} onDismiss={onDismiss} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('data-can-dismiss', 'true');
      fireEvent.click(screen.getByRole('button', { name: '更新画面を閉じる' }));
      expect(onDismiss).toHaveBeenCalledOnce();
      view.unmount();
    }
  });

  it.each(['ESP32', 'STM32'] as const)('shows only a ring during %s preparation, even at 100 percent', (target) => {
    const view = render(<FirmwareUpdateWizard isOpen target={target} stage="checking" busy
      progress={0} primaryAction={null} onDismiss={vi.fn()} />);
    for (const percent of [0, 42, 100]) {
      view.rerender(<FirmwareUpdateWizard isOpen target={target} stage="checking" busy
        progress={percent} primaryAction={null} onDismiss={vi.fn()} />);
      expect(screen.getByRole('heading', { name: '更新の準備をしています' })).toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(document.querySelector('.firmware-update-progress')).toBeNull();
      expect(screen.queryByText(`${percent}%`)).not.toBeInTheDocument();
      expect(screen.getByTestId('firmware-update-progress-ring')).toHaveStyle(`--firmware-progress: ${percent}%`);
      expect(screen.getByTestId('firmware-update-progress-ring')).toHaveAttribute('data-progress-kind', 'measured');
    }
    view.rerender(<FirmwareUpdateWizard isOpen target={target} stage="updating" busy
      progress={42} primaryAction={null} onDismiss={vi.fn()} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('uses measured progress during transfer and keeps a spinner for physical button confirmation', () => {
    const { rerender } = render(<FirmwareUpdateWizard isOpen target="ESP32" stage="updating" busy
      progress={42} primaryAction={null} onDismiss={vi.fn()} />);
    expect(screen.getByTestId('firmware-update-progress-ring')).toHaveStyle('--firmware-progress: 42%');
    expect(screen.getByTestId('firmware-update-progress-ring')).toHaveAttribute('data-progress-kind', 'measured');
    expect(document.querySelectorAll('ion-spinner')).toHaveLength(0);

    rerender(<FirmwareUpdateWizard isOpen target="ESP32" stage="button" busy buttonReady
      connectionPhase="physicalAuth"
      primaryAction={null} onDismiss={vi.fn()} />);
    expect(screen.queryByTestId('firmware-update-progress-ring')).not.toBeInTheDocument();
    expect(document.querySelectorAll('ion-spinner')).toHaveLength(1);
  });

  it.each([
    { stage: 'download', phase: 'idle', autoJoin: true },
    { stage: 'button', phase: 'credentials', autoJoin: true },
    { stage: 'connection', phase: 'softAp', autoJoin: true },
    { stage: 'connection', phase: 'wifi', autoJoin: true },
    { stage: 'checking', phase: 'done', autoJoin: true },
    { stage: 'updating', phase: 'done', autoJoin: true },
  ] as const)('shows estimated progress during $stage / $phase', ({ stage, phase, autoJoin }) => {
    render(<FirmwareUpdateWizard isOpen target="STM32" stage={stage} busy
      buttonReady={false} connectionPhase={phase} autoJoinAvailable={autoJoin}
      primaryAction={null} onDismiss={vi.fn()} />);
    expect(screen.getByTestId('firmware-update-progress-ring')).toHaveAttribute('data-progress-kind', 'estimated');
    expect(document.querySelectorAll('ion-spinner')).toHaveLength(0);
  });

  it.each([
    { stage: 'connection', phase: 'iosPrompt', autoJoin: true },
    { stage: 'connection', phase: 'wifi', autoJoin: false },
  ] as const)('keeps the spinner for user-controlled $phase waits', ({ stage, phase, autoJoin }) => {
    render(<FirmwareUpdateWizard isOpen target="ESP32" stage={stage} busy
      connectionPhase={phase} autoJoinAvailable={autoJoin}
      primaryAction={null} onDismiss={vi.fn()} />);
    expect(screen.queryByTestId('firmware-update-progress-ring')).not.toBeInTheDocument();
    expect(document.querySelectorAll('ion-spinner')).toHaveLength(1);
  });

  it('uses the Wi-Fi countdown without displaying seconds', () => {
    render(<FirmwareUpdateWizard isOpen target="ESP32" stage="connection" busy
      connectionPhase="wifi" connectionRemainingSeconds={9} autoJoinAvailable
      primaryAction={null} onDismiss={vi.fn()} />);
    expect(screen.getByTestId('firmware-update-progress-ring')).toHaveStyle('--firmware-progress: 50%');
    expect(screen.queryByText(/残り\s*9秒/)).not.toBeInTheDocument();
  });

  it('advances an estimated ring by elapsed time without showing premature completion', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<FirmwareUpdateWizard isOpen target="ESP32" stage="download" busy
        primaryAction={null} onDismiss={vi.fn()} />);
      expect(screen.getByTestId('firmware-update-progress-ring')).toHaveStyle('--firmware-progress: 0%');
      act(() => { vi.advanceTimersByTime(5_000); });
      expect(screen.getByTestId('firmware-update-progress-ring')).toHaveStyle('--firmware-progress: 25%');
      act(() => { vi.advanceTimersByTime(30_000); });
      expect(screen.getByTestId('firmware-update-progress-ring')).toHaveStyle('--firmware-progress: 95%');
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts the ring at 12 o’clock and fills clockwise', () => {
    const styles = readFileSync('src/components/ble-settings/styles/firmware-update-wizard.css', 'utf8');
    expect(styles).toContain('conic-gradient(from 0deg, #006c8f var(--firmware-progress), #d6e1e7 0)');
    expect(styles).not.toContain('transform: rotate(-90deg)');
  });

  it('continues preparation after the user hides the ESP32 update dialog', async () => {
    let finishDownload!: (file: File) => void;
    mocks.downloadEsp.mockReturnValueOnce(new Promise<File>((resolve) => { finishDownload = resolve; }));
    render(<Panel target="esp32" />);
    await prepare();
    expect(screen.getByRole('heading', { name: '更新データを準備しています' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '更新画面を閉じる' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await act(async () => { finishDownload(new File(['firmware'], 'firmware.bin')); });
    await waitFor(() => expect(mocks.control).toHaveBeenCalledWith('preparePortal'));
    await waitFor(() => expect(mocks.join).toHaveBeenCalledOnce());
    const reopen = await screen.findByRole('button', { name: '更新を準備' });
    await waitFor(() => expect(reopen).toBeEnabled());
    fireEvent.click(reopen);
    await screen.findByRole('button', { name: '更新を開始' });
    expect(mocks.downloadEsp).toHaveBeenCalledOnce();
  });

  it('exposes real transfer progress and keeps the action footer busy', async () => {
    let finish!: () => void;
    mocks.uploadEsp.mockImplementation(async (_session, _file, onProgress) => {
      onProgress({ loaded: 42, total: 100, percent: 42 });
      await new Promise<void>((resolve) => { finish = resolve; });
    });
    render(<Panel target="esp32" />);
    await prepare();
    fireEvent.click(await screen.findByRole('button', { name: '更新を開始' }));
    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    const close = screen.getByRole('button', { name: '更新画面を閉じる' });
    expect(close).toBeEnabled();
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => { finish(); });
    fireEvent.click(await screen.findByRole('button', { name: '更新結果を見る' }));
    await screen.findByText('更新が完了しました');
  });

  it('shows STM32 progress until the monitored write actually completes', async () => {
    let acknowledge!: () => void;
    let report!: (percent: number) => void;
    let finish!: () => void;
    mocks.write.mockImplementation(async () => {
      await new Promise<void>((resolve) => { acknowledge = resolve; });
      return { ...writingStatus, progress: 0, writtenBytes: 0, writeStartPending: true };
    });
    mocks.monitor.mockImplementation(async ({ onStatus }) => {
      report = (percent) => onStatus({ ...writingStatus, progress: percent });
      await new Promise<void>((resolve) => { finish = resolve; });
      onStatus(completeStatus);
      return completeStatus;
    });
    render(<Panel />);
    await prepare();
    fireEvent.click(await screen.findByRole('button', { name: '更新を開始' }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    expect(screen.getByRole('heading', { name: '更新しています' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByText('更新が完了しました')).not.toBeInTheDocument();
    await act(async () => { acknowledge(); });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    for (const percent of [17, 42, 73]) {
      await act(async () => { report(percent); });
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(percent));
      expect(screen.getByText(`${percent}%`)).toBeInTheDocument();
      expect(screen.queryByText('更新が完了しました')).not.toBeInTheDocument();
    }
    await act(async () => { finish(); });
    await screen.findByText('更新が完了しました');
    expect(mocks.write).toHaveBeenCalledOnce();
  });
});
