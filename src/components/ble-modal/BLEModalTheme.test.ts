import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const visualStyles = readFileSync(
  'src/components/ble-modal/styles/modal-visual-refresh.css',
  'utf8',
);
const responsiveStyles = readFileSync(
  'src/components/ble-modal/styles/modal-theme-responsive.css',
  'utf8',
);

describe('BLE modal theme contrast', () => {
  it('keeps the identify bulb visible on the light device card', () => {
    expect(visualStyles).toMatch(
      /\.ble-modal-light \.ble-identify-button\s*\{[\s\S]*?--color:\s*#9a4b00;[\s\S]*?border-color:\s*#9a4b00;[\s\S]*?color:\s*#9a4b00;/,
    );
    expect(visualStyles).toMatch(
      /\.ble-modal-light \.ble-identify-button ion-icon\s*\{[\s\S]*?color:\s*#9a4b00;[\s\S]*?opacity:\s*1;/,
    );
  });

  it('keeps both device actions 44px tall and the connect action wider', () => {
    expect(responsiveStyles).toMatch(
      /\.ble-device-actions\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.55fr\) minmax\(104px, 0\.9fr\);/,
    );
    expect(responsiveStyles).toMatch(
      /\.ble-device-connect-button\s*\{[\s\S]*?height:\s*44px;[\s\S]*?min-height:\s*44px;/,
    );
    expect(responsiveStyles).toMatch(
      /\.ble-identify-button\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?height:\s*44px;[\s\S]*?min-height:\s*44px;/,
    );
  });

  it('keeps the identify border visible in both themes', () => {
    expect(responsiveStyles).toMatch(
      /\.ble-identify-button\s*\{[\s\S]*?border:\s*1px solid rgba\(255, 232, 140, 0\.68\);/,
    );
  });
});
