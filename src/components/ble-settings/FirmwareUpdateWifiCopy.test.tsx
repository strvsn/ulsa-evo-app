import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FirmwareUpdateWizard } from './FirmwareUpdateWizard';

vi.mock('@ionic/react', async () => ({
  ...await vi.importActual('@ionic/react'),
  IonModal: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) => isOpen ? <div>{children}</div> : null,
}));

const session = { ssid: 'ULSA-EVO-OTA-A1B', password: 'test-password', token: 'test-only', ip: '192.168.4.1' };
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const setClipboard = (value: unknown) => Object.defineProperty(navigator, 'clipboard', { configurable: true, value });

afterEach(() => {
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

describe('OTA manual Wi-Fi password copy', () => {
  it.each([
    ['ESP32', 'manualWifi'], ['STM32', 'manualWifi'],
    ['ESP32', 'error'], ['STM32', 'error'],
  ] as const)('copies the current %s password in %s without starting an OTA operation', async (target, stage) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const onConnect = vi.fn();
    const onDismiss = vi.fn();
    render(<FirmwareUpdateWizard isOpen target={target} stage={stage} busy={false}
      manualSession={session} primaryAction={{ label: '接続を確認', run: onConnect }} onDismiss={onDismiss} />);
    const button = screen.getByRole('button', { name: 'Wi-Fiパスワードをコピー' });
    expect(button).toHaveAttribute('data-control-size', 'M44');
    expect(button).toHaveTextContent(session.password);
    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(session.password);
    expect(await screen.findByRole('status')).toHaveTextContent('パスワードをコピーしました');
    expect(onConnect).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'denied'] as const)('provides manual-entry guidance when clipboard is %s', async (result) => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    setClipboard(result === 'unavailable' ? undefined : { writeText });
    render(<FirmwareUpdateWizard isOpen target="ESP32" stage="manualWifi" busy={false}
      manualSession={session} primaryAction={null} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Wi-Fiパスワードをコピー' }));
    expect(await screen.findByRole('status')).toHaveTextContent('コピーできませんでした。パスワードを手入力してください。');
    expect(screen.queryByText('パスワードをコピーしました')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wi-Fiパスワードをコピー' })).toHaveTextContent(session.password);
  });

  it('clears stale feedback when the OTA session changes and copies the new password', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const props = { isOpen: true, target: 'STM32' as const, stage: 'manualWifi' as const, busy: false,
      primaryAction: null, onDismiss: vi.fn() };
    const { rerender } = render(<FirmwareUpdateWizard {...props} manualSession={session} />);
    fireEvent.click(screen.getByRole('button', { name: 'Wi-Fiパスワードをコピー' }));
    await screen.findByRole('status');
    const nextSession = { ...session, password: 'new-password', token: 'next-session' };
    rerender(<FirmwareUpdateWizard {...props} manualSession={nextSession} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Wi-Fiパスワードをコピー' }));
    expect(writeText).toHaveBeenLastCalledWith(nextSession.password);
    expect(await screen.findByRole('status')).toHaveTextContent('パスワードをコピーしました');
  });

  it('does not offer copying for a network without a password', () => {
    render(<FirmwareUpdateWizard isOpen target="ESP32" stage="manualWifi" busy={false}
      manualSession={{ ...session, password: '' }} primaryAction={null} onDismiss={vi.fn()} />);
    expect(screen.getByText('なし')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wi-Fiパスワードをコピー' })).not.toBeInTheDocument();
  });

  it('does not add credentials to native automatic Wi-Fi joining', () => {
    render(<FirmwareUpdateWizard isOpen target="ESP32" stage="error" busy={false} autoJoinAvailable
      manualSession={session} primaryAction={null} onDismiss={vi.fn()} />);
    expect(screen.queryByText(session.ssid)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wi-Fiパスワードをコピー' })).not.toBeInTheDocument();
  });
});
