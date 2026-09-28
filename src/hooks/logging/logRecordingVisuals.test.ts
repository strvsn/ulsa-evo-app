import { describe, expect, it } from 'vitest';
import { createEmptyBrowserLogStatus } from '../../services/browserLog';
import type { BrowserLogStatus } from '../../services/browserLog';
import {
  formatCardLogErrorDetail,
  formatLogRecordingElapsed,
  getLogRecordingDestinations,
  isLogRecordingStartBlocked,
} from './logRecordingVisuals';

const activeBrowserLog: BrowserLogStatus = {
  ...createEmptyBrowserLogStatus(),
  active: true,
  sessionId: 'session',
  rowCount: 12,
  segmentCount: 1,
  completedSegmentCount: 0,
  currentSegmentStartedAt: 0,
  lastSampleAt: 0,
  bufferedBytes: 1024,
  storedSessionCount: 1,
  storedSegmentCount: 1,
  storedRowCount: 12,
  storedBytes: 1024,
  hasExportableData: true,
  error: null,
};

const idleBrowserLog: BrowserLogStatus = {
  ...createEmptyBrowserLogStatus(),
  active: false,
  sessionId: null,
  currentSegmentStartedAt: null,
};

describe('logRecordingVisuals', () => {
  it('shows a paused or recovering card without claiming active recording', () => {
    for (const notice of ['計測待機', '復旧中']) {
      expect(getLogRecordingDestinations({
        mode: 'card', connectionState: 'connected', cardLoggingActive: true,
        cardAvailable: true, cardErrorActive: false, cardActivityNotice: notice,
        browserLogStatus: idleBrowserLog,
      })[0]).toEqual({ destination: 'card', selected: true, state: 'ready', detail: notice });
    }
    expect(formatCardLogErrorDetail(6)).toBe('容量不足');
    expect(formatCardLogErrorDetail(7)).toBe('復旧失敗');
  });
  it('requires BLE before starting while keeping card availability irrelevant to app-only logging', () => {
    expect(isLogRecordingStartBlocked({ mode: 'browser', connectionState: 'connected', cardLogButtonDisabled: true })).toBe(false);
    expect(isLogRecordingStartBlocked({ mode: 'browser', connectionState: 'disconnected', cardLogButtonDisabled: false })).toBe(true);
    expect(isLogRecordingStartBlocked({ mode: 'card', connectionState: 'connected', cardLogButtonDisabled: true })).toBe(true);
    expect(isLogRecordingStartBlocked({ mode: 'dual', connectionState: 'connected', cardLogButtonDisabled: true })).toBe(true);
    expect(isLogRecordingStartBlocked({ mode: 'none', connectionState: 'connected', cardLogButtonDisabled: false })).toBe(true);
  });

  it('formats elapsed time as an unbounded HH:MM:SS counter', () => {
    expect(formatLogRecordingElapsed(0)).toBe('00:00:00');
    expect(formatLogRecordingElapsed(75)).toBe('00:01:15');
    expect(formatLogRecordingElapsed(6000)).toBe('01:40:00');
    expect(formatLogRecordingElapsed(99999)).toBe('27:46:39');
    expect(formatLogRecordingElapsed(360000)).toBe('100:00:00');
  });

  it('always shows both destinations and isolates an Card failure in dual recording', () => {
    expect(getLogRecordingDestinations({
      mode: 'dual',
      connectionState: 'connected',
      cardLoggingActive: false,
      cardAvailable: false,
      cardErrorActive: true,
      cardStopReasonCode: 3,
      browserLogStatus: activeBrowserLog,
    })).toEqual([
      { destination: 'card', selected: true, state: 'error', detail: '書込失敗' },
      { destination: 'browser', selected: true, state: 'recording' },
    ]);
  });

  it('formats Card stop reasons as short card-safe labels', () => {
      expect(formatCardLogErrorDetail(2)).toBe('書込遅延');
    expect(formatCardLogErrorDetail(3)).toBe('書込失敗');
      expect(formatCardLogErrorDetail(4)).toBe('FILE異常');
    expect(formatCardLogErrorDetail(255)).toBe('異常');
  });

  it('keeps an unselected destination muted while a connected configured destination is ready', () => {
    expect(getLogRecordingDestinations({
      mode: 'browser',
      connectionState: 'connected',
      cardLoggingActive: false,
      cardAvailable: false,
      cardErrorActive: false,
      browserLogStatus: idleBrowserLog,
    })).toEqual([
      { destination: 'card', selected: false, state: 'disabled' },
      { destination: 'browser', selected: true, state: 'ready' },
    ]);
  });

  it('keeps app-only logging ready while BLE is disconnected', () => {
    expect(getLogRecordingDestinations({
      mode: 'browser',
      connectionState: 'disconnected',
      cardLoggingActive: false,
      cardAvailable: false,
      cardErrorActive: false,
      browserLogStatus: idleBrowserLog,
    })).toEqual([
      { destination: 'card', selected: false, state: 'disabled' },
      { destination: 'browser', selected: true, state: 'ready' },
    ]);
  });

  it('keeps selection separate from Card availability and unrelated App storage errors', () => {
    const unavailableCard = getLogRecordingDestinations({
      mode: 'card', connectionState: 'connected', cardLoggingActive: false,
      cardAvailable: false, cardErrorActive: false, browserLogStatus: idleBrowserLog,
    });
    expect(unavailableCard[0]).toMatchObject({ destination: 'card', selected: true, state: 'disabled' });
    expect(unavailableCard[1]).toMatchObject({ destination: 'browser', selected: false });

    const appStorageError = getLogRecordingDestinations({
      mode: 'card', connectionState: 'connected', cardLoggingActive: false,
      cardAvailable: false, cardErrorActive: false,
      browserLogStatus: { ...idleBrowserLog, error: 'IndexedDB unavailable' },
    });
    expect(appStorageError[1]).toMatchObject({ destination: 'browser', selected: false, state: 'error' });
  });
});
