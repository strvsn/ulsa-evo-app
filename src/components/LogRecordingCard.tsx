import { IconDatabase } from '@tabler/icons-react';
import { AppWindow, CirclePlay, CircleStop, Database } from 'lucide-react';
import {
  type LogRecordingDestination,
  type LogRecordingDestinationStatus,
} from '../hooks/logging/logRecordingVisuals';
import { NativeControlButton } from './controls';
import { memo } from 'react';

type LogRecordingCardProps = {
  active: boolean;
  disabled: boolean;
  hasError: boolean;
  modeLabel: string;
  elapsedLabel: string;
  actionTitle: string;
  destinations: LogRecordingDestinationStatus[];
  canChangeDestinations: boolean;
  onToggleDestination: (destination: LogRecordingDestination) => void;
  onToggle: () => void;
};

const destinationLabel = (destination: LogRecordingDestinationStatus['destination']) =>
  destination === 'card' ? 'カード内保存' : 'アプリ内保存';

const destinationDisplayLabel = (destination: LogRecordingDestination, recording: boolean) =>
  recording
    ? destination === 'card' ? 'カード内記録中' : 'アプリ内記録中'
    : destinationLabel(destination);

const destinationStateLabel = (state: LogRecordingDestinationStatus['state']) => ({
  disabled: '無効',
  ready: '利用可能',
  recording: '記録中',
  error: '異常',
})[state];

const destinationOrder: LogRecordingDestination[] = ['card', 'browser'];

const areLogRecordingCardPropsEqual = (
  previous: LogRecordingCardProps,
  next: LogRecordingCardProps,
): boolean => (
  previous.active === next.active &&
  previous.disabled === next.disabled &&
  previous.hasError === next.hasError &&
  previous.modeLabel === next.modeLabel &&
  previous.elapsedLabel === next.elapsedLabel &&
  previous.actionTitle === next.actionTitle &&
  previous.canChangeDestinations === next.canChangeDestinations &&
  previous.onToggleDestination === next.onToggleDestination &&
  previous.onToggle === next.onToggle &&
  previous.destinations.length === next.destinations.length &&
  previous.destinations.every((destination, index) => (
    destination.destination === next.destinations[index]?.destination &&
    destination.selected === next.destinations[index]?.selected &&
    destination.state === next.destinations[index]?.state &&
    destination.detail === next.destinations[index]?.detail
  ))
);

const destinationToggleLabel = (
  destination: LogRecordingDestination,
  state: LogRecordingDestinationStatus['state'],
  selected: boolean,
  canChange: boolean
) => {
  const label = destinationLabel(destination);
  if (state === 'recording') return `${label}は記録中のため変更できません`;
  if (!canChange) return `${label}はログ操作中のため変更できません`;
  return selected ? `${label}を無効にする` : `${label}を有効にする`;
};

const DestinationIcon = ({ destination }: Pick<LogRecordingDestinationStatus, 'destination'>) => (
  destination === 'card'
    ? <IconDatabase className="ulsa-icon" data-testid="log-recording-destination-icon-card" size={14} stroke={1.9} aria-hidden="true" />
    : <AppWindow className="ulsa-icon" data-testid="log-recording-destination-icon-browser" size={14} strokeWidth={1.9} aria-hidden="true" />
);

export const LogRecordingCard = memo(({
  active,
  disabled,
  hasError,
  modeLabel,
  elapsedLabel,
  actionTitle,
  destinations,
  canChangeDestinations,
  onToggleDestination,
  onToggle,
}: LogRecordingCardProps) => {
  const destinationStatuses = new Map(destinations.map((status) => [status.destination, status]));
  const appRecordingActive = destinationStatuses.get('browser')?.state === 'recording';

  return (
    <section
      className={`log-recording-card ${active ? 'is-active' : ''} ${hasError ? 'has-recording-error' : ''}`}
      data-testid="log-recording-card"
      data-log-mode={modeLabel}
    >
      <div className="log-recording-card-content">
        <div className="log-recording-card-identity">
          <Database
            className="log-recording-card-icon ulsa-icon"
            data-testid="log-recording-icon"
            size={21}
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <span className="log-recording-card-title">ログ</span>
        </div>

        <div className="log-recording-card-destinations" aria-label="保存先の状態">
          {destinationOrder.map((destination) => {
            const status = destinationStatuses.get(destination);
            const state = status?.state ?? 'disabled';
            const detail = status?.detail;
            const selected = status?.selected ?? false;
            const stateLabel = [
              `${destinationLabel(destination)}: ${selected && state === 'disabled' ? '選択中・利用不可' : destinationStateLabel(state)}`,
              detail,
            ].filter(Boolean).join('、');
            const toggleLabel = destinationToggleLabel(destination, state, selected, canChangeDestinations);
            return (
              <NativeControlButton
                key={destination}
                controlSize="M44"
                selectionState={selected ? 'on' : 'off'}
                tone={state === 'ready' ? 'success' : state === 'error' ? 'warning' : 'neutral'}
                className={`log-recording-card-destination is-${state} ${selected ? 'is-selected' : 'is-unselected'}`}
                data-testid={`log-recording-destination-${destination}`}
                aria-label={`${stateLabel}。${toggleLabel}`}
                aria-pressed={selected}
                title={toggleLabel}
                disabled={!canChangeDestinations || state === 'recording'}
                onClick={() => onToggleDestination(destination)}
              >
                <span className="log-recording-card-destination-icon-wrap">
                  <DestinationIcon destination={destination} />
                  {!selected && (
                    <span
                      className="log-recording-card-destination-disabled-mark"
                      data-testid={`log-recording-destination-disabled-mark-${destination}`}
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="log-recording-card-destination-label">
                  {destinationDisplayLabel(destination, state === 'recording')}
                </span>
                {detail && (
                  <span
                    className="log-recording-card-destination-detail"
                    data-testid={`log-recording-destination-detail-${destination}`}
                    aria-hidden="true"
                  >
                    {detail}
                  </span>
                )}
              </NativeControlButton>
            );
          })}
        </div>

        {appRecordingActive && (
          <div className="log-recording-card-metric log-recording-card-elapsed-metric">
            <span className="log-recording-card-metric-label">アプリ内記録時間</span>
            <time
              className="log-recording-card-elapsed"
              data-testid="log-recording-elapsed"
              aria-label="アプリ内ログの経過時間"
            >
              {elapsedLabel}
            </time>
          </div>
        )}

        <NativeControlButton
          controlSize="M44"
          controlVariant={active ? 'destructive' : 'primary'}
          tone={active ? 'danger' : 'accent'}
          selectionState={active ? 'on' : 'off'}
          className="log-recording-card-action"
          data-testid="log-recording-action"
          onClick={onToggle}
          disabled={disabled}
          title={actionTitle}
          aria-label={actionTitle}
        >
          {active
            ? <CircleStop className="ulsa-icon" size={17} strokeWidth={1.9} aria-hidden="true" />
            : <CirclePlay className="ulsa-icon" size={17} strokeWidth={1.9} aria-hidden="true" />}
          <span>{active ? '停止' : '開始'}</span>
        </NativeControlButton>
      </div>
      {disabled && !active && (
        <p className="log-recording-card-disabled-reason" role="status">{actionTitle}</p>
      )}
    </section>
  );
}, areLogRecordingCardPropsEqual);
