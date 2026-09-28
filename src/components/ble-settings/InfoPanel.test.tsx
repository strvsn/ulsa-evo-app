import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProductInformation } from '../../config/appInformation';
import type { RuntimeAppInfo } from '../../services/nativeAppInfo';
import { InfoPanel } from './InfoPanel';
import { INITIAL_FIRMWARE_ONBOARDING_OPEN_EVENT } from '../../services/initialFirmwareOnboardingPreference';

vi.mock('../../utils/buildInfo', () => ({
  BUILD_COMMIT_HASH: 'abc1234',
  BUILD_COMMIT_TIME: '2026-08-30T10:00:00+09:00',
  formatCommitTime: () => '2026/08/30 10:00',
}));

const runtimeInfo: RuntimeAppInfo = {
  name: 'EVO APP',
  version: '1.0',
  build: '20260830110000',
  source: 'ios-bundle',
  error: null,
};

const missingConfiguration: ProductInformation = {
  appName: 'EVO APP',
  support: { url: null, state: 'missing' },
  privacyPolicy: { url: null, state: 'missing' },
};

describe('InfoPanel', () => {
  it('shows installed version, data handling, and actionable missing configuration', async () => {
    render(
      <InfoPanel
        productInformation={missingConfiguration}
        loadRuntimeInfo={vi.fn().mockResolvedValue(runtimeInfo)}
      />
    );

    await waitFor(() => expect(screen.getByText('1.0')).toBeInTheDocument());
    expect(screen.getByText('アプリ情報')).toBeInTheDocument();
    expect(screen.getByText('アプリ名')).toBeInTheDocument();
    expect(screen.getByText('EVO APP')).toBeInTheDocument();
    expect(screen.getByText('アプリバージョン（iOS / Web共通）')).toBeInTheDocument();
    expect(screen.getByText('1.0')).toBeInTheDocument();
    expect(screen.queryByText('20260830110000')).not.toBeInTheDocument();
    expect(screen.queryByText('abc1234')).not.toBeInTheDocument();
    expect(screen.getByText(/最長30日・合計100MiB/)).toBeInTheDocument();
    expect(screen.getByText(/analytics・広告・tracking目的で外部送信しません/)).toBeInTheDocument();
    expect(screen.getByText(/アプリとデモファームウェアはオープンソース・無保証/)).toBeInTheDocument();
    expect(screen.getByText(/個別サポート・動作保証・機能追加対応は原則行いません/)).toBeInTheDocument();
    expect(screen.queryByText(/問い合わせる窓口/)).not.toBeInTheDocument();
    expect(screen.queryByText(/VITE_SUPPORT_URL/)).not.toBeInTheDocument();
    expect(screen.queryByText(/VITE_PRIVACY_POLICY_URL/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/現在準備中/).length).toBeGreaterThan(0);
  });

  it('offers 44px public documentation and Privacy actions when configured', async () => {
    const configured: ProductInformation = {
      appName: 'EVO APP',
      support: { url: 'https://example.com/support', state: 'configured' },
      privacyPolicy: { url: 'https://example.com/privacy', state: 'configured' },
    };
    render(
      <InfoPanel
        productInformation={configured}
        loadRuntimeInfo={vi.fn().mockResolvedValue(runtimeInfo)}
      />
    );

    const support = await screen.findByText('公開ドキュメントを開く');
    const privacy = screen.getByText('Privacy Policyを開く');
    expect(support.closest('ion-button')).toHaveAttribute('href', 'https://example.com/support');
    expect(privacy.closest('ion-button')).toHaveAttribute('href', 'https://example.com/privacy');
    expect(support.closest('ion-button')).toHaveAttribute('data-control-size', 'M44');
    expect(privacy.closest('ion-button')).toHaveAttribute('data-control-size', 'M44');
    expect(support.closest('ion-button')).toHaveAttribute('fill', 'outline');
    expect(privacy.closest('ion-button')).toHaveAttribute('fill', 'outline');
    expect(support.closest('ion-button')).toHaveAttribute('data-control-variant', 'secondary');
    expect(support.closest('ion-button')).toHaveClass('app-information-button');
    expect(support.closest('ion-button')).not.toHaveClass('ble-settings-action-button', 'outline');
  });

  it('can reopen the first-time firmware setup guide', async () => {
    const listener = vi.fn();
    window.addEventListener(INITIAL_FIRMWARE_ONBOARDING_OPEN_EVENT, listener);
    render(<InfoPanel loadRuntimeInfo={vi.fn().mockResolvedValue(runtimeInfo)} />);
    await screen.findByText('1.0');

    fireEvent.click(screen.getByText('初回セットアップガイド'));

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(INITIAL_FIRMWARE_ONBOARDING_OPEN_EVENT, listener);
  });
});
