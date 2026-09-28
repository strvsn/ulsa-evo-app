import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OtaControlStatus } from '../../types/ble';
import type { Esp32OtaHttpStatus } from '../../services/ota/esp32OtaTransfer';
import type { Esp32FirmwareReleaseOption } from '../../services/ota/firmwareReleaseCatalog';
import { OtaPanel } from './OtaPanel';
// Controller regressions retain independent protocol gates; user-flow tests
// exercise the actual unified wizard in FirmwareUpdateFlow.test.tsx.
vi.mock('./OtaPanelView', () => import('../../../test-support/OtaPanelControllerHarness'));

const mocks = vi.hoisted(() => ({
  downloadFirmware: vi.fn(),
  fetchReleases: vi.fn(),
  readStatus: vi.fn(),
  uploadFirmware: vi.fn(),
}));

vi.mock('../../services/ota/firmwareReleaseCatalog', async () => {
  const actual = await vi.importActual<typeof import('../../services/ota/firmwareReleaseCatalog')>(
    '../../services/ota/firmwareReleaseCatalog'
  );
  return {
    ...actual,
    downloadEsp32FirmwareRelease: mocks.downloadFirmware,
    fetchEsp32FirmwareReleases: mocks.fetchReleases,
  };
});

vi.mock('../../services/ota/esp32OtaTransfer', async () => {
  const actual = await vi.importActual<typeof import('../../services/ota/esp32OtaTransfer')>(
    '../../services/ota/esp32OtaTransfer'
  );
  return {
    ...actual,
    readEsp32OtaHttpStatus: mocks.readStatus,
    uploadEsp32Firmware: mocks.uploadFirmware,
  };
});

vi.mock('../../services/ota/nativeSoftAp', async () => {
  const actual = await vi.importActual<typeof import('../../services/ota/nativeSoftAp')>(
    '../../services/ota/nativeSoftAp'
  );
  return {
    ...actual,
    isNativeSoftApJoinAvailable: () => false,
  };
});

const release: Esp32FirmwareReleaseOption = {
  id: 'release-1',
  tagName: 'v1.2.3',
  title: 'ESP32 v1.2.3',
  publishedAt: '2026-08-09T00:00:00Z',
  size: 1024,
  downloadUrl: 'https://example.test/firmware.bin',
  latest: true,
};

const otaControlStatus: OtaControlStatus = {
  protocolVersion: 1,
  lastOpCode: 0,
  lastOp: 'read',
  resultCode: 0,
  result: 'ok',
  stateCode: 1,
  progress: 0,
  flags: 0,
  portalActive: true,
  updating: false,
  hasCredentials: true,
  error: false,
  uploadedBytes: 0,
  totalBytes: 0,
  remainingSeconds: 0,
  nodeId: 7,
  ssid: 'ULSA-UPDATE-7',
  password: 'password',
  token: 'token',
  ip: '192.168.4.1',
};

const httpStatus: Esp32OtaHttpStatus = {
  state: 'ready',
  portalActive: true,
  updating: false,
  nodeId: 7,
  ssid: 'ULSA-UPDATE-7',
  progress: 0,
  uploadedBytes: 0,
  totalBytes: 0,
  remainingSeconds: 0,
  firmwareVersion: '1.2.2',
  error: null,
};

const renderPanel = () => render(
  <OtaPanel
    isConnected
    capabilitiesStatus={null}
    otaControlStatus={otaControlStatus}
    otaControlBusy={false}
    platformInfo={{
      platform: 'web',
      adapterType: 'WebBluetooth',
      isSupported: true,
    }}
    onRefreshOtaControlStatus={vi.fn().mockResolvedValue(undefined)}
    onWriteOtaControl={vi.fn().mockResolvedValue(otaControlStatus)}
  />
);

describe('OtaPanel accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
    mocks.fetchReleases.mockResolvedValue([release]);
    mocks.downloadFirmware.mockResolvedValue(new File(['firmware'], 'firmware.bin'));
    mocks.readStatus.mockResolvedValue(httpStatus);
    mocks.uploadFirmware.mockImplementation(async (_session, _file, onProgress) => {
      onProgress?.({ loaded: 42, total: 100, percent: 42 });
    });
  });

  it('announces catalog failures as alerts', async () => {
    mocks.fetchReleases.mockRejectedValueOnce(new Error('配布情報の取得に失敗しました'));
    renderPanel();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('配布情報の取得に失敗しました');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('offers the Initial-to-Demo path without a BLE connection', async () => {
    render(
      <OtaPanel
        isConnected={false}
        capabilitiesStatus={null}
        otaControlStatus={null}
        otaControlBusy={false}
        platformInfo={{ platform: 'ios', adapterType: 'Capacitor', isSupported: true }}
        onRefreshOtaControlStatus={vi.fn().mockResolvedValue(undefined)}
        onWriteOtaControl={vi.fn().mockResolvedValue(null)}
      />
    );
    const label = await screen.findByText('InitialからDemoをセットアップ');
    expect(label.closest('ion-button')).not.toHaveAttribute('disabled');
  });

  it('uses the same OTA controller for the startup Initial setup wizard', async () => {
    render(
      <OtaPanel
        presentation="initialSetup"
        isConnected={false}
        capabilitiesStatus={null}
        otaControlStatus={null}
        otaControlBusy={false}
        platformInfo={{ platform: 'ios', adapterType: 'Capacitor', isSupported: true }}
        onRefreshOtaControlStatus={vi.fn().mockResolvedValue(undefined)}
        onWriteOtaControl={vi.fn().mockResolvedValue(null)}
      />
    );

    expect(await screen.findByRole('heading', { name: 'アプリ接続にはファームウェア更新が必要です' })).toBeInTheDocument();
    expect(screen.getByText(/基本機能のみが実装された「工場出荷ファーム」/)).toBeInTheDocument();
    expect(screen.getByText(/ワイヤレス接続やログ機能/)).toBeInTheDocument();
    const consents = screen.getByRole('group', { name: 'デモファームウェア利用条件' });
    expect(consents.querySelectorAll('input[type="checkbox"]')).toHaveLength(4);
  });

  it('announces successful work politely and exposes transfer progress', async () => {
    renderPanel();

    const downloadButton = await screen.findByRole('button', { name: /FWを取得/ });
    await waitFor(() => expect(downloadButton).toBeEnabled());
    fireEvent.click(downloadButton);

    const downloadStatus = await screen.findByRole('status');
    await waitFor(() => expect(downloadStatus).toHaveTextContent('firmware.binを取得しました'));
    expect(downloadStatus).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(screen.getByRole('button', { name: '状態' }));
    await waitFor(() => expect(mocks.readStatus).toHaveBeenCalledOnce());

    const uploadButton = screen.getByRole('button', { name: /転送して更新/ });
    await waitFor(() => expect(uploadButton).toBeEnabled());
    fireEvent.click(uploadButton);

    const progress = await screen.findByRole('progressbar', {
      name: 'ESP32ファームウェア転送の進捗',
    });
    expect(progress).toHaveAttribute('aria-valuemin', '0');
    expect(progress).toHaveAttribute('aria-valuemax', '100');
    expect(progress).toHaveAttribute('aria-valuenow', '42');
    expect(progress).toHaveAttribute('aria-valuetext', '42%');

    expect(await screen.findByRole('status')).toHaveTextContent(
      '転送完了。ESP32を再起動しています'
    );
  });
});
