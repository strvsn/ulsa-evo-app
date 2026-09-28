import { describe, expect, it } from 'vitest';
import { MAX_REFERENCE_WIND_SAMPLES, ReferenceWindSpeedWindow } from './derivedWindMetrics';

describe('ReferenceWindSpeedWindow', () => {
  it('averages all valid received speeds, including calm samples, and retains the observed maximum', () => {
    const window = new ReferenceWindSpeedWindow();
    window.push(0, 1_000);
    window.push(1, 2_000);
    window.push(1, 3_000);
    window.push(Number.NaN, 4_000);

    expect(window.getAverage(4_000)).toBe(0.67);
    expect(window.getObservedMax(4_000)).toBe(1);
  });

  it('expires samples against the current time even without a new notification', () => {
    const window = new ReferenceWindSpeedWindow(10, 1_000);
    window.push(4, 1_000);
    window.push(2, 1_500);
    expect(window.getAverage(2_000)).toBe(3);
    expect(window.getObservedMax(2_001)).toBe(2);
    expect(window.getAverage(2_501)).toBeNull();
    expect(window.getObservedMax(2_501)).toBeNull();
  });

  it('retains a full ten minutes at the supported 50 Hz source rate', () => {
    const window = new ReferenceWindSpeedWindow();
    for (let index = 0; index < 30_000; index++) {
      window.push(index === 0 ? 10 : 1, 1_000 + index * 20);
    }
    expect(window.length).toBe(30_000);
    expect(window.getAverage(600_980)).toBe(1);
    expect(window.getObservedMax(600_980)).toBe(10);
    window.push(1, 601_020);
    expect(window.getObservedMax(601_020)).toBe(1);
  });

  it('fails closed when more samples than the capacity fit inside the ten-minute window', () => {
    const window = new ReferenceWindSpeedWindow(3, 10_000);
    for (const timestamp of [1_000, 2_000, 3_000, 4_000]) window.push(2, timestamp);
    expect(window.getAverage(4_000)).toBeNull();
    expect(window.getObservedMax(4_000)).toBeNull();
    expect(window.getAverage(12_001)).toBe(2);
    expect(window.getObservedMax(12_001)).toBe(2);
  });

  it('matches an independent scan across irregular cadence and ring wraparound', () => {
    const window = new ReferenceWindSpeedWindow(64, 1_000);
    const history: Array<{ speed: number; timestampMs: number }> = [];
    let nowMs = 0;
    for (let index = 0; index < 200; index++) {
      nowMs += index % 3 === 0 ? 17 : 31;
      const speed = index % 11 === 0 ? Number.NaN : (index * 7 % 19) / 10;
      window.push(speed, nowMs);
      if (Number.isFinite(speed)) history.push({ speed, timestampMs: nowMs });
      const current = history.filter((sample) => sample.timestampMs >= nowMs - 1_000);
      if (current.length === 0) {
        expect(window.getAverage(nowMs)).toBeNull();
        expect(window.getObservedMax(nowMs)).toBeNull();
        continue;
      }
      const mean = current.reduce((sum, sample) => sum + sample.speed, 0) / current.length;
      const expectedAverage = Math.round((mean + Number.EPSILON) * 100) / 100;
      expect(window.getAverage(nowMs)).toBe(expectedAverage);
      expect(window.getObservedMax(nowMs)).toBe(Math.max(...current.map((sample) => sample.speed)));
    }
  });

  it('ignores an out-of-order sample without losing the existing window', () => {
    const window = new ReferenceWindSpeedWindow();
    window.push(9, 10_000);
    expect(window.getAverage(9_000)).toBeNull();
    window.push(2, 8_000);
    window.push(1, 11_000);
    expect(window.getAverage(11_000)).toBe(5);
    window.clear();
    expect(window.getAverage(11_000)).toBeNull();
  });

  it('reserves enough slots for 50 Hz plus a timing margin', () => {
    expect(MAX_REFERENCE_WIND_SAMPLES).toBeGreaterThan(30_000);
  });
});
