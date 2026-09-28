import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeviceHealthStatus, RtcTimeStatus } from '../../types/ble';
import { TimePanel } from './TimePanel';

const rtcTimeStatus: RtcTimeStatus = {
  deviceTime: new Date('2026-07-22T01:00:00.000Z'),
  deviceEpochSeconds: 1784682000,
  systemTimeAtRead: new Date(2026, 6, 22, 10, 0, 0),
  offsetMs: 0,
  lastReadAt: 1784682000000,
  supported: true,
  readError: null,
  syncState: 'idle',
  lastSyncAt: null,
  lastSyncOffsetMs: null,
  syncMessage: null,
  zoneId: 367396520,
  zoneName: 'Asia/Tokyo',
  totalUtcOffsetMinutes: 540,
  standardUtcOffsetMinutes: 540,
  dstOffsetMinutes: 0,
  tzdbVersion: '2025b',
  rtcDetected: true,
  rtcReadable: true,
  utcValid: true,
  zoneConfigured: true,
  nvsPersisted: true,
  dstActive: false,
  operationGeneration: 5,
  lastOperation: 'none',
  lastResult: 'ok',
  operationBusy: false,
  deviceError: false,
};

const createHealthStatus = (
  overrides: Partial<DeviceHealthStatus> = {}
): DeviceHealthStatus => ({
  protocolVersion: 2,
  flags: 0,
  bleConnected: true,
  i2cDetected: true,
  rtcAvailable: true,
  cardAvailable: true,
  loggingEnabled: false,
  configDirty: false,
  rebootRequired: false,
  errorActive: false,
  esp32ModeCode: 0,
  esp32LastError: 0,
  stm32RegisterVersion: 0,
  stm32Status: 0,
  stm32LastError: 0,
  localI2cError: 0,
  cardState: 0,
  cardStopReason: 0,
  rtcFlags: 0x07,
  rtcPresent: true,
  rtcRunning: true,
  rtcTimeValid: true,
  rtcVoltageLow: false,
  rtcClockStopped: false,
  ...overrides,
});

const renderPanel = (deviceHealthStatus: DeviceHealthStatus | null) => render(
  <TimePanel
    rtcTimeStatus={rtcTimeStatus}
    deviceHealthStatus={deviceHealthStatus}
    onRefreshRtcTime={vi.fn()}
    onSyncTime={vi.fn()}
    onSetRtcTimezone={vi.fn()}
  />,
);

describe('TimePanel RTC health', () => {
  it('shows a healthy RTC only when the Device Health v2 validity bit is set', () => {
    renderPanel(createHealthStatus());

    expect(screen.getByText('RTC利用可能')).toBeInTheDocument();
    expect(screen.queryByText('RTC利用可能・要同期')).not.toBeInTheDocument();
  });

  it('requires explicit time synchronization after a voltage-low event', () => {
    renderPanel(createHealthStatus({
      rtcFlags: 0x0b,
      rtcTimeValid: false,
      rtcVoltageLow: true,
    }));

    expect(screen.getByText('RTC使用不可・電池なし／電圧低下')).toBeInTheDocument();
    expect(screen.getByText(/RTCバックアップ電池が未装着、または電圧が低下/)).toBeInTheDocument();
    expect(screen.queryByText('RTC利用可能')).not.toBeInTheDocument();
  });

  it('shows the device timezone as source of truth and writes only after an explicit action', async () => {
    const onSyncTime = vi.fn();
    render(
      <TimePanel
        rtcTimeStatus={rtcTimeStatus}
        deviceHealthStatus={createHealthStatus()}
        onRefreshRtcTime={vi.fn()}
        onSyncTime={onSyncTime}
        onSetRtcTimezone={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Asia/Tokyo').length).toBeGreaterThan(0);
    expect(screen.getByText('UTC+09:00')).toBeInTheDocument();
    expect(screen.queryByText('地域だけ保存')).not.toBeInTheDocument();
    expect(screen.getByTestId('rtc-time-sync').closest('.rtc-time-actions')).toBeInTheDocument();
    expect(screen.getByTestId('rtc-time-sync')).toHaveClass('device-setting-save');
    expect(onSyncTime).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('rtc-time-sync')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('rtc-time-sync'));
    expect(onSyncTime).toHaveBeenCalledWith(367396520);
  });

  it('formats device local time from its reported offset instead of the host TZDB', () => {
    render(
      <TimePanel
        rtcTimeStatus={{
          ...rtcTimeStatus,
          zoneId: 506099284,
          zoneName: 'America/New_York',
          totalUtcOffsetMinutes: -240,
        }}
        deviceHealthStatus={createHealthStatus()}
        onRefreshRtcTime={vi.fn()}
        onSyncTime={vi.fn()}
        onSetRtcTimezone={vi.fn()}
      />,
    );

    expect(screen.getByText('2026/07/21 21:00:00')).toBeInTheDocument();
  });

  it('does not label UTC fallback as local time when the device zone is unresolved', () => {
    render(
      <TimePanel
        rtcTimeStatus={{
          ...rtcTimeStatus,
          zoneId: 0x12345678,
          zoneName: null,
          totalUtcOffsetMinutes: 0,
          readError: '本体の地域IDをこのアプリのTZDBで解決できません。地域を再設定してください',
        }}
        deviceHealthStatus={createHealthStatus()}
        onRefreshRtcTime={vi.fn()}
        onSyncTime={vi.fn()}
        onSetRtcTimezone={vi.fn()}
      />,
    );

    expect(screen.getByText('未解決 ID 305419896')).toBeInTheDocument();
    expect(screen.queryByText('UTC+00:00')).not.toBeInTheDocument();
    expect(screen.queryByText('2026/07/22 01:00:00')).not.toBeInTheDocument();
  });

  it('disables timezone writes for an older unsupported firmware', () => {
    render(
      <TimePanel
        rtcTimeStatus={{ ...rtcTimeStatus, supported: false }}
        deviceHealthStatus={createHealthStatus()}
        onRefreshRtcTime={vi.fn()}
        onSyncTime={vi.fn()}
        onSetRtcTimezone={vi.fn()}
      />,
    );

    expect(screen.getByText('地域設定非対応')).toBeInTheDocument();
    expect(screen.getByTestId('rtc-time-sync')).toHaveAttribute('data-control-interaction', 'disabled');
    expect(screen.getByText(/通常計測は継続できます/)).toBeInTheDocument();
  });
});
