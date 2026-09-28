import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  Esp32OtaHttpStatus,
  Esp32OtaSession,
} from '../../services/ota/esp32OtaTransfer';
import type { NativeSoftApJoinResult } from '../../services/ota/nativeSoftAp';
import { OtaSessionDetails } from './OtaSessionDetails';

const session: Esp32OtaSession = {
  ssid: 'ULSA-UPDATE-7',
  password: 'session-password',
  token: 'session-token',
  ip: '192.168.4.1',
  nodeId: 7,
};

const wifiJoinResult: NativeSoftApJoinResult = {
  ssid: session.ssid,
  connected: true,
  alreadyAssociated: true,
};

const httpStatus: Esp32OtaHttpStatus = {
  state: 'ready',
  portalActive: true,
  updating: false,
  nodeId: 7,
  ssid: session.ssid,
  progress: 42,
  uploadedBytes: 42,
  totalBytes: 100,
  remainingSeconds: 12,
  firmwareVersion: '1.2.3',
  error: null,
};

describe('OtaSessionDetails', () => {
  it('preserves the session, Wi-Fi, and ESP32 status values', () => {
    render(
      <OtaSessionDetails
        session={session}
        wifiJoinResult={wifiJoinResult}
        httpStatus={httpStatus}
        transferBusy={false}
        onRefreshHttpStatus={vi.fn()}
        onCopySessionValue={vi.fn()}
      />
    );

    expect(screen.getByText(session.ssid)).toBeInTheDocument();
    expect(screen.getByText(session.password)).toBeInTheDocument();
    expect(screen.getByText(session.ip)).toBeInTheDocument();
    expect(screen.getByText('接続済み')).toBeInTheDocument();
    expect(screen.getByText('ready / 42%')).toBeInTheDocument();
    expect(screen.getByText('12s')).toBeInTheDocument();
  });

  it('keeps refresh disabled while transferring and preserves copy callback values', () => {
    const onRefreshHttpStatus = vi.fn();
    const onCopySessionValue = vi.fn();
    const { rerender } = render(
      <OtaSessionDetails
        session={session}
        wifiJoinResult={wifiJoinResult}
        httpStatus={httpStatus}
        transferBusy
        onRefreshHttpStatus={onRefreshHttpStatus}
        onCopySessionValue={onCopySessionValue}
      />
    );

    const refreshButton = screen.getByRole('button', { name: '状態' });
    expect(refreshButton).toBeDisabled();
    fireEvent.click(refreshButton);
    expect(onRefreshHttpStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'SSID' }));
    fireEvent.click(screen.getByRole('button', { name: 'PASS' }));
    expect(onCopySessionValue).toHaveBeenNthCalledWith(1, 'SSID', session.ssid);
    expect(onCopySessionValue).toHaveBeenNthCalledWith(2, 'PASS', session.password);

    rerender(
      <OtaSessionDetails
        session={session}
        wifiJoinResult={wifiJoinResult}
        httpStatus={httpStatus}
        transferBusy={false}
        onRefreshHttpStatus={onRefreshHttpStatus}
        onCopySessionValue={onCopySessionValue}
      />
    );
    fireEvent.click(refreshButton);
    expect(onRefreshHttpStatus).toHaveBeenCalledOnce();
  });
});
