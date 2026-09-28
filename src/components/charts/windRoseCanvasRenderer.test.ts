import { describe, expect, it, vi } from 'vitest';
import { drawWindRoseCanvas } from './windRoseCanvasRenderer';
import type { WindRoseMotionFrame } from './windRoseMotionModel';
import {
  WIND_ROSE_CORE_WIDTH_RATIO,
  WIND_ROSE_GLOW_BLUR_RATIO,
  WIND_ROSE_INNER_GLOW_BLUR_RATIO,
} from './windRoseTheme';

const createContext = () => ({
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  measureText: vi.fn((value: string) => ({ width: value.length * 10 })),
  restore: vi.fn(),
  save: vi.fn(),
  setLineDash: vi.fn(),
  stroke: vi.fn(),
  quadraticCurveTo: vi.fn(),
}) as unknown as CanvasRenderingContext2D;

const createAuditedContext = () => {
  const strokeWidths: number[] = [];
  const strokeShadowBlurs: number[] = [];
  let currentLineWidth = 1;
  let currentShadowBlur = 0;
  const context = createContext();
  Object.defineProperty(context, 'lineWidth', {
    get: () => currentLineWidth,
    set: (value: number) => { currentLineWidth = value; },
  });
  Object.defineProperty(context, 'shadowBlur', {
    get: () => currentShadowBlur,
    set: (value: number) => { currentShadowBlur = value; },
  });
  vi.mocked(context.stroke).mockImplementation(() => {
    strokeWidths.push(currentLineWidth);
    strokeShadowBlurs.push(currentShadowBlur);
  });
  return { context, strokeWidths, strokeShadowBlurs };
};

const rayActivity = new Float32Array(120);
rayActivity[41] = 0.36;
rayActivity[42] = 0.65;
rayActivity[43] = 0.28;

const frame: WindRoseMotionFrame = {
  speedMps: 4.25,
  normalizedSpeed: 0.65,
  peakDirectionDegrees: 127,
  angularVelocityDegreesPerSecond: 0,
  movementDirection: 0,
  rayActivity,
  needsAnimation: false,
};

describe('drawWindRoseCanvas center metrics', () => {
  it('keeps live rays on the screen-relative sensor lattice when compass heading changes', () => {
    const context = createContext();
    const northOnlyActivity = new Float32Array(120);
    northOnlyActivity[0] = 1;

    drawWindRoseCanvas(context, {
      width: 320,
      height: 320,
      frame: { ...frame, peakDirectionDegrees: 0, rayActivity: northOnlyActivity },
      unit: 'm/s',
      hasCurrentWindData: true,
      isTilted: false,
      tiltDegrees: 50,
      theme: 'graphite',
      trueHeading: 90,
      headingAccuracy: 3,
    });

    const outerRadius = 320 * 0.44;
    const topStarts = vi.mocked(context.moveTo).mock.calls.filter(([x, y]) => (
      Math.abs(Number(x) - 160) < 0.0001
      && Math.abs(Number(y) - (160 - outerRadius)) < 0.0001
    ));
    const rightStarts = vi.mocked(context.moveTo).mock.calls.filter(([x, y]) => (
      Math.abs(Number(x) - (160 + outerRadius)) < 0.0001
      && Math.abs(Number(y) - 160) < 0.0001
    ));

    // One baseline plus three glow/core passes remain at ULSA 0° (screen top).
    // The 90° heading rotates NEWS, not the wind ray itself.
    expect(topStarts).toHaveLength(4);
    expect(rightStarts).toHaveLength(1);
  });

  it('shows a valid calm speed without inventing a wind direction', () => {
    const { context, strokeWidths } = createAuditedContext();
    drawWindRoseCanvas(context, {
      width: 320,
      height: 320,
      frame: {
        ...frame,
        speedMps: 0,
        normalizedSpeed: 0,
        rayActivity: new Float32Array(120),
      },
      unit: 'm/s',
      hasCurrentWindData: true,
      hasCurrentWindDirection: false,
      isTilted: false,
      tiltDegrees: 50,
      theme: 'graphite',
      trueHeading: 12,
      headingAccuracy: 3,
      directionReference: 'trueWind',
    });

    const textCalls = vi.mocked(context.fillText).mock.calls;
    const directionY = 160 - 44.8 / 2;
    const directionCalls = textCalls.filter(([, , y]) => Number(y) === directionY);
    expect(directionCalls.map(([value]) => String(value)).join('')).toBe('--');
    const speedY = 160 + 44.8 / 2;
    expect(textCalls
      .filter(([value, , y]) => /[\d.]/.test(String(value)) && Number(y) === speedY)
      .map(([value]) => String(value))
      .join('')).toBe('0.00');
    expect(textCalls.some(([value]) => value === '真風・参考')).toBe(true);
    // Baseline rays plus four compass cardinal ticks, with no active ray pass.
    expect(strokeWidths).toHaveLength(124);
  });

  it('adds fixed neon layers without changing the existing baseline rays', () => {
    for (const theme of ['graphite', 'slate', 'light'] as const) {
      const { context, strokeWidths, strokeShadowBlurs } = createAuditedContext();
      drawWindRoseCanvas(context, {
        width: 320,
        height: 320,
        frame,
        unit: 'm/s',
        hasCurrentWindData: true,
        isTilted: false,
        tiltDegrees: 50,
        theme,
        trueHeading: null,
        headingAccuracy: null,
      });

      const rayWidth = 320 * 0.007;
      const activeRayCount = 3;
      // The maximum-extension ring remains hidden. All themes keep the same
      // 120 baseline strokes, followed by three fixed passes per active ray.
      expect(context.setLineDash).not.toHaveBeenCalled();
      expect(strokeWidths).toHaveLength(120 + activeRayCount * 3);
      strokeWidths.slice(0, 120).forEach((width) => expect(width).toBeCloseTo(rayWidth, 5));
      strokeWidths.slice(120, 126).forEach((width) => expect(width).toBeCloseTo(rayWidth, 5));
      strokeWidths.slice(126).forEach((width) => (
        expect(width).toBeCloseTo(rayWidth * WIND_ROSE_CORE_WIDTH_RATIO, 5)
      ));
      strokeShadowBlurs.slice(0, 120).forEach((blur) => expect(blur).toBe(0));
      strokeShadowBlurs.slice(120, 123).forEach((blur) => (
        expect(blur).toBeCloseTo(320 * WIND_ROSE_GLOW_BLUR_RATIO, 5)
      ));
      strokeShadowBlurs.slice(123, 126).forEach((blur) => (
        expect(blur).toBeCloseTo(320 * WIND_ROSE_INNER_GLOW_BLUR_RATIO, 5)
      ));
      strokeShadowBlurs.slice(126).forEach((blur) => expect(blur).toBe(0));
    }

    // The 126 degree outer point is visited by its unchanged baseline plus the
    // same three neon passes used by every other active ray.
    const { context } = createAuditedContext();
    drawWindRoseCanvas(context, {
      width: 320,
      height: 320,
      frame,
      unit: 'm/s',
      hasCurrentWindData: true,
      isTilted: false,
      tiltDegrees: 50,
      theme: 'light',
      trueHeading: null,
      headingAccuracy: null,
    });
    const radius = 320 * 0.44;
    const radians = (126 - 90) * Math.PI / 180;
    const expectedX = 160 + Math.cos(radians) * radius;
    const expectedY = 160 + Math.sin(radians) * radius;
    const peakStarts = vi.mocked(context.moveTo).mock.calls.filter(([x, y]) => (
      Math.abs(x - expectedX) < 0.0001 && Math.abs(y - expectedY) < 0.0001
    ));
    expect(peakStarts).toHaveLength(4);
  });

  it('centers the direction and speed numbers independently from their units', () => {
    const context = createContext();
    const textFonts: Array<{ value: string; y: number; font: string }> = [];
    vi.mocked(context.fillText).mockImplementation((value, _x, y) => {
      textFonts.push({ value: String(value), y: Number(y), font: context.font });
    });
    drawWindRoseCanvas(context, {
      width: 320,
      height: 320,
      frame,
      unit: 'm/s',
      hasCurrentWindData: true,
      isTilted: false,
      tiltDegrees: 50,
      theme: 'graphite',
      trueHeading: null,
      headingAccuracy: null,
    });

    const textCalls = vi.mocked(context.fillText).mock.calls;
    expect(textCalls.some(([value]) => value === '風向' || value === '風速')).toBe(false);
    const directionY = 160 - 44.8 / 2;
    const directionCalls = textCalls.filter(([, , y]) => Math.abs(Number(y) - directionY) < 0.0001);
    const directionDigitCalls = directionCalls.filter(([value]) => /\d/.test(String(value)));
    expect(directionDigitCalls.map(([value]) => value).join('')).toBe('127');
    expect(directionDigitCalls.map(([, x]) => x)).toEqual([150, 160, 170]);
    expect(directionCalls.find(([value]) => value === '°')?.[1]).toBeCloseTo(177.56, 5);

    const speedY = 160 + 44.8 / 2;
    const speedCalls = textCalls.filter(([value, , y]) => (
      /[\d.]/.test(String(value)) && Number(y) === speedY
    ));
    expect(speedCalls.map(([value]) => value).join('')).toBe('4.25');
    const speedAdvances = speedCalls.map(([, x]) => Number(x));
    expect((speedAdvances[0] + speedAdvances[speedAdvances.length - 1]) / 2).toBe(160);
    expect((directionY + speedY) / 2).toBe(160);

    const unitCall = textCalls.find(([value]) => value === 'm/s');
    expect(unitCall?.[1]).toBe(160);
    expect(unitCall?.[2]).toBe(speedY + 19.2 + 20);
    const valueFont = textFonts.find(({ value, y }) => value === '1' && y === directionY)?.font;
    const unitFont = textFonts.find(({ value }) => value === 'm/s')?.font;
    expect(valueFont).toContain('700 40px');
    expect(valueFont).toContain('SF Pro Display');
    expect(valueFont).not.toContain('SF Mono');
    expect(unitFont).toContain('700 15.2px');
  });

  it('replaces the upper direction with GNSS ground speed without moving its numeric center', () => {
    const firstContext = createContext();
    const secondContext = createContext();
    const commonInput = {
      width: 320,
      height: 320,
      frame,
      unit: 'km/h' as const,
      hasCurrentWindData: true,
      isTilted: false,
      tiltDegrees: 50,
      theme: 'graphite' as const,
      trueHeading: 90,
      headingAccuracy: 3,
      centerPrimaryMetric: 'groundSpeed' as const,
    };

    drawWindRoseCanvas(firstContext, { ...commonInput, groundSpeedMps: 5 });
    drawWindRoseCanvas(secondContext, { ...commonInput, groundSpeedMps: 12.5 });

    const directionY = 160 - 44.8 / 2;
    const upperDigits = (context: CanvasRenderingContext2D) => vi.mocked(context.fillText).mock.calls
      .filter(([value, , y]) => /[\d.]/.test(String(value)) && Number(y) === directionY);
    const firstDigits = upperDigits(firstContext);
    const secondDigits = upperDigits(secondContext);
    expect(firstDigits.map(([value]) => String(value)).join('')).toBe('18.0');
    expect(secondDigits.map(([value]) => String(value)).join('')).toBe('45.0');
    expect((Number(firstDigits[0][1]) + Number(firstDigits.at(-1)![1])) / 2).toBe(160);
    expect((Number(secondDigits[0][1]) + Number(secondDigits.at(-1)![1])) / 2).toBe(160);

    const firstUnit = vi.mocked(firstContext.fillText).mock.calls.find(([value, , y]) => (
      value === 'km/h' && Number(y) === directionY
    ));
    const secondUnit = vi.mocked(secondContext.fillText).mock.calls.find(([value, , y]) => (
      value === 'km/h' && Number(y) === directionY
    ));
    expect(firstUnit?.[1]).toBe(secondUnit?.[1]);
    expect(vi.mocked(firstContext.fillText).mock.calls.some(([value, , y]) => (
      value === '°' && Number(y) === directionY
    ))).toBe(false);
  });

  it('never leaves a degree suffix while ground speed is waiting for its first GNSS value', () => {
    const context = createContext();
    drawWindRoseCanvas(context, {
      width: 320,
      height: 320,
      frame,
      unit: 'm/s',
      hasCurrentWindData: true,
      isTilted: false,
      tiltDegrees: 50,
      theme: 'graphite',
      trueHeading: 90,
      headingAccuracy: 3,
      centerPrimaryMetric: 'groundSpeed',
      groundSpeedMps: null,
    });

    const directionY = 160 - 44.8 / 2;
    const primaryCalls = vi.mocked(context.fillText).mock.calls
      .filter(([, , y]) => Number(y) === directionY);
    expect(primaryCalls.map(([value]) => String(value)).join('')).toBe('--');
    expect(primaryCalls.some(([value]) => value === '°')).toBe(false);
    expect(primaryCalls.some(([value]) => value === 'm/s')).toBe(false);
  });

  it('uses stable tabular digit positions when same-length values change', () => {
    const firstContext = createContext();
    const secondContext = createContext();
    vi.mocked(firstContext.measureText).mockImplementation((value: string) => ({
      width: value === '1' ? 6 : 10,
    }) as TextMetrics);
    vi.mocked(secondContext.measureText).mockImplementation((value: string) => ({
      width: value === '1' ? 6 : 10,
    }) as TextMetrics);

    const input = {
      width: 320,
      height: 320,
      unit: 'm/s' as const,
      hasCurrentWindData: true,
      isTilted: false,
      tiltDegrees: 50,
      theme: 'graphite' as const,
      trueHeading: null,
      headingAccuracy: null,
    };
    drawWindRoseCanvas(firstContext, {
      ...input,
      frame: { ...frame, peakDirectionDegrees: 111, speedMps: 1.11 },
    });
    drawWindRoseCanvas(secondContext, {
      ...input,
      frame: { ...frame, peakDirectionDegrees: 888, speedMps: 8.88 },
    });

    const directionY = 160 - 44.8 / 2;
    const numericXs = (context: CanvasRenderingContext2D) => vi.mocked(context.fillText).mock.calls
      .filter(([value, , y]) => (
        /\d/.test(String(value)) && Math.abs(Number(y) - directionY) < 0.0001
      ))
      .map(([, x]) => x);
    expect(numericXs(firstContext)).toEqual([150, 160, 170]);
    expect(numericXs(secondContext)).toEqual([150, 160, 170]);
    const suffixX = (context: CanvasRenderingContext2D, suffix: string) => vi.mocked(context.fillText)
      .mock.calls.find(([value]) => value === suffix)?.[1];
    expect(suffixX(firstContext, '°')).toBe(suffixX(secondContext, '°'));
    expect(suffixX(firstContext, 'm/s')).toBe(suffixX(secondContext, 'm/s'));

    const speedXs = (context: CanvasRenderingContext2D) => vi.mocked(context.fillText).mock.calls
      .filter(([value, , y]) => (
        /[\d.]/.test(String(value)) && Number(y) === 160 + 44.8 / 2
      ))
      .map(([, x]) => x);
    expect(speedXs(firstContext)).toEqual(speedXs(secondContext));
    expect((Number(speedXs(firstContext)[0]) + Number(speedXs(firstContext).at(-1))) / 2).toBe(160);
  });

  it('keeps each numeric center fixed across direction and speed digit-count changes', () => {
    const centered = (xs: number[]) => (xs[0] + xs[xs.length - 1]) / 2;
    for (const direction of [9, 10, 99, 100, 359]) {
      const context = createContext();
      drawWindRoseCanvas(context, {
        width: 320,
        height: 320,
        frame: { ...frame, peakDirectionDegrees: direction },
        unit: 'm/s',
        hasCurrentWindData: true,
        isTilted: false,
        tiltDegrees: 50,
        theme: 'graphite',
        trueHeading: null,
        headingAccuracy: null,
      });
      const directionY = 160 - 44.8 / 2;
      const xs = vi.mocked(context.fillText).mock.calls
        .filter(([value, , y]) => (
          /\d/.test(String(value)) && Math.abs(Number(y) - directionY) < 0.0001
        ))
        .map(([, x]) => Number(x));
      expect(centered(xs)).toBe(160);
    }

    for (const { unit, speedMps } of [
      { unit: 'm/s' as const, speedMps: 9.99 },
      { unit: 'm/s' as const, speedMps: 10 },
      { unit: 'km/h' as const, speedMps: 9.9 / 3.6 },
      { unit: 'km/h' as const, speedMps: 10 / 3.6 },
      { unit: 'cm/s' as const, speedMps: 0.09 },
      { unit: 'cm/s' as const, speedMps: 0.1 },
    ]) {
      const context = createContext();
      drawWindRoseCanvas(context, {
        width: 320,
        height: 320,
        frame: { ...frame, speedMps },
        unit,
        hasCurrentWindData: true,
        isTilted: false,
        tiltDegrees: 50,
        theme: 'graphite',
        trueHeading: null,
        headingAccuracy: null,
      });
      const xs = vi.mocked(context.fillText).mock.calls
        .filter(([value, , y]) => (
          /[\d.]/.test(String(value)) && Number(y) === 160 + 44.8 / 2
        ))
        .map(([, x]) => Number(x));
      expect(centered(xs)).toBe(160);
    }
  });

  it('keeps the speed unit centered below the value across digit boundaries and empty-state transitions', () => {
    const cases: Array<{
      unit: 'm/s' | 'km/h' | 'cm/s';
      speedsMps: number[];
    }> = [
      { unit: 'm/s', speedsMps: [0.01, 9.99, 10, 25] },
      { unit: 'km/h', speedsMps: [0.01, 9.9 / 3.6, 10 / 3.6, 25] },
      { unit: 'cm/s', speedsMps: [0.01, 0.1, 9.99, 25] },
    ];

    cases.forEach(({ unit, speedsMps }) => {
      const unitPositions = [...speedsMps.map((speedMps) => ({ speedMps, hasCurrentWindData: true })), {
        speedMps: 0,
        hasCurrentWindData: false,
      }].map(({ speedMps, hasCurrentWindData }) => {
        const context = createContext();
        drawWindRoseCanvas(context, {
          width: 320,
          height: 320,
          frame: { ...frame, speedMps },
          unit,
          hasCurrentWindData,
          isTilted: false,
          tiltDegrees: 50,
          theme: 'graphite',
          trueHeading: null,
          headingAccuracy: null,
        });
        const unitCall = vi.mocked(context.fillText).mock.calls.find(([value]) => value === unit);
        return [Number(unitCall?.[1]), Number(unitCall?.[2])];
      });

      expect(unitPositions).toEqual(unitPositions.map(() => [160, 160 + 44.8 / 2 + 19.2 + 20]));
    });
  });

  it('keeps the empty-state values on the same center coordinate', () => {
    const context = createContext();
    drawWindRoseCanvas(context, {
      width: 320,
      height: 320,
      frame: { ...frame, speedMps: 0, normalizedSpeed: 0 },
      unit: 'km/h',
      hasCurrentWindData: false,
      isTilted: false,
      tiltDegrees: 50,
      theme: 'light',
      trueHeading: null,
      headingAccuracy: null,
    });

    const emptyValueCalls = vi.mocked(context.fillText).mock.calls.filter(([value]) => value === '-');
    expect(emptyValueCalls).toHaveLength(4);
    const emptyRowYs = [...new Set(emptyValueCalls.map((call) => Number(call[2])))];
    expect(emptyRowYs).toEqual([160 - 44.8 / 2, 160 + 44.8 / 2]);
    expect(emptyRowYs.map((rowY) => emptyValueCalls
      .filter((call) => Number(call[2]) === rowY)
      .map((call) => call[1]))).toEqual([
      [155, 165],
      [155, 165],
    ]);
    const unitCall = vi.mocked(context.fillText).mock.calls.find(([value]) => value === 'km/h');
    expect(unitCall?.[1]).toBe(160);
    expect(unitCall?.[2]).toBe(160 + 44.8 / 2 + 19.2 + 20);
  });

  it('keeps every compass cardinal inside the expanded rectangular canvas', () => {
    const context = createContext();
    drawWindRoseCanvas(context, {
      width: 360,
      height: 320,
      frame,
      unit: 'm/s',
      hasCurrentWindData: true,
      isTilted: true,
      tiltDegrees: 50,
      theme: 'light',
      trueHeading: 37,
      headingAccuracy: 13,
    });

    const cardinalCalls = vi.mocked(context.fillText).mock.calls.filter(([value]) => (
      ['N', 'E', 'S', 'W'].includes(String(value))
    ));
    expect(cardinalCalls).toHaveLength(4);
    cardinalCalls.forEach(([, x]) => {
      expect(x).toBeGreaterThan(8);
      expect(x).toBeLessThan(352);
    });
    const trueNorthLabel = vi.mocked(context.fillText).mock.calls.find(([value]) => (
      value === '真北基準'
    ));
    expect(trueNorthLabel?.[1]).toBe(180);
  });

  it('draws each held bank in its own color behind the current live activity', () => {
    const context = createContext();
    const strokeStyles: Array<string | CanvasGradient | CanvasPattern> = [];
    let currentStrokeStyle: string | CanvasGradient | CanvasPattern = '#000000';
    Object.defineProperty(context, 'strokeStyle', {
      get: () => currentStrokeStyle,
      set: (value: string | CanvasGradient | CanvasPattern) => { currentStrokeStyle = value; },
    });
    vi.mocked(context.stroke).mockImplementation(() => { strokeStyles.push(currentStrokeStyle); });
    const heldActivities = [0, 1, 2].map((index) => {
      const activity = new Float32Array(120);
      activity[index] = 0.8;
      return activity;
    });

    drawWindRoseCanvas(context, {
      width: 320,
      height: 320,
      frame,
      unit: 'm/s',
      hasCurrentWindData: true,
      isTilted: true,
      tiltDegrees: 50,
      theme: 'graphite',
      trueHeading: null,
      headingAccuracy: null,
      peakHolds: heldActivities.map((activity, bankIndex) => ({
        bankIndex: bankIndex as 0 | 1 | 2,
        rayActivity: activity,
        speedMps: 3.2,
        displayDirectionDegrees: bankIndex * 3,
        displayRotationDegrees: 0,
        directionReference: 'ulsa',
      })),
    });

    expect(strokeStyles).toHaveLength(132);
    expect(strokeStyles.slice(120, 123)).toEqual(['#FFB547', '#7FE58A', '#FF7FAF']);
    expect(strokeStyles.slice(123)).toEqual([
      expect.not.stringMatching(/#FFB547|#7FE58A|#FF7FAF/),
      expect.not.stringMatching(/#FFB547|#7FE58A|#FF7FAF/),
      expect.not.stringMatching(/#FFB547|#7FE58A|#FF7FAF/),
      expect.not.stringMatching(/#FFB547|#7FE58A|#FF7FAF/),
      expect.not.stringMatching(/#FFB547|#7FE58A|#FF7FAF/),
      expect.not.stringMatching(/#FFB547|#7FE58A|#FF7FAF/),
      expect.not.stringMatching(/#FFB547|#7FE58A|#FF7FAF/),
      expect.not.stringMatching(/#FFB547|#7FE58A|#FF7FAF/),
      expect.not.stringMatching(/#FFB547|#7FE58A|#FF7FAF/),
    ]);
  });
});
