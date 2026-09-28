import type { ComponentProps, ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InitialFirmwareSetupWizardView } from './InitialFirmwareSetupWizardView';

vi.mock('@ionic/react', async () => {
  const actual = await vi.importActual<typeof import('@ionic/react')>('@ionic/react');
  return {
    ...actual,
    IonModal: ({ isOpen, children, canDismiss, backdropDismiss, onDidDismiss, 'aria-label': ariaLabel }: {
      isOpen?: boolean;
      children?: ReactNode;
      canDismiss?: boolean;
      backdropDismiss?: boolean;
      onDidDismiss?: () => void;
      'aria-label'?: string;
    }) => isOpen ? <>
      <button type="button" data-testid="mock-initial-setup-backdrop-dismiss"
        disabled={!canDismiss || !backdropDismiss} onClick={onDidDismiss}>mock backdrop dismiss</button>
      <div role="dialog" aria-label={ariaLabel} data-can-dismiss={String(canDismiss)}>{children}</div>
    </> : null,
  };
});

const release = {
  id: 'demo-1',
  tagName: 'esp32-fw-v1.0.0-r1',
  title: 'Demo',
  publishedAt: '2026-09-03T00:00:00Z',
  size: 1024,
  downloadUrl: '/demo.bin',
  latest: true,
};

const createProps = (
  overrides: Partial<ComponentProps<typeof InitialFirmwareSetupWizardView>> = {}
): ComponentProps<typeof InitialFirmwareSetupWizardView> => ({
  isOpen: true,
  defaultHideNextTime: false,
  initialSetupSupported: true,
  selectedRelease: release,
  firmwareCatalogBusy: false,
  firmwareDownloadBusy: false,
  selectedFirmwareReady: false,
  canDownloadFirmware: true,
  connectionFlowBusy: false,
  connectionPhase: 'idle',
  networkReady: false,
  canStartUpdateNetwork: false,
  transferBusy: false,
  uploadProgress: null,
  canUpload: false,
  setupComplete: false,
  transferComplete: false,
  message: null,
  autoJoinAvailable: true,
  requiresManualBleConnection: false,
  onCacheFirmware: vi.fn(),
  onStartUpdateNetwork: vi.fn(),
  onRetryInitialConnection: vi.fn(),
  onUpload: vi.fn(),
  onRetryVerification: vi.fn(),
  onHideNextTimeChange: vi.fn(),
  onDismiss: vi.fn(),
  ...overrides,
});

describe('InitialFirmwareSetupWizardView', () => {
  it('caps an estimated ring below completion while the Initial connection is still busy', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<InitialFirmwareSetupWizardView {...createProps()} />);
      for (const label of ['評価・開発用デモファームウェア', '動作保証はありません', '保証・補償について', 'オープンソースとして公開']) {
        fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(label) }));
      }
      fireEvent.click(screen.getByText('インストールを始める'));
      rerender(<InitialFirmwareSetupWizardView {...createProps({
        selectedFirmwareReady: true, connectionFlowBusy: true, connectionPhase: 'softAp',
      })} />);
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(screen.getByTestId('initial-setup-progress-ring').style.getPropertyValue('--initial-progress'))
        .toBe('95%');
    } finally {
      vi.useRealTimers();
    }
  });

  it('explains the factory firmware briefly, then completes download, button, and transfer in one wizard', () => {
    const props = createProps();
    const { rerender } = render(<InitialFirmwareSetupWizardView {...props} />);

    expect(screen.getByRole('img', { name: 'ULSA EVO本体' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'アプリ接続にはファームウェア更新が必要です' })).toBeInTheDocument();
    expect(screen.getByText(/基本機能のみが実装された「工場出荷ファーム」/)).toBeInTheDocument();
    expect(screen.getByText(/ワイヤレス接続やログ機能/)).toBeInTheDocument();
    expect(screen.queryByText('工場出荷時の状態')).not.toBeInTheDocument();
    expect(screen.queryByText(/INITIAL|Initial/)).not.toBeInTheDocument();
    const startButton = screen.getByText('インストールを始める').closest('ion-button');
    expect(startButton).not.toBeNull();
    expect(startButton).toHaveAttribute('data-control-interaction', 'disabled');
    fireEvent.click(screen.getByRole('checkbox', { name: /評価・開発用デモファームウェア/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /動作保証はありません/ }));
    expect(startButton).toHaveAttribute('data-control-interaction', 'disabled');
    fireEvent.click(screen.getByRole('checkbox', { name: /保証・補償について/ }));
    expect(startButton).toHaveAttribute('data-control-interaction', 'disabled');
    fireEvent.click(screen.getByRole('checkbox', { name: /オープンソース/ }));
    expect(startButton).toHaveAttribute('data-control-interaction', 'idle');
    fireEvent.click(screen.getByRole('checkbox', { name: '次回から表示しない' }));
    expect(props.onHideNextTimeChange).toHaveBeenCalledWith(true);
    fireEvent.click(startButton!);

    expect(screen.getByRole('heading', { name: '更新データを準備しています' })).toBeInTheDocument();
    expect(props.onDismiss).not.toHaveBeenCalled();
    expect(props.onCacheFirmware).toHaveBeenCalledOnce();
    expect(screen.queryByText('取得して次へ')).not.toBeInTheDocument();

    rerender(<InitialFirmwareSetupWizardView {...createProps({ firmwareDownloadBusy: true })} />);
    expect(screen.getByTestId('initial-setup-progress-ring'))
      .toHaveAttribute('data-progress-kind', 'estimated');

    const buttonProps = createProps({ selectedFirmwareReady: true, canStartUpdateNetwork: true });
    rerender(<InitialFirmwareSetupWizardView {...buttonProps} />);
    expect(screen.queryByTestId('initial-setup-progress-ring')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '本体ボタンを押し続けてください' })).toBeInTheDocument();
    expect(screen.getByLabelText('待機中はLEDが緑で点滅し、白に点灯したらボタンを離す')).toBeInTheDocument();
    expect(screen.getByText('緑点滅')).toBeInTheDocument();
    expect(screen.queryByText('黄色点滅')).not.toBeInTheDocument();
    expect(screen.getByText('白になったら離す')).toBeInTheDocument();
    expect(screen.queryByText('本体操作を開始')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('白く点灯したので次へ'));
    expect(buttonProps.onStartUpdateNetwork).toHaveBeenCalledOnce();

    rerender(<InitialFirmwareSetupWizardView {...createProps({
      selectedFirmwareReady: true, connectionFlowBusy: true, connectionPhase: 'softAp',
    })} />);
    expect(screen.getByTestId('initial-setup-progress-ring'))
      .toHaveAttribute('data-progress-kind', 'estimated');

    rerender(<InitialFirmwareSetupWizardView {...createProps({
      selectedFirmwareReady: true, connectionFlowBusy: true, connectionPhase: 'iosPrompt',
    })} />);
    expect(screen.getByRole('heading', { name: '本体に接続しています' })).toBeInTheDocument();
    expect(screen.getByText('iPhoneのWi-Fi接続確認で「接続」を選んでください。')
      .closest('.initial-setup-footer')).not.toBeNull();
    expect(screen.queryByTestId('initial-setup-progress-ring')).not.toBeInTheDocument();
    expect(document.querySelector('.initial-setup-busy-status ion-spinner')).not.toBeNull();

    rerender(<InitialFirmwareSetupWizardView {...createProps({
      selectedFirmwareReady: true, connectionFlowBusy: true, connectionPhase: 'wifi',
    })} />);
    expect(screen.getByTestId('initial-setup-progress-ring'))
      .toHaveAttribute('data-progress-kind', 'estimated');

    const retryProps = createProps({ selectedFirmwareReady: true, canStartUpdateNetwork: true,
      connectionPhase: 'wifi', message: { role: 'alert', text: 'ULSA-EVO-INITIALへ接続できませんでした' } });
    rerender(<InitialFirmwareSetupWizardView {...retryProps} />);
    expect(screen.getByRole('heading', { name: '更新用Wi-Fiを確認できません' })).toBeInTheDocument();
    expect(screen.getByText('ulsa-evo-initial')).toBeInTheDocument();
    fireEvent.click(screen.getByText('接続を再確認'));
    expect(retryProps.onRetryInitialConnection).toHaveBeenCalledOnce();

    const transferProps = createProps({ selectedFirmwareReady: true, networkReady: true, canUpload: true });
    rerender(<InitialFirmwareSetupWizardView {...transferProps} />);
    fireEvent.click(screen.getAllByText('インストール')[1]);
    expect(transferProps.onUpload).toHaveBeenCalledOnce();

    rerender(<InitialFirmwareSetupWizardView {...createProps({
      selectedFirmwareReady: true,
      networkReady: true,
      transferBusy: true,
      uploadProgress: { loaded: 42, total: 100, percent: 42 },
    })} />);
    expect(screen.getByRole('progressbar', { name: 'デモファームウェア転送の進捗' }))
      .toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByTestId('initial-setup-progress-ring'))
      .toHaveAttribute('data-progress-kind', 'measured');

    rerender(<InitialFirmwareSetupWizardView {...createProps({
      transferComplete: true, transferBusy: true, networkReady: true,
    })} />);
    expect(screen.getByRole('heading', { name: '本体の起動を確認しています' })).toBeInTheDocument();
    expect(screen.getByTestId('initial-setup-progress-ring'))
      .toHaveAttribute('data-progress-kind', 'estimated');
    expect(screen.queryByText('BLE接続を再確認')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: 'デモファームウェア転送の進捗' })).not.toBeInTheDocument();

    const verificationProps = createProps({ transferComplete: true });
    rerender(<InitialFirmwareSetupWizardView {...verificationProps} />);
    expect(document.querySelector('.lucide-bluetooth')).not.toBeInTheDocument();
    expect(document.querySelector('.lucide-radio-tower')).toBeInTheDocument();
    expect(screen.getByText('インストールは完了しました。本体への接続を確認します。')).toBeInTheDocument();
    fireEvent.click(screen.getByText('本体との接続を再確認'));
    expect(verificationProps.onRetryVerification).toHaveBeenCalledOnce();
    expect(screen.getByText('本体との接続を再確認')).toBeInTheDocument();

    rerender(<InitialFirmwareSetupWizardView {...createProps({ setupComplete: true })} />);
    expect(screen.getByText('セットアップ完了')).toBeInTheDocument();
  });

  it('copies the Web Initial Wi-Fi password from its icon button', async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      const { rerender } = render(<InitialFirmwareSetupWizardView {...createProps()} />);
      for (const label of ['評価・開発用デモファームウェア', '動作保証はありません', '保証・補償について', 'オープンソースとして公開']) {
        fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(label) }));
      }
      fireEvent.click(screen.getByText('インストールを始める'));
      rerender(<InitialFirmwareSetupWizardView {...createProps({
        selectedFirmwareReady: true, connectionFlowBusy: true, connectionPhase: 'wifi', autoJoinAvailable: false,
      })} />);
      const button = screen.getByLabelText('Wi-Fiパスワードをコピー');
      expect(button).toHaveTextContent('ulsa-evo-initial');
      expect(button.querySelector('.lucide-copy')).not.toBeNull();
      fireEvent.click(button);
      await waitFor(() => expect(writeText).toHaveBeenCalledWith('ulsa-evo-initial'));
      expect(await screen.findByText('コピーしました')).toBeInTheDocument();
      fireEvent.click(button);
      expect(await screen.findByText('コピーできませんでした。パスワードを手入力してください。')).toBeInTheDocument();
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('asks Web users to close the wizard and connect from the BLE card after transfer', () => {
    const props = createProps({
      transferComplete: true,
      requiresManualBleConnection: true,
      autoJoinAvailable: false,
    });
    const { rerender } = render(<InitialFirmwareSetupWizardView {...props} />);
    for (const label of ['評価・開発用デモファームウェア', '動作保証はありません', '保証・補償について', 'オープンソースとして公開']) {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(label) }));
    }
    fireEvent.click(screen.getByText('インストールを始める'));
    rerender(<InitialFirmwareSetupWizardView {...createProps({
      transferComplete: true,
      transferBusy: true,
      networkReady: true,
      requiresManualBleConnection: true,
      autoJoinAvailable: false,
    })} />);
    expect(screen.getByRole('heading', { name: '転送を完了しています' })).toBeInTheDocument();
    expect(screen.queryByText('本体の起動を確認しています')).not.toBeInTheDocument();
    rerender(<InitialFirmwareSetupWizardView {...props} />);

    expect(screen.getByRole('heading', { name: '本体へ接続してください' })).toBeInTheDocument();
    expect(screen.getByText(/Web版では自動接続されません/)).toBeInTheDocument();
    expect(screen.getByText(/画面上部の「BLEデバイス」を押し/)).toBeInTheDocument();
    expect(screen.queryByText('インストールは完了しました。本体への接続を確認します。')).not.toBeInTheDocument();
    expect(screen.queryByText('本体との接続を再確認')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('ダイアログを閉じる'));
    expect(props.onDismiss).toHaveBeenCalledOnce();
    expect(props.onRetryVerification).not.toHaveBeenCalled();
  });

  it('persists the checkbox choice when the user closes the wizard', () => {
    const onDismiss = vi.fn();
    render(<InitialFirmwareSetupWizardView {...createProps({ onDismiss })} />);

    fireEvent.click(screen.getByRole('checkbox', { name: '次回から表示しない' }));
    const closeButton = screen.getByRole('button', { name: '初回セットアップを閉じる' });
    fireEvent.click(closeButton);
    fireEvent.click(closeButton);

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('starts the download when catalog data becomes available without another confirmation screen', () => {
    const onCacheFirmware = vi.fn();
    const { rerender } = render(<InitialFirmwareSetupWizardView {...createProps({
      selectedRelease: null, firmwareCatalogBusy: true, canDownloadFirmware: false, onCacheFirmware,
    })} />);
    for (const label of ['評価・開発用デモファームウェア', '動作保証はありません', '保証・補償について', 'オープンソースとして公開']) {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(label) }));
    }
    fireEvent.click(screen.getByText('インストールを始める'));
    expect(onCacheFirmware).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: '更新データを準備しています' })).toBeInTheDocument();

    rerender(<InitialFirmwareSetupWizardView {...createProps({ onCacheFirmware })} />);
    expect(onCacheFirmware).toHaveBeenCalledOnce();
    expect(screen.queryByText('取得して次へ')).not.toBeInTheDocument();
  });

  it('offers a retry only after a download error and gives a manual Wi-Fi recovery action', () => {
    const onCacheFirmware = vi.fn();
    const onStartUpdateNetwork = vi.fn();
    const onRetryInitialConnection = vi.fn();
    const { rerender } = render(<InitialFirmwareSetupWizardView {...createProps({ onCacheFirmware, onStartUpdateNetwork, onRetryInitialConnection })} />);
    for (const label of ['評価・開発用デモファームウェア', '動作保証はありません', '保証・補償について', 'オープンソースとして公開']) {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(label) }));
    }
    fireEvent.click(screen.getByText('インストールを始める'));
    expect(onCacheFirmware).toHaveBeenCalledOnce();
    expect(screen.queryByText('もう一度試す')).not.toBeInTheDocument();

    rerender(<InitialFirmwareSetupWizardView {...createProps({
      onCacheFirmware, onStartUpdateNetwork,
      message: { role: 'alert', text: 'firmware.bin取得に失敗しました' },
    })} />);
    fireEvent.click(screen.getByText('もう一度試す'));
    expect(onCacheFirmware).toHaveBeenCalledTimes(2);

    rerender(<InitialFirmwareSetupWizardView {...createProps({
      onCacheFirmware, onStartUpdateNetwork, onRetryInitialConnection, selectedFirmwareReady: true,
      connectionPhase: 'wifi', autoJoinAvailable: false, canStartUpdateNetwork: true,
      message: { role: 'alert', text: '更新用Wi-Fiに接続できませんでした' },
    })} />);
    fireEvent.click(screen.getByText('接続を再確認'));
    expect(onRetryInitialConnection).toHaveBeenCalledOnce();
    expect(onStartUpdateNetwork).not.toHaveBeenCalled();
  });

  it('persists the checkbox choice when the user dismisses from the backdrop', () => {
    const onDismiss = vi.fn();
    const onHideNextTimeChange = vi.fn();
    render(<InitialFirmwareSetupWizardView {...createProps({ onDismiss, onHideNextTimeChange })} />);

    fireEvent.click(screen.getByRole('checkbox', { name: '次回から表示しない' }));
    fireEvent.click(screen.getByTestId('mock-initial-setup-backdrop-dismiss'));

    expect(onHideNextTimeChange).toHaveBeenCalledWith(true);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('keeps backdrop dismissal blocked but allows the close button during firmware work', () => {
    const onDismiss = vi.fn();
    render(<InitialFirmwareSetupWizardView {...createProps({ firmwareDownloadBusy: true, onDismiss })} />);

    expect(screen.getByRole('dialog', { name: 'アプリ連携の準備' }))
      .toHaveAttribute('data-can-dismiss', 'true');
    expect(screen.getByTestId('mock-initial-setup-backdrop-dismiss')).toBeDisabled();
    const closeButton = screen.getByRole('button', { name: '初回セットアップを閉じる' });
    expect(closeButton).toBeEnabled();
    fireEvent.click(closeButton);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
