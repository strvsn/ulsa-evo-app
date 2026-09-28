import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Stm32UpdateHttpStatus } from '../../services/ota/stm32OtaTransfer';
import { Stm32UpdateFlowControls } from '../../../test-support/Stm32UpdateFlowControls';

const createProps = () => ({
  releases: [],
  selectedReleaseId: null,
  onSelectedReleaseIdChange: vi.fn(),
  catalogBusy: false,
  downloadBusy: false,
  connectionFlowBusy: false,
  transferBusy: false,
  selectedPackageReady: false,
  canDownloadPackage: false,
  firmwareStepDetail: 'Release未取得',
  networkReady: false,
  canStartUpdateNetwork: false,
  autoJoinAvailable: false,
  connectionStepDetail: '待機中',
  session: null,
  writeLocked: false,
  canCancelUpdate: false,
  storedPackageReady: false,
  probeReady: false,
  canUploadPackage: false,
  canProbePackage: false,
  canStartWrite: false,
  canResumeMonitoring: false,
  packageTransferStepDetail: '転送待機',
  probeStepDetail: 'Package転送後に有効',
  writeStepDetail: '非消去確認後に有効',
  uploadProgress: null,
  httpStatus: null,
  onCacheSelectedPackage: vi.fn(),
  onStartUpdateNetwork: vi.fn(),
  onRefreshStm32HttpStatus: vi.fn(),
  onCancelUpdate: vi.fn(),
  onUploadPackage: vi.fn(),
  onProbePackage: vi.fn(),
  onWriteOrResume: vi.fn(),
});

const httpStatus: Stm32UpdateHttpStatus = {
  phase: 'writing',
  packageReady: true,
  canCancel: false,
  canWrite: false,
  scratchBytes: 100,
  totalBytes: 100,
  packageBytes: 100,
  packageSha256: 'a'.repeat(64),
  writtenBytes: 73,
  verifiedBytes: 0,
  progress: 73,
  target: 'NUCLEO_F446RE',
  version: '1.2.3',
  releaseTag: 'v1.2.3',
  buildProfile: 'production',
  rdpPolicy: 'preserve',
  error: null,
};

describe('Stm32UpdateFlowControls accessibility', () => {
  it('exposes upload progress as a Japanese-labelled progressbar', () => {
    render(
      <Stm32UpdateFlowControls
        {...createProps()}
        uploadProgress={{ loaded: 37, total: 100, percent: 37 }}
      />
    );

    const progress = screen.getByRole('progressbar', {
      name: 'STM32ファームウェア更新の進捗',
    });
    expect(progress).toHaveAttribute('aria-valuemin', '0');
    expect(progress).toHaveAttribute('aria-valuemax', '100');
    expect(progress).toHaveAttribute('aria-valuenow', '37');
    expect(progress).toHaveAttribute('aria-valuetext', '37%');
  });

  it('uses device write progress when upload progress is unavailable', () => {
    render(
      <Stm32UpdateFlowControls
        {...createProps()}
        httpStatus={httpStatus}
      />
    );

    const progress = screen.getByRole('progressbar', {
      name: 'STM32ファームウェア更新の進捗',
    });
    expect(progress).toHaveAttribute('aria-valuenow', '73');
    expect(progress).toHaveAttribute('aria-valuetext', '73%');
  });

  it('keeps status reattachment available after native auto-join', () => {
    render(
      <Stm32UpdateFlowControls
        {...createProps()}
        autoJoinAvailable
        session={{
          ssid: 'ULSA-EVO-OTA-7',
          password: 'password',
          token: 'token',
          ip: '192.168.4.1',
          nodeId: 7,
        }}
      />
    );

    const reattach = screen.getByText('STM32 status再確認').closest('ion-button');
    expect(reattach).not.toBeNull();
    expect(reattach).not.toHaveAttribute('disabled');
  });

  it('shows transfer, non-destructive probe, and explicit write as ordered steps', () => {
    render(<Stm32UpdateFlowControls {...createProps()} />);

    const download = screen.getByRole('button', { name: /1 Packageを取得/ });
    const network = screen.getByRole('button', { name: /2 STM32用Wi-Fiを開始/ });
    const transfer = screen.getByRole('button', { name: /3 Packageを転送/ });
    const probe = screen.getByRole('button', { name: /4 消去せず接続確認/ });
    const write = screen.getByRole('button', { name: /5 STM32へ書込み/ });

    expect(download.compareDocumentPosition(network) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(network.compareDocumentPosition(transfer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(transfer.compareDocumentPosition(probe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(probe.compareDocumentPosition(write) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Package転送後に有効')).toHaveAttribute('aria-live', 'polite');
  });

  it('keeps an explicit same-session Wi-Fi retry on the second step', () => {
    const props = createProps();
    render(
      <Stm32UpdateFlowControls
        {...props}
        autoJoinAvailable
        retryConnectionAvailable
        canStartUpdateNetwork
        connectionStepDetail="Wi-Fi接続を再試行"
      />
    );

    const retry = screen.getByRole('button', { name: /2 STM32用Wi-Fiへ再接続/ });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(props.onStartUpdateNetwork).toHaveBeenCalledOnce();
  });

  it('reuses the primary fifth step for an accessible monitor-resume action', () => {
    const props = createProps();
    render(
      <Stm32UpdateFlowControls
        {...props}
        canResumeMonitoring
        httpStatus={httpStatus}
        writeStepDetail="writing 73% / 監視再開可能"
      />
    );

    const resume = screen.getByRole('button', { name: /書込み監視を再開/ });
    expect(resume).toBeEnabled();
    expect(resume).toHaveClass('ota-flow-step-button', 'primary');
    expect(resume).toHaveTextContent('5');
    expect(resume).toHaveTextContent('監視再開可能');
    fireEvent.click(resume);
    expect(props.onWriteOrResume).toHaveBeenCalledOnce();
  });
});
