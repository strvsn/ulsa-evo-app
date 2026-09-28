import { describe, expect, it } from 'vitest';
import {
  LED_BRIGHTNESS_LEVELS,
  buildLEDBrightnessPayload,
  getLedBrightnessLevel,
  normalizeLedBrightness,
  parseLEDBrightnessStatus,
} from './ledBrightness';

describe('LED brightness levels', () => {
  it('keeps the eight ESP32 brightness values in ascending order', () => {
    expect(LED_BRIGHTNESS_LEVELS).toEqual([0, 16, 32, 50, 75, 110, 170, 255]);
  });

  it('normalizes arbitrary legacy values to the nearest available level', () => {
    expect(normalizeLedBrightness(0)).toBe(0);
    expect(normalizeLedBrightness(61)).toBe(50);
    expect(normalizeLedBrightness(250)).toBe(255);
    expect(getLedBrightnessLevel(50)).toBe(3);
  });

  it('writes a canonical one-byte brightness value', () => {
    expect([...buildLEDBrightnessPayload(61)]).toEqual([50]);
  });

  it('parses the raw characteristic status for legacy firmware migration', () => {
    const value = new DataView(new Uint8Array([61]).buffer);
    expect(parseLEDBrightnessStatus(value)).toEqual({ brightness: 61 });
  });
});
