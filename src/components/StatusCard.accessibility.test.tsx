import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StatusCard from './StatusCard';
import type { DisplaySampleListener } from '../hooks/ble/types';
import { createEmptySensorData } from '../services/ble/sensorDataDefaults';

const { recordPerfEvent } = vi.hoisted(() => ({
  recordPerfEvent: vi.fn(),
}));

vi.mock('../utils/renderPerfDiagnostics', () => ({ recordPerfEvent }));

describe('StatusCard accessibility', () => {
  beforeEach(() => {
    recordPerfEvent.mockClear();
  });

  it('identifies missing standard measurements after three seconds without changing connection semantics', () => {
    vi.useFakeTimers();
    let publish!: DisplaySampleListener;
    const subscribeDisplaySamples = vi.fn((listener: DisplaySampleListener) => {
      publish = listener;
      return vi.fn();
    });
    try {
      const { rerender } = render(
        <StatusCard
          connectionState="connected"
          dataState="live"
          deviceName="ULSA EVO #123"
          subscribeDisplaySamples={subscribeDisplaySamples}
          onClick={vi.fn()}
        />
      );
      act(() => publish({
        latestSample: createEmptySensorData(),
        standardFieldReceivedAt: { windDirection: 100 },
        lastStandardReceivedAt: 100,
      }));
      expect(screen.getByRole('status')).toHaveTextContent('BLE接続状態: LIVE');
      act(() => vi.advanceTimersByTime(3000));
      expect(screen.getByRole('status')).toHaveTextContent(
        'BLE接続状態: 一部データ受信。ULSA EVO #123 風速・温度を受信できません'
      );

      act(() => publish({
        latestSample: createEmptySensorData(),
        standardFieldReceivedAt: { windDirection: 100, windSpeed: 200, temperature: 300 },
        lastStandardReceivedAt: 300,
      }));
      expect(screen.getByRole('status')).toHaveTextContent('BLE接続状態: LIVE');
      rerender(<StatusCard connectionState="disconnected" dataState="idle" deviceName={null}
        subscribeDisplaySamples={subscribeDisplaySamples} onClick={vi.fn()} />);
      expect(screen.getByRole('status')).toHaveTextContent('BLE接続状態: 未接続');
    } finally {
      vi.useRealTimers();
    }
  });

  it('announces Japanese BLE connection and data-state changes politely', () => {
    const { rerender } = render(
      <StatusCard
        connectionState="scanning"
        dataState="idle"
        deviceName={null}
        onClick={vi.fn()}
      />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveTextContent('BLE接続状態: スキャン中。デバイスを検索中...');

    rerender(
      <StatusCard
        connectionState="connecting"
        dataState="idle"
        deviceName={null}
        onClick={vi.fn()}
      />
    );

    expect(status).toHaveTextContent('BLE接続状態: 接続中...。デバイスへ接続中...');

    rerender(
      <StatusCard
        connectionState="connected"
        dataState="live"
        deviceName="ULSA EVO #1"
        signalRssi={-55}
        onClick={vi.fn()}
      />
    );

    expect(status).toHaveTextContent('BLE接続状態: LIVE。ULSA EVO #1 データ受信中');

    rerender(
      <StatusCard
        connectionState="connected"
        dataState="live"
        deviceName="ULSA EVO #1"
        sensorStatus={{ sensorStatus: 0, statusProtocolVersion: 2, activeCause: 3 }}
        onClick={vi.fn()}
      />
    );

    expect(status).toHaveTextContent('BLE接続状態: 計測無効。ULSA EVO #1: 高温保護');

    rerender(
      <StatusCard
        connectionState="connected"
        dataState="live"
        deviceName="ULSA EVO #1"
        sensorStatus={{
          sensorStatus: 1,
          statusProtocolVersion: 3,
          statusFlags: 0xc0,
          serviceStatus: 0,
          activeCause: 2,
        }}
        onClick={vi.fn()}
      />
    );

    expect(status).toHaveTextContent('BLE接続状態: 低温警告。ULSA EVO #1: 低温警告');

    rerender(
      <StatusCard
        connectionState="connected"
        dataState="stale"
        deviceName="ULSA EVO #1"
        sensorStatus={{
          sensorStatus: 1,
          statusProtocolVersion: 3,
          statusFlags: 0xc0,
          serviceStatus: 0,
          activeCause: 2,
        }}
        onClick={vi.fn()}
      />
    );

    expect(status).toHaveTextContent('BLE接続状態: データ停止。ULSA EVO #1 からのデータが停止しています（最終状態: 低温警告）');

    rerender(
      <StatusCard
        connectionState="connected"
        dataState="live"
        deviceName="ULSA EVO #1"
        sensorStatus={{
          sensorStatus: 0,
          statusProtocolVersion: 2,
          statusFlags: 0,
          serviceStatus: 0,
          activeCause: 0,
        }}
        onClick={vi.fn()}
      />
    );

    expect(status).toHaveTextContent('BLE接続状態: データ待ち。ULSA EVO #1 のデータを待機中');

    rerender(
      <StatusCard
        connectionState="connected"
        dataState="live"
        deviceName="ULSA EVO #1"
        sensorStatus={{
          sensorStatus: 0,
          statusProtocolVersion: 2,
          statusFlags: 0x90,
          serviceStatus: 0x10,
          activeCause: 0,
        }}
        onClick={vi.fn()}
      />
    );

    expect(status).toHaveTextContent('BLE接続状態: 計測無効。ULSA EVO #1: 再起動が必要');
  });

  it('does not rerender for new sensor snapshots when the displayed status fields are unchanged', () => {
    const onClick = vi.fn();
    const firstSnapshot = {
      sensorStatus: 1,
      statusProtocolVersion: 2,
      statusFlags: 0x80,
      serviceStatus: 0,
      activeCause: 0,
      windSpeed: 1,
    };
    const { rerender } = render(
      <StatusCard
        connectionState="connected"
        dataState="live"
        deviceName="ULSA EVO #1"
        sensorStatus={firstSnapshot}
        onClick={onClick}
      />
    );
    expect(recordPerfEvent).toHaveBeenCalledTimes(1);

    const nextMeasurementSnapshot = { ...firstSnapshot, windSpeed: 2 };
    rerender(
      <StatusCard
        connectionState="connected"
        dataState="live"
        deviceName="ULSA EVO #1"
        sensorStatus={nextMeasurementSnapshot}
        onClick={onClick}
      />
    );
    expect(recordPerfEvent).toHaveBeenCalledTimes(1);

    rerender(
      <StatusCard
        connectionState="connected"
        dataState="live"
        deviceName="ULSA EVO #1"
        sensorStatus={{ ...firstSnapshot, sensorStatus: 0, activeCause: 3 }}
        onClick={onClick}
      />
    );
    expect(recordPerfEvent).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('計測無効');
  });
});
