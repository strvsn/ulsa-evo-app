import { describe, expect, it } from 'vitest';
import { NumericRingBuffer } from './RingBuffer';

describe('NumericRingBuffer', () => {
  it('returns latest values with min and max in insertion order', () => {
    const buffer = new NumericRingBuffer(5);

    [3, -1, 7, 2].forEach((value) => buffer.push(value));

    expect(buffer.getLatestWithStats()).toEqual({
      values: [3, -1, 7, 2],
      min: -1,
      max: 7,
    });
  });

  it('returns latest window stats after wraparound', () => {
    const buffer = new NumericRingBuffer(4);

    [10, 20, -5, 40, 3, 8].forEach((value) => buffer.push(value));

    expect(buffer.getLatestWithStats(3)).toEqual({
      values: [40, 3, 8],
      min: 3,
      max: 40,
    });
  });

  it('keeps empty min and max compatible with existing numeric helpers', () => {
    const buffer = new NumericRingBuffer(4);

    expect(buffer.getLatestWithStats()).toEqual({
      values: [],
      min: 0,
      max: 0,
    });
    expect(buffer.getMin()).toBe(0);
    expect(buffer.getMax()).toBe(0);
  });
});
