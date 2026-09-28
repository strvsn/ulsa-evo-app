import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogRecordingCard } from './LogRecordingCard';

describe('LogRecordingCard', () => {
  it('renders destination health, elapsed time, and the stop action while active', () => {
    const onToggle = vi.fn();
    const onToggleDestination = vi.fn();
    render(
      <LogRecordingCard
        active
        disabled={false}
        hasError
        modeLabel="デュアル"
        elapsedLabel="01:40:00"
        actionTitle="デュアルログ記録を停止"
        destinations={[
          { destination: 'card', selected: true, state: 'error', detail: '書込失敗' },
          { destination: 'browser', selected: true, state: 'recording' },
        ]}
        canChangeDestinations={false}
        onToggleDestination={onToggleDestination}
        onToggle={onToggle}
      />
    );

    expect(screen.getByTestId('log-recording-destination-card')).toHaveClass('is-error');
    expect(screen.getByTestId('log-recording-destination-browser')).toHaveClass('is-recording');
    expect(screen.getByTestId('log-recording-destination-icon-card')).toBeInTheDocument();
    expect(screen.getByTestId('log-recording-destination-icon-browser')).toBeInTheDocument();
    expect(screen.getByTestId('log-recording-destination-card')).toHaveTextContent('カード内保存');
    expect(screen.getByTestId('log-recording-destination-browser')).toHaveTextContent('アプリ内記録中');
    expect(screen.getByTestId('log-recording-destination-detail-card')).toHaveTextContent('書込失敗');
    expect(screen.getByTestId('log-recording-destination-card')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('カード内保存: 異常、書込失敗')
    );
    expect(screen.getByTestId('log-recording-destination-card')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('log-recording-destination-browser')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('log-recording-icon')).toBeInTheDocument();
    expect(screen.getByText('ログ')).toBeInTheDocument();
    expect(screen.queryByText('記録中')).not.toBeInTheDocument();
    expect(screen.queryByText('待機中')).not.toBeInTheDocument();
    expect(screen.getByTestId('log-recording-elapsed')).toHaveTextContent('01:40:00');
    expect(screen.getByTestId('log-recording-elapsed')).toHaveAttribute(
      'aria-label',
      'アプリ内ログの経過時間'
    );
    expect(screen.getByText('アプリ内記録時間')).toBeInTheDocument();
    expect(screen.queryByText('カード使用')).not.toBeInTheDocument();
    expect(screen.queryByTestId('log-recording-card-usage')).not.toBeInTheDocument();
    expect(screen.getByTestId('log-recording-destination-card')).toBeDisabled();
    expect(screen.getByTestId('log-recording-destination-browser')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'デュアルログ記録を停止' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('hides elapsed time when only card recording is active', () => {
    render(
      <LogRecordingCard
        active
        disabled={false}
        hasError={false}
        modeLabel="カード"
        elapsedLabel="00:00:00"
        actionTitle="ログ記録を停止"
        destinations={[
          { destination: 'card', selected: true, state: 'recording' },
          { destination: 'browser', selected: false, state: 'disabled' },
        ]}
        canChangeDestinations={false}
        onToggleDestination={() => undefined}
        onToggle={() => undefined}
      />
    );

    expect(screen.getByTestId('log-recording-destination-card')).toHaveTextContent('カード内記録中');
    expect(screen.queryByText('アプリ内記録時間')).not.toBeInTheDocument();
    expect(screen.queryByTestId('log-recording-elapsed')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ログ記録を停止' })).toBeEnabled();
  });

  it('shows both recording destinations but only the app elapsed time in dual mode', () => {
    render(
      <LogRecordingCard
        active
        disabled={false}
        hasError={false}
        modeLabel="カード＋アプリ"
        elapsedLabel="02:03:04"
        actionTitle="ログ記録を停止"
        destinations={[
          { destination: 'card', selected: true, state: 'recording' },
          { destination: 'browser', selected: true, state: 'recording' },
        ]}
        canChangeDestinations={false}
        onToggleDestination={() => undefined}
        onToggle={() => undefined}
      />
    );

    expect(screen.getByTestId('log-recording-destination-card')).toHaveTextContent('カード内記録中');
    expect(screen.getByTestId('log-recording-destination-browser')).toHaveTextContent('アプリ内記録中');
    expect(screen.getByTestId('log-recording-elapsed')).toHaveTextContent('02:03:04');
    expect(screen.getAllByRole('time')).toHaveLength(1);
  });

  it('shows the waiting state with a start action while inactive', () => {
    const onToggleDestination = vi.fn();
    render(
      <LogRecordingCard
        active={false}
        disabled={false}
        hasError={false}
        modeLabel="カード"
        elapsedLabel="00:00:00"
        actionTitle="カードログ記録を開始"
        destinations={[]}
        canChangeDestinations
        onToggleDestination={onToggleDestination}
        onToggle={() => undefined}
      />
    );

    expect(screen.queryByTestId('log-recording-elapsed')).not.toBeInTheDocument();
    expect(screen.getByTestId('log-recording-destination-card')).toHaveClass('is-disabled');
    expect(screen.getByTestId('log-recording-destination-browser')).toHaveClass('is-disabled');
    expect(screen.getByTestId('log-recording-destination-card')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('log-recording-destination-browser')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('log-recording-destination-disabled-mark-card')).toBeInTheDocument();
    expect(screen.getByTestId('log-recording-destination-disabled-mark-browser')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('log-recording-destination-card'));
    expect(onToggleDestination).toHaveBeenCalledWith('card');
    expect(screen.getByRole('button', { name: 'カードログ記録を開始' })).toBeEnabled();
  });

  it('shows a selected but unavailable Card and a visible reason when Start is disabled', () => {
    render(<LogRecordingCard
      active={false} disabled hasError={false} modeLabel="カード"
      elapsedLabel="00:00:00" actionTitle="カードが検出されていません"
      destinations={[
        { destination: 'card', selected: true, state: 'disabled' },
        { destination: 'browser', selected: false, state: 'disabled' },
      ]}
      canChangeDestinations onToggleDestination={() => undefined} onToggle={() => undefined}
    />);

    expect(screen.getByTestId('log-recording-destination-card')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('log-recording-destination-card')).toHaveAttribute('data-control-selection', 'on');
    expect(screen.getByTestId('log-recording-destination-card')).toHaveAttribute(
      'aria-label', expect.stringContaining('カード内保存: 選択中・利用不可')
    );
    expect(screen.getByTestId('log-recording-destination-card')).toHaveAttribute('title', 'カード内保存を無効にする');
    expect(screen.queryByTestId('log-recording-destination-disabled-mark-card')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('カードが検出されていません');
    expect(screen.getByRole('button', { name: 'カードが検出されていません' })).toBeDisabled();
  });
});
