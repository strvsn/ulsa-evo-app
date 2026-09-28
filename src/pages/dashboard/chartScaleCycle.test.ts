import { describe, expect, it } from 'vitest';
import { getNextChartScaleMode } from './chartScaleCycle';

describe('getNextChartScaleMode', () => {
  it('cycles each chart through its supported scale modes', () => {
    expect(getNextChartScaleMode('windSpeed', 'fixed')).toBe(0.3);
    expect(getNextChartScaleMode('windSpeed', 10)).toBe('auto');
    expect(getNextChartScaleMode('temperature', 60)).toBe('auto');
    expect(getNextChartScaleMode('soundSpeed', 400)).toBe('auto');
    expect(getNextChartScaleMode('windDirection', 'fixed')).toBe('auto');
  });

  it('recovers an unsupported current value at the first supported mode', () => {
    expect(getNextChartScaleMode('windDirection', 5)).toBe('auto');
  });
});
