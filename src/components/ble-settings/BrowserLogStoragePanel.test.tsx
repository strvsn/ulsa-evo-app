import { useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyBrowserLogStatus } from '../../services/browserLog';
import type { BrowserLogSessionSummary } from '../../services/browserLog';
import { BrowserLogStoragePanel } from './BrowserLogStoragePanel';

vi.mock('@ionic/react', async () => {
  const actual = await vi.importActual<typeof import('@ionic/react')>('@ionic/react');
  return {
    ...actual,
    IonAlert: ({
      isOpen,
      header,
      message,
      buttons,
      onDidDismiss,
    }: {
      isOpen: boolean;
      header: string;
      message: string;
      buttons: Array<{ text: string; role: string; handler?: () => void }>;
      onDidDismiss?: () => void;
    }) => isOpen ? (
      <div role="alertdialog" aria-label={header}>
        <p>{message}</p>
        {buttons.map((button) => (
          <button
            key={button.text}
            onClick={() => {
              button.handler?.();
              onDidDismiss?.();
            }}
          >
            {button.text}
          </button>
        ))}
      </div>
    ) : null,
    IonIcon: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  };
});

const session = (overrides: Partial<BrowserLogSessionSummary> = {}): BrowserLogSessionSummary => ({
  sessionId: 'session-1',
  startedAt: Date.UTC(2026, 7, 29, 1),
  endedAt: Date.UTC(2026, 7, 29, 2),
  lastActivityAt: Date.UTC(2026, 7, 29, 2),
  retentionAnchorAt: Date.UTC(2026, 7, 29, 2),
  expiresAt: Date.UTC(2026, 8, 28, 2),
  rowCount: 120,
  segmentCount: 2,
  sizeBytes: 2 * 1024 * 1024,
  completed: true,
  ...overrides,
});

const createProps = (): ComponentProps<typeof BrowserLogStoragePanel> => ({
  status: {
    ...createEmptyBrowserLogStatus(),
    storedSessionCount: 1,
    storedSegmentCount: 2,
    storedRowCount: 120,
    storedBytes: 2 * 1024 * 1024,
    storageRemainingBytes: 98 * 1024 * 1024,
    hasExportableData: true,
    sessions: [session()],
  },
  exportBusy: false,
  exportDisabled: false,
  exportTitle: 'ZIPを準備',
  preparedArchive: null,
  nextExportBatch: null,
  exportNotice: null,
  exportError: null,
  maintenanceOperation: null,
  maintenanceError: null,
  onPrepareExport: vi.fn(),
  onDeliverPreparedExport: vi.fn(),
  onPrepareNextExport: vi.fn(),
  onDiscardPreparedExport: vi.fn(),
  onRefresh: vi.fn(),
  onDeleteSession: vi.fn(),
  onDeleteAll: vi.fn(),
});

describe('BrowserLogStoragePanel', () => {
  it('explains retention, logical capacity, origin estimate, and expiry separately', () => {
    const props = createProps();
    render(<BrowserLogStoragePanel {...props} />);

    expect(screen.getByText(/最長30日・合計100.0 MiB/)).toBeInTheDocument();
    expect(screen.getByText(/安全余裕16.0 MiB/)).toBeInTheDocument();
    expect(screen.getByText('2.0 MiB / 100.0 MiB')).toBeInTheDocument();
    expect(screen.getAllByText('98.0 MiB')).toHaveLength(2);
    expect(screen.getByText('取得不可')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'アプリ内ログ容量使用率' }))
      .toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByText('使用済み')).toBeInTheDocument();
    expect(screen.getByText('空き')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '自動削除' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('アプリ内ログは補助記録です');
    expect(screen.getByRole('note')).toHaveTextContent('確実な記録にはカード内保存');
  });

  it('labels empty expiry and sample states without implying an unfinished operation', () => {
    const props = createProps();
    props.status = createEmptyBrowserLogStatus();
    render(<BrowserLogStoragePanel {...props} />);

    expect(screen.getByText('予定なし')).toBeInTheDocument();
    expect(screen.getByText('未記録')).toBeInTheDocument();
  });

  it('does not delete a session until the destructive confirmation is accepted', () => {
    const props = createProps();
    render(<BrowserLogStoragePanel {...props} />);

    fireEvent.click(screen.getByTestId('browser-log-delete-session-1'));
    expect(props.onDeleteSession).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'このアプリ内ログを削除しますか？' }))
      .toHaveTextContent('カード内ログは削除されません');

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(props.onDeleteSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('browser-log-delete-session-1'));
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    expect(props.onDeleteSession).toHaveBeenCalledOnce();
    expect(props.onDeleteSession).toHaveBeenCalledWith('session-1');
  });

  it('uses a separate irreversible confirmation for deleting all app logs', () => {
    const props = createProps();
    render(<BrowserLogStoragePanel {...props} />);

    fireEvent.click(screen.getByTestId('browser-log-delete-all'));
    expect(screen.getByRole('alertdialog', { name: '保存済みアプリ内ログをすべて削除しますか？' }))
      .toHaveTextContent('1件');
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));

    expect(props.onDeleteAll).toHaveBeenCalledOnce();
    expect(props.onDeleteSession).not.toHaveBeenCalled();
  });

  it('moves focus to a surviving management action after a deleted row disappears', async () => {
    const initial = createProps();
    const Harness = () => {
      const [status, setStatus] = useState(initial.status);
      return (
        <BrowserLogStoragePanel
          {...initial}
          status={status}
          onDeleteSession={() => setStatus({
            ...createEmptyBrowserLogStatus(),
            maintenanceNotice: '削除しました。',
          })}
        />
      );
    };
    render(<Harness />);

    fireEvent.click(screen.getByTestId('browser-log-delete-session-1'));
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));

    await waitFor(() => expect(screen.getByTestId('browser-log-refresh')).toHaveFocus());
  });

  it('disables deletion during recording and exposes the reason', () => {
    const props = createProps();
    props.status.active = true;
    render(<BrowserLogStoragePanel {...props} />);

    expect(screen.getByTestId('browser-log-delete-session-1')).toBeDisabled();
    expect(screen.getByTestId('browser-log-delete-session-1'))
      .toHaveAttribute('data-control-disabled-reason', '記録停止後に削除できます');
    expect(screen.getByTestId('browser-log-delete-all')).toBeDisabled();
  });

  it('keeps ZIP preparation and direct share/save as separate user actions', () => {
    const props = createProps();
    props.preparedArchive = {
      file: new File(['zip'], 'logs.zip', { type: 'application/zip' }),
      createdAt: 1000,
      rawBytes: 2 * 1024 * 1024,
      totalRawBytes: 2 * 1024 * 1024,
      sessionCount: 1,
      segmentCount: 2,
      scopeSessionId: null,
      batchIndex: 0,
      batchCount: 1,
      plan: { batches: [[]], totalRawBytes: 2 * 1024 * 1024 },
    };
    props.exportDisabled = true;
    render(<BrowserLogStoragePanel {...props} />);

    fireEvent.click(screen.getByTestId('browser-log-deliver'));
    expect(props.onDeliverPreparedExport).toHaveBeenCalledOnce();
    expect(props.onPrepareExport).not.toHaveBeenCalled();
  });

  it('starts delivery automatically after selecting one log to download', async () => {
    const props = createProps();
    const { rerender } = render(<BrowserLogStoragePanel {...props} />);

    fireEvent.click(screen.getByTestId('browser-log-export-session-1'));
    expect(props.onPrepareExport).toHaveBeenCalledWith('session-1');

    const archive = {
      file: new File(['zip'], 'logs.zip', { type: 'application/zip' }),
      createdAt: 1000,
      rawBytes: 2 * 1024 * 1024,
      totalRawBytes: 2 * 1024 * 1024,
      sessionCount: 1,
      segmentCount: 2,
      scopeSessionId: 'session-1',
      batchIndex: 0,
      batchCount: 1,
      plan: { batches: [[]], totalRawBytes: 2 * 1024 * 1024 },
    };
    props.preparedArchive = archive;
    // A prepared archive arriving after the first click is delivered by the panel effect.
    rerender(<BrowserLogStoragePanel {...props} />);
    await waitFor(() => expect(props.onDeliverPreparedExport).toHaveBeenCalledOnce());
  });

  it('offers compact row selection and a bulk download action', () => {
    const props = createProps();
    props.status.sessions = [session(), session({ sessionId: 'session-2', startedAt: Date.UTC(2026, 7, 30, 1) })];
    render(<BrowserLogStoragePanel {...props} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    const sessionCheckboxes = screen.getAllByRole('checkbox');
    fireEvent.click(sessionCheckboxes[1]);
    fireEvent.click(sessionCheckboxes[2]);
    fireEvent.click(screen.getByTestId('browser-log-download-selected'));
    expect(props.onPrepareExport).toHaveBeenCalledWith(['session-1', 'session-2']);
  });

  it('downloads every log through the table selection without a second all-logs button', () => {
    const props = createProps();
    render(<BrowserLogStoragePanel {...props} />);

    expect(screen.queryByTestId('browser-log-export')).not.toBeInTheDocument();
    const bulkDownload = screen.getByTestId('browser-log-download-selected');
    expect(bulkDownload).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'すべてのログを選択' }));
    expect(bulkDownload).toBeEnabled();
    fireEvent.click(bulkDownload);
    expect(props.onPrepareExport).toHaveBeenCalledWith(['session-1']);
  });

  it('blocks catalog refresh while a split ZIP sequence is incomplete', () => {
    const props = createProps();
    props.nextExportBatch = { sessionId: null, batchIndex: 1, batchCount: 2 };
    render(<BrowserLogStoragePanel {...props} />);

    expect(screen.getByTestId('browser-log-refresh')).toBeDisabled();
    expect(screen.getByTestId('browser-log-refresh'))
      .toHaveAttribute('data-control-disabled-reason', '分割ZIPをすべて保存または破棄してから更新できます');
  });

  it('announces capacity recovery and nonfatal maintenance states', () => {
    const props = createProps();
    props.status.storageLimitReached = true;
    props.status.maintenanceNotice = '期限切れログ1件を自動削除しました。';
    props.exportError = 'ZIP作成に失敗しました。';
    render(<BrowserLogStoragePanel {...props} />);

    expect(screen.getAllByRole('alert').map((element) => element.textContent).join(' '))
      .toContain('ログをダウンロード');
    expect(screen.getAllByRole('alert').map((element) => element.textContent).join(' '))
      .toContain('ZIP作成に失敗');
    expect(screen.getByRole('status')).toHaveTextContent('自動削除');
  });
});
