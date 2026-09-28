import { describe, expect, it, vi } from 'vitest';
import { drawWindRoseCompassReference, getTrueHeadingDirectionLabel } from './windRoseCompass';
import { createWindRoseGeometry, projectWindRosePoint } from './windRoseGaugeMath';

const createContext = () => {
  const shadowBlurs: number[] = [];
  const text: Array<{ value: string; x: number; y: number; font: string; color: string }> = [];
  const context = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn((value: string, x: number, y: number) => {
      text.push({ value, x, y, font: context.font, color: String(context.fillStyle) });
    }),
    font: '',
    lineTo: vi.fn(),
    measureText: vi.fn((value: string) => ({ width: value.length * 8 })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(context, 'shadowBlur', {
    get: () => shadowBlurs.at(-1) ?? 0,
    set: (value: number) => { shadowBlurs.push(value); },
  });
  return { context, shadowBlurs, text };
};

describe('drawWindRoseCompassReference', () => {
  it('maps the iPhone true heading to all 16 Japanese and English compass labels', () => {
    expect(getTrueHeadingDirectionLabel(0)).toEqual({ japanese: '北', english: 'N' });
    expect(getTrueHeadingDirectionLabel(22.5)).toEqual({ japanese: '北北東', english: 'NNE' });
    expect(getTrueHeadingDirectionLabel(45)).toEqual({ japanese: '北東', english: 'NE' });
    expect(getTrueHeadingDirectionLabel(67.5)).toEqual({ japanese: '東北東', english: 'ENE' });
    expect(getTrueHeadingDirectionLabel(90)).toEqual({ japanese: '東', english: 'E' });
    expect(getTrueHeadingDirectionLabel(112.5)).toEqual({ japanese: '東南東', english: 'ESE' });
    expect(getTrueHeadingDirectionLabel(135)).toEqual({ japanese: '南東', english: 'SE' });
    expect(getTrueHeadingDirectionLabel(157.5)).toEqual({ japanese: '南南東', english: 'SSE' });
    expect(getTrueHeadingDirectionLabel(180)).toEqual({ japanese: '南', english: 'S' });
    expect(getTrueHeadingDirectionLabel(202.5)).toEqual({ japanese: '南南西', english: 'SSW' });
    expect(getTrueHeadingDirectionLabel(225)).toEqual({ japanese: '南西', english: 'SW' });
    expect(getTrueHeadingDirectionLabel(247.5)).toEqual({ japanese: '西南西', english: 'WSW' });
    expect(getTrueHeadingDirectionLabel(270)).toEqual({ japanese: '西', english: 'W' });
    expect(getTrueHeadingDirectionLabel(292.5)).toEqual({ japanese: '西北西', english: 'WNW' });
    expect(getTrueHeadingDirectionLabel(315)).toEqual({ japanese: '北西', english: 'NW' });
    expect(getTrueHeadingDirectionLabel(337.5)).toEqual({ japanese: '北北西', english: 'NNW' });
    expect(getTrueHeadingDirectionLabel(359.9)).toEqual({ japanese: '北', english: 'N' });
  });

  it('draws the rotating north cardinal in red while keeping the other cardinals neutral', () => {
    const size = 320;
    const { context, text } = createContext();
    drawWindRoseCompassReference(
      context, size + 56, size, (size + 56) / 2, size / 2,
      createWindRoseGeometry({ size }), 45, 3, size, false, 50, true,
    );

    expect(text.find(({ value }) => value === 'N')?.color).toBe('#c5162e');
    expect(text.find(({ value }) => value === 'E')?.color).toBe('#244550');
  });

  it('draws the screen-forward 16-point direction above the accuracy fan in two lines', () => {
    const size = 320;
    const width = size + 56;
    const { context, text } = createContext();
    drawWindRoseCompassReference(
      context,
      width,
      size,
      width / 2,
      size / 2,
      createWindRoseGeometry({ size }),
      112.5,
      13,
      size,
      true,
      50,
      true,
    );

    const japanese = text.find(({ value }) => value === '東南東');
    const english = text.find(({ value }) => value === 'ESE');
    expect(japanese?.x).toBe(width / 2);
    expect(english?.x).toBe(width / 2);
    expect(Number(japanese?.y)).toBeLessThan(Number(english?.y));
    expect(Number(english?.y)).toBeLessThan(Number(text.find(({ value }) => value === '±13°')?.y));
  });

  it('draws a rounded, feathered accuracy fan outside the radial gauge with no outline', () => {
    const size = 320;
    const width = size + 56;
    const geometry = createWindRoseGeometry({ size });
    const { context, shadowBlurs, text } = createContext();
    drawWindRoseCompassReference(
      context,
      width,
      size,
      width / 2,
      size / 2,
      geometry,
      0,
      13,
      size,
      true,
      50,
      false,
    );

    // Only the four cardinal ticks are stroked; the fan itself is borderless.
    expect(context.stroke).toHaveBeenCalledTimes(4);
    expect(context.fill).toHaveBeenCalledTimes(3);
    expect(context.quadraticCurveTo).toHaveBeenCalledTimes(12);
    const [haloBlur, bodyBlur, coreBlur] = shadowBlurs;
    expect(haloBlur).toBeGreaterThanOrEqual(size * 0.045);
    expect(bodyBlur).toBeGreaterThanOrEqual(size * 0.032);
    expect(coreBlur).toBeGreaterThanOrEqual(size * 0.022);
    expect(haloBlur).toBeGreaterThan(bodyBlur);
    expect(bodyBlur).toBeGreaterThan(coreBlur);
    expect(text.find(({ value }) => value === '±13°')).toBeDefined();

    // The three fills use staggered geometry rather than repainting one hard
    // polygon, so their outer/side edges fade instead of forming one boundary.
    expect(context.moveTo).toHaveBeenCalledTimes(7);
    const fanStarts = vi.mocked(context.moveTo).mock.calls.slice(0, 3);
    expect(new Set(fanStarts.map(([x, y]) => `${Number(x).toFixed(3)},${Number(y).toFixed(3)}`)).size)
      .toBe(3);

    const expectedNorthOuter = projectWindRosePoint({
      centerX: width / 2,
      centerY: size / 2,
      radius: size * 0.685,
      angle: 0,
      size,
      isTilted: true,
      tiltDegrees: 50,
    });
    const hasNorthOuter = [
      ...vi.mocked(context.moveTo).mock.calls,
      ...vi.mocked(context.lineTo).mock.calls,
    ].some(([x, y]) => (
      Math.abs(Number(x) - expectedNorthOuter.x) < 0.0001
      && Math.abs(Number(y) - expectedNorthOuter.y) < 0.0001
    ));
    expect(hasNorthOuter).toBe(true);

    const expectedAccuracyLabel = projectWindRosePoint({
      centerX: width / 2,
      centerY: size / 2,
      radius: size * 0.66,
      angle: 0,
      size,
      isTilted: true,
      tiltDegrees: 50,
    });
    const accuracyLabel = text.find(({ value }) => value === '±13°');
    expect(accuracyLabel?.x).toBeCloseTo(expectedAccuracyLabel.x, 5);
    expect(accuracyLabel?.y).toBeCloseTo(expectedAccuracyLabel.y, 5);
    expect(accuracyLabel?.font).toContain('8px');

    // The fitted fan, including its glow inset, stays inside the existing canvas.
    const fanPoints = [
      ...vi.mocked(context.moveTo).mock.calls.slice(0, 3),
      ...vi.mocked(context.lineTo).mock.calls,
      ...vi.mocked(context.quadraticCurveTo).mock.calls.flatMap(([controlX, controlY, x, y]) => (
        [[controlX, controlY], [x, y]]
      )),
    ];
    const safeInset = Math.max(10, size * 0.045);
    fanPoints.forEach(([x, y]) => {
      expect(Number(x)).toBeGreaterThanOrEqual(safeInset - 0.01);
      expect(Number(x)).toBeLessThanOrEqual(width - safeInset + 0.01);
      expect(Number(y)).toBeGreaterThanOrEqual(safeInset - 0.01);
      expect(Number(y)).toBeLessThanOrEqual(size - safeInset + 0.01);
    });
  });

  it('places the accuracy value beyond the fixed top cardinal orbit', () => {
    const size = 320;
    const width = size + 56;
    const { context, text } = createContext();
    drawWindRoseCompassReference(
      context,
      width,
      size,
      width / 2,
      size / 2,
      createWindRoseGeometry({ size }),
      0,
      13,
      size,
      true,
      50,
      true,
    );

    const north = text.find(({ value }) => value === 'N');
    const accuracy = text.find(({ value }) => value === '±13°');
    expect(north).toBeDefined();
    expect(accuracy).toBeDefined();
    const northHalfHeight = Math.max(12, size * 0.044) * 0.62;
    const accuracyHalfHeight = Math.max(8, size * 0.022) * 0.62;
    expect(Number(accuracy?.y) + accuracyHalfHeight)
      .toBeLessThan(Number(north?.y) - northHalfHeight);
  });

  it('fits wide accuracy sectors and their glow inside the existing canvas', () => {
    for (const size of [245, 320, 390]) {
      const width = size + 56;
      const safeInset = Math.max(10, size * 0.045);
      for (const tiltDegrees of [45, 50, 60]) {
        for (const accuracy of [0, 13, 45, 90, 179]) {
          const { context } = createContext();
          drawWindRoseCompassReference(
            context,
            width,
            size,
            width / 2,
            size / 2,
            createWindRoseGeometry({ size }),
            0,
            accuracy,
            size,
            true,
            tiltDegrees,
            true,
          );
          const fanPoints = [
            ...vi.mocked(context.moveTo).mock.calls,
            ...vi.mocked(context.lineTo).mock.calls,
            ...vi.mocked(context.quadraticCurveTo).mock.calls.flatMap(([controlX, controlY, x, y]) => (
              [[controlX, controlY], [x, y]]
            )),
          ];
          fanPoints.forEach(([x, y]) => {
            expect(Number(x)).toBeGreaterThanOrEqual(safeInset - 0.01);
            expect(Number(x)).toBeLessThanOrEqual(width - safeInset + 0.01);
            expect(Number(y)).toBeGreaterThanOrEqual(safeInset - 0.01);
            expect(Number(y)).toBeLessThanOrEqual(size - safeInset + 0.01);
          });
        }
      }
    }
  });

  it('keeps enlarged cardinals inside the canvas for supported tilt angles and headings', () => {
    for (const size of [245, 320, 390]) {
      const width = size + 56;
      const geometry = createWindRoseGeometry({ size });
      for (const tiltDegrees of [45, 50, 60]) {
        for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
          const { context, text } = createContext();
          drawWindRoseCompassReference(
            context,
            width,
            size,
            width / 2,
            size / 2,
            geometry,
            heading,
            13,
            size,
            true,
            tiltDegrees,
            true,
          );
          const cardinalFontSize = Math.max(12, size * 0.044);
          const cardinals = text.filter(({ value, font }) => (
            ['N', 'E', 'S', 'W'].includes(value)
            && font.includes(`${cardinalFontSize}px`)
          ));
          expect(cardinals).toHaveLength(4);
          cardinals.forEach(({ value, x, y, font }) => {
            const fontSize = cardinalFontSize;
            expect(font).toContain(`${fontSize}px`);
            expect(x - fontSize * 0.52).toBeGreaterThanOrEqual(0);
            expect(x + fontSize * 0.52).toBeLessThanOrEqual(width);
            expect(y - fontSize * 0.62).toBeGreaterThanOrEqual(0);
            expect(y + fontSize * 0.62).toBeLessThanOrEqual(size);
            const bearing = value === 'N'
              ? 0
              : value === 'E'
                ? 90
                : value === 'S'
                  ? 180
                  : 270;
            const expected = projectWindRosePoint({
              centerX: width / 2,
              centerY: size / 2,
              radius: size * 0.505,
              angle: (bearing - heading + 360) % 360,
              size,
              isTilted: true,
              tiltDegrees,
            });
            expect(x).toBeCloseTo(expected.x, 5);
            expect(y).toBeCloseTo(expected.y, 5);
          });
        }
      }
    }
  });

  it('keeps NEWS on the same continuous orbit regardless of accuracy', () => {
    const size = 320;
    const width = size + 56;
    const cardinalFontSize = Math.max(12, size * 0.044);
    const readCardinals = (heading: number, accuracy: number | null) => {
      const { context, text } = createContext();
      drawWindRoseCompassReference(
        context,
        width,
        size,
        width / 2,
        size / 2,
        createWindRoseGeometry({ size }),
        heading,
        accuracy,
        size,
        true,
        50,
        true,
      );
      return Object.fromEntries(text
        .filter(({ value, font }) => (
          ['N', 'E', 'S', 'W'].includes(value)
          && font.includes(`${cardinalFontSize}px`)
        ))
        .map(({ value, x, y }) => [value, { x, y }]));
    };

    for (let heading = 0; heading < 360; heading += 1) {
      expect(readCardinals(heading, 13)).toEqual(readCardinals(heading, null));
    }
    for (const accuracy of [0, 3, 13, 45, 90, 179]) {
      expect(readCardinals(0, accuracy)).toEqual(readCardinals(0, null));
    }

    const boundaryHeadings = [4.99, 5, 5.01, 354.99, 355, 355.01];
    const northPoints = boundaryHeadings.map((heading) => readCardinals(heading, 13).N);
    for (let index = 1; index < northPoints.length; index += 1) {
      if (index === 3) continue;
      expect(Math.hypot(
        northPoints[index].x - northPoints[index - 1].x,
        northPoints[index].y - northPoints[index - 1].y,
      )).toBeLessThan(0.2);
    }
  });

  it('uses the reference line instead of a fan when accuracy is unavailable', () => {
    for (const accuracy of [null, Number.NaN, -1]) {
      const size = 320;
      const { context, text } = createContext();
      drawWindRoseCompassReference(
        context,
        size,
        size,
        size / 2,
        size / 2,
        createWindRoseGeometry({ size }),
        0,
        accuracy,
        size,
        true,
        50,
        false,
      );
      expect(context.fill).not.toHaveBeenCalled();
      expect(context.stroke).toHaveBeenCalledTimes(5);
      expect(text.some(({ value }) => value.startsWith('±'))).toBe(false);
    }
  });
});
