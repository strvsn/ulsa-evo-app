import { describe, expect, it } from 'vitest';
import { userFirmwareLabel } from './userFirmwareLabel';

describe('userFirmwareLabel', () => {
  it('shows the public firmware version without the internal revision', () => {
    expect(userFirmwareLabel({
      tagName: 'esp32-fw-v1.0.3-r5',
      title: 'ESP32 1.0.3',
      latest: true,
    })).toBe('v1.0.3 / 最新');
  });

  it('keeps the public version label for field-style STM32 tags', () => {
    expect(userFirmwareLabel({
      tagName: 'stm32-1.0.0-field.3',
      title: 'STM32 1.0.0',
      latest: false,
    })).toBe('v1.0.0');
  });
});
