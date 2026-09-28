import { describe, expect, it } from 'vitest';
import { normalizeBleUserMessage } from './normalizeBleUserMessage';

describe('normalizeBleUserMessage', () => {
  it('normalizes external Bluetooth branding without regard to letter case', () => {
    expect(normalizeBleUserMessage('Bluetooth is unavailable')).toBe('BLE is unavailable');
    expect(normalizeBleUserMessage('bluetooth permission denied')).toBe('BLE permission denied');
    expect(normalizeBleUserMessage('BLUETOOTH adapter failed')).toBe('BLE adapter failed');
  });

  it('normalizes every occurrence while preserving the rest of the message', () => {
    expect(normalizeBleUserMessage('Bluetooth scan: bluetooth adapter unavailable'))
      .toBe('BLE scan: BLE adapter unavailable');
  });

  it('collapses long and short low-energy names to one BLE label', () => {
    expect(normalizeBleUserMessage('Bluetooth Low Energy unavailable'))
      .toBe('BLE unavailable');
    expect(normalizeBleUserMessage('BluetoothLE permission denied'))
      .toBe('BLE permission denied');
    expect(normalizeBleUserMessage('bluetooth-le adapter stopped'))
      .toBe('BLE adapter stopped');
  });

  it('preserves messages that do not contain the external branding', () => {
    expect(normalizeBleUserMessage('Device connection timed out')).toBe('Device connection timed out');
    expect(normalizeBleUserMessage('')).toBe('');
  });

  it('returns an empty message for non-string input without exposing its contents', () => {
    expect(normalizeBleUserMessage(undefined)).toBe('');
    expect(normalizeBleUserMessage(null)).toBe('');
    expect(normalizeBleUserMessage(new Error('Bluetooth stack failed'))).toBe('');
    expect(normalizeBleUserMessage({ message: 'Bluetooth stack failed' })).toBe('');
  });
});
