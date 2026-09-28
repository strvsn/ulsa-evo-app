import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BLESignalStrength from './BLESignalStrength';
import { getBLESignalStrengthLevel } from './bleSignalStrengthUtils';

describe('BLESignalStrength', () => {
  it('maps the shared RSSI value to four familiar signal bars', () => {
    expect(getBLESignalStrengthLevel(undefined)).toBe(0);
    expect(getBLESignalStrengthLevel(-92)).toBe(1);
    expect(getBLESignalStrengthLevel(-80)).toBe(2);
    expect(getBLESignalStrengthLevel(-67)).toBe(3);
    expect(getBLESignalStrengthLevel(-55)).toBe(4);
  });

  it('exposes a textual equivalent without displaying a dBm value', () => {
    render(<BLESignalStrength rssi={-62} />);

    const indicator = screen.getByLabelText('BLE電波強度: 良好');
    expect(indicator).toHaveAttribute('data-level', '3');
    expect(indicator.querySelectorAll('[data-active="true"]')).toHaveLength(3);
    expect(indicator).not.toHaveTextContent('dBm');
  });

  it('marks Web Bluetooth RSSI as unavailable instead of implying a pending live read', () => {
    render(<BLESignalStrength unavailable />);

    const indicator = screen.getByLabelText('BLE電波強度: ブラウザーでは取得不可');
    expect(indicator).toHaveAttribute('data-level', '0');
    expect(indicator).toHaveAttribute('data-available', 'false');
  });
});
