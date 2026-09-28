import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BLEModal from './BLEModal';
import { recordPerfEvent } from '../utils/renderPerfDiagnostics';

vi.mock('@ionic/react', async () => {
  const actual = await vi.importActual<typeof import('@ionic/react')>('@ionic/react');
  type MockIonModalProps = {
    isOpen?: boolean;
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
  };
  return {
    ...actual,
    IonModal: ({ isOpen, children, className, style }: MockIonModalProps) => (
      isOpen ? <div className={className} style={style}>{children}</div> : null
    ),
  };
});

vi.mock('../utils/renderPerfDiagnostics', () => ({
  recordPerfEvent: vi.fn(),
}));

const noop = vi.fn();

const createBLEModalProps = (
  overrides: Partial<ComponentProps<typeof BLEModal>> = {}
): ComponentProps<typeof BLEModal> => ({
  isOpen: false,
  onDismiss: noop,
  connectionState: 'connected',
  dataState: 'live',
  connectedDevice: { deviceId: 'device-a', name: 'ULSA EVO #1', nodeId: 1 },
  availableDevices: [],
  identifyingDeviceId: null,
  error: null,
  isSupported: true,
  platformInfo: { platform: 'ios', adapterType: 'Capacitor', isSupported: true },
  onScanAndConnect: noop,
  onConnectToDevice: noop,
  onIdentifyDevice: noop,
  onDisconnect: noop,
  onClearError: noop,
  ...overrides,
});

describe('BLEModal', () => {
  it('renders one independent card per device, including duplicate Node IDs, above the fixed rescan footer', () => {
    const devices = ['a', 'b', 'c'].map((id) => ({ deviceId: id, name: 'ULSA EVO #7', nodeId: 7, rssi: -60 }));
    const onConnectToDevice = vi.fn();
    render(<BLEModal {...createBLEModalProps({ isOpen: true, connectionState: 'disconnected',
      connectedDevice: null, availableDevices: devices, onConnectToDevice })} />);
    const cards = document.querySelectorAll('ion-card.ble-device-card');
    expect(cards).toHaveLength(3);
    expect(screen.getByText('検出デバイス · 3台')).toBeInTheDocument();
    for (const [index, card] of Array.from(cards).entries()) {
      expect(card).toHaveAttribute('data-device-id', devices[index].deviceId);
      fireEvent.click(card.querySelector('.ble-device-connect-button')!);
      expect(onConnectToDevice).toHaveBeenLastCalledWith(devices[index]);
    }
    expect(screen.getByText('再検索').closest('ion-footer')).not.toBeNull();
    expect(screen.getByText('再検索').closest('ion-content')).toBeNull();
  });

  it('dismisses from the close button rendered inside the modal header', () => {
    const onDismiss = vi.fn();

    render(<BLEModal {...createBLEModalProps({ isOpen: true, onDismiss })} />);

    fireEvent.click(screen.getByTestId('ble-modal-close'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ble-modal-close').closest('.ble-modal')).not.toBeNull();
  });

  it('renders separate connect and identify buttons without nested interactive controls', () => {
    const onConnectToDevice = vi.fn();
    const onIdentifyDevice = vi.fn();
    const device = { deviceId: 'device-a', name: 'ULSA EVO #1', nodeId: 1, rssi: -55 };

    render(
      <BLEModal
        {...createBLEModalProps({
          isOpen: true,
          connectionState: 'disconnected',
          dataState: 'idle',
          connectedDevice: null,
          availableDevices: [device],
          onConnectToDevice,
          onIdentifyDevice,
        })}
      />
    );

    const connectButton = screen.getByRole('button', { name: 'ULSA EVO #1 に接続' });
    const identifyButton = screen.getByRole('button', { name: 'ULSA EVO #1 のLEDを点滅してさがす' });

    expect(connectButton.closest('ion-item[button]')).toBeNull();
    expect(identifyButton.closest('ion-item[button]')).toBeNull();
    expect(connectButton.contains(identifyButton)).toBe(false);
    expect(identifyButton).toHaveTextContent('LEDを点滅してさがす');
    expect(screen.getByText('再検索').closest('ion-button')).toHaveClass('ble-rescan-button');

    fireEvent.click(identifyButton);

    expect(onIdentifyDevice).toHaveBeenCalledWith(device);
    expect(onConnectToDevice).not.toHaveBeenCalled();

    connectButton.click();

    expect(onConnectToDevice).toHaveBeenCalledWith(device);
    expect(screen.getByLabelText('BLE電波強度: 非常に良好')).toBeInTheDocument();
    expect(screen.queryByText(/RSSI:/)).not.toBeInTheDocument();
  });

  it('keeps the light button available while scanning detected devices', () => {
    const onConnectToDevice = vi.fn();
    const onIdentifyDevice = vi.fn();
    const device = { deviceId: 'device-a', name: 'ULSA EVO #1', nodeId: 1, rssi: -55 };

    render(
      <BLEModal
        {...createBLEModalProps({
          isOpen: true,
          connectionState: 'scanning',
          dataState: 'idle',
          connectedDevice: null,
          availableDevices: [device],
          onConnectToDevice,
          onIdentifyDevice,
        })}
      />
    );

    expect(screen.getByText('デバイスを検索中...')).toBeInTheDocument();
    expect(screen.queryByText('デバイスを選択中...')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'ULSA EVO #1 に接続' })).toBeDisabled();
    expect(screen.getByLabelText('ULSA EVO #1 のLEDを点滅してさがす')).toBeEnabled();
    fireEvent.click(screen.getByLabelText('ULSA EVO #1 のLEDを点滅してさがす'));
    screen.getByRole('button', { name: 'ULSA EVO #1 に接続' }).click();

    expect(onIdentifyDevice).toHaveBeenCalledWith(device);
    expect(onConnectToDevice).not.toHaveBeenCalled();
  });

  it('shows a clockwise estimate after identify is pressed and keeps waiting if BLE has not finished', () => {
    vi.useFakeTimers();
    try {
      const device = { deviceId: 'device-a', name: 'ULSA EVO #1', nodeId: 1, rssi: -55 };
      const props = createBLEModalProps({
        isOpen: true,
        connectionState: 'disconnected',
        dataState: 'idle',
        connectedDevice: null,
        availableDevices: [device],
      });
      const { rerender } = render(<BLEModal {...props} />);

      fireEvent.click(screen.getByRole('button', { name: 'ULSA EVO #1 のLEDを点滅してさがす' }));
      const estimatingButton = screen.getByRole('button', { name: 'ULSA EVO #1 のLED点滅を準備中…' });
      expect(estimatingButton).toBeDisabled();
      expect(estimatingButton.querySelector('.ble-identify-progress path')).toHaveAttribute('pathLength', '100');

      rerender(<BLEModal {...props} identifyingDeviceId="device-a" />);
      act(() => vi.advanceTimersByTime(4000));
      expect(screen.getByRole('button', { name: 'ULSA EVO #1 の通信中…' })).toBeDisabled();

      rerender(<BLEModal {...props} identifyingDeviceId={null} />);
      expect(screen.getByRole('button', { name: 'ULSA EVO #1 のLEDをご確認ください' })).toBeDisabled();
      act(() => vi.advanceTimersByTime(2000));
      expect(screen.getByRole('button', { name: 'ULSA EVO #1 のLEDを点滅してさがす' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('announces Japanese scan and connection states as a polite live status', () => {
    const props = createBLEModalProps({
      isOpen: true,
      connectionState: 'scanning',
      dataState: 'idle',
      connectedDevice: null,
    });
    const { rerender } = render(<BLEModal {...props} />);

    const scanningStatus = screen.getByRole('status', { name: 'BLE接続状態' });
    expect(scanningStatus).toHaveAttribute('aria-live', 'polite');
    expect(scanningStatus).toHaveAttribute('aria-atomic', 'true');
    expect(scanningStatus).toHaveTextContent('デバイスを検索中...');

    rerender(<BLEModal {...props} connectionState="connecting" />);

    expect(screen.getByRole('status', { name: 'BLE接続状態' })).toHaveTextContent('接続中...');
  });

  it('announces unsupported BLE and connection errors as alerts', () => {
    render(
      <BLEModal
        {...createBLEModalProps({
          isOpen: true,
          connectionState: 'disconnected',
          dataState: 'idle',
          connectedDevice: null,
          isSupported: false,
          error: 'BLEの利用を許可してください',
        })}
      />
    );

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent('このブラウザ/デバイスではBLEがサポートされていません');
    expect(alerts[1]).toHaveTextContent('BLEの利用を許可してください');
    expect(screen.getByLabelText('接続エラーを閉じる')).toBeInTheDocument();
  });

  it('keeps searching natively after an ordinary no-device result without requiring another button press', () => {
    render(
      <BLEModal
        {...createBLEModalProps({
          isOpen: true,
          connectionState: 'disconnected',
          dataState: 'idle',
          connectedDevice: null,
          error: 'ULSAデバイスが見つかりませんでした',
          isContinuousNativeScanActive: true,
        })}
      />
    );

    expect(screen.getByText('ULSAを捜索中...')).toBeInTheDocument();
    expect(screen.getByText('ULSA EVOを継続して捜索しています。電源を入れると一覧に表示されます')).toBeInTheDocument();
    expect(screen.queryByText('ULSAデバイスが見つかりませんでした')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /デバイスに接続|再検索/ })).not.toBeInTheDocument();
  });

  it('skips closed rerenders when only live BLE state props change', () => {
    const perfRecord = vi.mocked(recordPerfEvent);
    perfRecord.mockClear();
    const closedProps = createBLEModalProps();

    const { rerender } = render(<BLEModal {...closedProps} />);

    expect(perfRecord).toHaveBeenCalledWith('BLEModal.render');

    perfRecord.mockClear();
    rerender(
      <BLEModal
        {...closedProps}
        dataState="stale"
        error="temporary error"
      />
    );

    expect(perfRecord).not.toHaveBeenCalledWith('BLEModal.render');
    expect(screen.queryByText('BLE接続')).not.toBeInTheDocument();
  });

  it('shows only BLE connection controls for a connected device', () => {
    render(
      <BLEModal
        {...createBLEModalProps({
          isOpen: true,
          connectionState: 'connected',
          dataState: 'live',
        })}
      />
    );

    expect(screen.getByText('接続中のデバイス')).toBeInTheDocument();
    expect(screen.getByText('ULSA EVO #1')).toBeInTheDocument();
    expect(screen.getByLabelText('BLE電波強度: 取得待ち')).toBeInTheDocument();
    expect(document.querySelector('.lucide-radio-tower')).toBeInTheDocument();
    expect(document.querySelector('.lucide-bluetooth')).not.toBeInTheDocument();
    expect(screen.getByText('切断')).toBeInTheDocument();
    expect(screen.queryByText('I2C設定')).not.toBeInTheDocument();
    expect(screen.queryByText('カード')).not.toBeInTheDocument();
    expect(screen.queryByText('RTC時刻')).not.toBeInTheDocument();
  });

  it('uses platform information for Web Bluetooth guidance without showing diagnostics', () => {
    render(
      <BLEModal
        {...createBLEModalProps({
          isOpen: true,
          connectionState: 'disconnected',
          dataState: 'idle',
          connectedDevice: null,
          platformInfo: {
            platform: 'web',
            adapterType: 'WebBluetooth',
            isSupported: true,
            browserName: 'Safari',
            secureContext: false,
            webBluetoothAvailable: false,
          },
        })}
      />
    );

    expect(screen.getByText('ボタンを押すと、ブラウザのデバイス選択画面が表示されます')).toBeInTheDocument();
    expect(screen.queryByText('Safari')).not.toBeInTheDocument();
    expect(screen.queryByText('HTTP')).not.toBeInTheDocument();
    expect(screen.queryByText('No Web BLE')).not.toBeInTheDocument();
  });
});
