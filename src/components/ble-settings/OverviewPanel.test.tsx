import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OverviewPanel } from './OverviewPanel';

const baseProps = {
  connectionState: 'scanning' as const,
  dataState: 'idle' as const,
  connectedDevice: null,
  parseErrorStats: { count: 0, lastError: null },
  error: null,
  isBusy: true,
  isSupported: true,
  platformInfo: null,
  onClearError: vi.fn(),
};

describe('OverviewPanel accessibility', () => {
  it('exposes the changing BLE state as a polite atomic status', () => {
    const { rerender } = render(<OverviewPanel {...baseProps} />);

    expect(document.querySelector('.lucide-bluetooth')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.lucide-radio-tower').length).toBeGreaterThanOrEqual(1);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveTextContent('デバイスを検索中...');

    rerender(
      <OverviewPanel
        {...baseProps}
        connectionState="connected"
        dataState="live"
        isBusy={false}
      />
    );

    expect(status).toHaveTextContent('接続済み');
    expect(document.querySelectorAll('.lucide-radio-tower').length).toBeGreaterThanOrEqual(2);

    rerender(
      <OverviewPanel
        {...baseProps}
        connectionState="disconnected"
        dataState="idle"
        isBusy={false}
      />
    );

    expect(status).toHaveTextContent('未接続');
    expect(document.querySelector('.lucide-unplug')).toBeInTheDocument();
    expect(screen.queryByText('Commit')).not.toBeInTheDocument();
  });

  it('marks unsupported and connection errors as alerts', () => {
    render(
      <OverviewPanel
        {...baseProps}
        error="接続に失敗しました"
        isBusy={false}
        isSupported={false}
      />
    );

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent('このブラウザ/デバイスではBLEがサポートされていません');
    expect(alerts[1]).toHaveTextContent('接続に失敗しました');
  });

  it('keeps adapter implementation labels out of the user overview', () => {
    render(
      <OverviewPanel
        {...baseProps}
        isBusy={false}
        platformInfo={{
          platform: 'web',
          adapterType: 'WebBluetooth',
          isSupported: true,
          webBluetoothAvailable: true,
        }}
      />
    );

    expect(screen.queryByText('Web BLE')).not.toBeInTheDocument();
    expect(screen.queryByText('WebBluetooth')).not.toBeInTheDocument();
  });
});
