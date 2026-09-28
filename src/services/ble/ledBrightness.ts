import type { LEDBrightnessStatus } from '../../types/ble';

// Keep these raw values aligned with ESP32 LedBrightnessLevels. The BLE
// characteristic remains a single uint8 so older firmware can still receive
// a valid brightness value.
export const LED_BRIGHTNESS_LEVELS = [0, 16, 32, 50, 75, 110, 170, 255] as const;

export const normalizeLedBrightness = (brightness: number): number => {
  const clamped = Math.max(0, Math.min(255, Math.round(brightness)));
  return LED_BRIGHTNESS_LEVELS.reduce((closest, candidate) => (
    Math.abs(candidate - clamped) < Math.abs(closest - clamped) ? candidate : closest
  ));
};

export const getLedBrightnessLevel = (brightness: number): number =>
  LED_BRIGHTNESS_LEVELS.findIndex((value) => value === normalizeLedBrightness(brightness));

export const parseLEDBrightnessStatus = (value: DataView): LEDBrightnessStatus => {
  if (value.byteLength < 1) {
    throw new Error(`LED Brightness payload too short: ${value.byteLength}`);
  }

  return {
    brightness: value.getUint8(0),
  };
};

export const buildLEDBrightnessPayload = (brightness: number): Uint8Array => {
  return new Uint8Array([normalizeLedBrightness(brightness)]);
};
