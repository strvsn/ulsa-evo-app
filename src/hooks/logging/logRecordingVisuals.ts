import type { BrowserLogStatus, LogRecordingMode } from '../../services/browserLog';

export type LogRecordingDestination = 'card' | 'browser';
export type LogRecordingDestinationState = 'disabled' | 'ready' | 'recording' | 'error';

export interface LogRecordingDestinationStatus {
  destination: LogRecordingDestination;
  selected: boolean;
  state: LogRecordingDestinationState;
  detail?: string;
}

/**
 * Every new recording session requires a live BLE connection. Once connected,
 * the card logger remains optional: card availability only blocks modes that
 * actually include the card destination.
 */
export const isLogRecordingStartBlocked = ({
  mode,
  connectionState,
  cardLogButtonDisabled,
}: {
  mode: LogRecordingMode;
  connectionState: 'connected' | string;
  cardLogButtonDisabled: boolean;
}): boolean => connectionState !== 'connected' || mode === 'none' || (
  (mode === 'card' || mode === 'dual') && cardLogButtonDisabled
);

type RecordingDestinationOptions = {
  mode: LogRecordingMode;
  connectionState: 'connected' | string;
  cardLoggingActive: boolean;
  cardAvailable: boolean;
  cardErrorActive: boolean;
  cardActivityNotice?: string;
  cardStopReasonCode?: number | null;
  browserLogStatus: BrowserLogStatus;
};

const modeUsesBrowser = (mode: LogRecordingMode): boolean => mode === 'browser' || mode === 'dual';
const modeUsesCard = (mode: LogRecordingMode): boolean => mode === 'card' || mode === 'dual';

export const formatCardLogErrorDetail = (stopReasonCode?: number | null): string => {
  switch (stopReasonCode) {
    case 2:
      return '書込遅延';
    case 3:
      return '書込失敗';
    case 4:
      return 'FILE異常';
    case 6:
      return '容量不足';
    case 7:
      return '復旧失敗';
    default:
      return '異常';
  }
};

export const formatLogRecordingElapsed = (elapsedSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(elapsedSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainderSeconds = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainderSeconds).padStart(2, '0')}`;
};

export const getLogRecordingDestinations = ({
  mode,
  connectionState,
  cardLoggingActive,
  cardAvailable,
  cardErrorActive,
  cardActivityNotice,
  cardStopReasonCode,
  browserLogStatus,
}: RecordingDestinationOptions): LogRecordingDestinationStatus[] => {
  const cardSelected = modeUsesCard(mode) || cardLoggingActive;
  const browserSelected = modeUsesBrowser(mode) || browserLogStatus.active;
  const cardState: LogRecordingDestinationState = cardActivityNotice ? 'ready' : cardErrorActive
    ? 'error'
    : cardLoggingActive
      ? 'recording'
      : modeUsesCard(mode) && cardAvailable && connectionState === 'connected'
        ? 'ready'
        : 'disabled';
  const browserState: LogRecordingDestinationState = browserLogStatus.error
    ? 'error'
    : browserLogStatus.active
      ? 'recording'
      : modeUsesBrowser(mode)
        ? 'ready'
        : 'disabled';

  return [
    {
      destination: 'card',
      selected: cardSelected,
      state: cardState,
      ...(cardState === 'error' ? { detail: formatCardLogErrorDetail(cardStopReasonCode) } : {}),
      ...(cardActivityNotice ? { detail: cardActivityNotice } : {}),
    },
    { destination: 'browser', selected: browserSelected, state: browserState },
  ];
};
