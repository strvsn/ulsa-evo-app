import { describe, expect, it } from 'vitest';
import {
  WIND_ROSE_BAR_COUNT,
  WIND_ROSE_BAR_STEP_DEGREES,
  WindRoseMotionModel,
  type WindRoseMotionFrame,
} from './windRoseMotionModel';
import { normalizeDegrees, shortestSignedAngularDistance } from './windRoseGaugeMath';

const FRAME_INTERVAL_60_FPS_MS = 1000 / 60;

const advanceFor = (
  model: WindRoseMotionModel,
  startMs: number,
  durationMs: number,
  frameIntervalMs = FRAME_INTERVAL_60_FPS_MS,
): WindRoseMotionFrame => {
  const endMs = startMs + durationMs;
  let frame = model.advance(startMs);
  for (let time = startMs + frameIntervalMs; time < endMs - 0.0001; time += frameIntervalMs) {
    frame = model.advance(time);
  }
  return model.advance(endMs) ?? frame;
};

const activityAt = (frame: WindRoseMotionFrame, angle: number): number => {
  const index = Math.round(normalizeDegrees(angle) / WIND_ROSE_BAR_STEP_DEGREES)
    % frame.rayActivity.length;
  return frame.rayActivity[index];
};

const activityCentroid = (frame: WindRoseMotionFrame): number => {
  let weightedX = 0;
  let weightedY = 0;
  frame.rayActivity.forEach((activity, index) => {
    const radians = index * WIND_ROSE_BAR_STEP_DEGREES * Math.PI / 180;
    weightedX += activity * Math.sin(radians);
    weightedY += activity * Math.cos(radians);
  });
  return normalizeDegrees(Math.atan2(weightedX, weightedY) * 180 / Math.PI);
};

const maximumActivityDifference = (
  first: WindRoseMotionFrame,
  second: WindRoseMotionFrame,
): number => first.rayActivity.reduce(
  (maximum, activity, index) => Math.max(maximum, Math.abs(activity - second.rayActivity[index])),
  0,
);

describe('WindRoseMotionModel v2', () => {
  it('crosses north through the shortest 359 to 1 degree path', () => {
    const model = new WindRoseMotionModel();
    model.setTarget(2, 359, true, 0, 1_000);
    advanceFor(model, 0, 300);
    model.setTarget(2, 1, true, 300, 1_300);

    const moving = advanceFor(model, 300, 100);
    expect(moving.movementDirection).not.toBe(-1);

    const settled = advanceFor(model, 400, 400);
    expect(Math.abs(shortestSignedAngularDistance(settled.peakDirectionDegrees, 1))).toBeLessThan(0.2);
  });

  it('holds a stable field without movement-direction flicker for alternating one-degree calm-wind noise', () => {
    const model = new WindRoseMotionModel();
    model.setTarget(0.04, 90, true, 0, 10_000);
    advanceFor(model, 0, 500);

    const movementDirections: Array<-1 | 0 | 1> = [];
    const centroids: number[] = [];
    for (let sample = 1; sample <= 20; sample += 1) {
      const nowMs = 500 + sample * 50;
      model.setTarget(0.04, sample % 2 === 0 ? 89 : 91, true, nowMs, 10_000 + nowMs);
      const frame = advanceFor(model, nowMs, 50);
      movementDirections.push(frame.movementDirection);
      centroids.push(activityCentroid(frame));
    }

    const nonZeroDirections = movementDirections.filter((direction) => direction !== 0);
    expect(new Set(nonZeroDirections).size).toBeLessThanOrEqual(1);
    const centroidErrors = centroids.map((centroid) => (
      Math.abs(shortestSignedAngularDistance(90, centroid))
    ));
    expect(Math.max(...centroidErrors)).toBeLessThan(2);
  });

  it('keeps the clockwise wake clearly behind a 90 to 125 degree moving peak', () => {
    const model = new WindRoseMotionModel();
    model.setTarget(4, 90, true, 0, 20_000);
    advanceFor(model, 0, 400);
    model.setTarget(4, 125, true, 400, 20_400);
    const frame = advanceFor(model, 400, 180);
    const behind = activityAt(frame, frame.peakDirectionDegrees - 12);
    const ahead = activityAt(frame, frame.peakDirectionDegrees + 12);

    expect(frame.movementDirection).toBe(1);
    expect(behind).toBeGreaterThan(ahead * 2);
  });

  it('keeps direction and all 120 ray activities stable across 30, 60, and 120 fps', () => {
    const run = (frameIntervalMs: number) => {
      const model = new WindRoseMotionModel();
      model.setTarget(3, 45, true, 0, 30_000);
      advanceFor(model, 0, 250, frameIntervalMs);
      model.setTarget(3, 160, true, 250, 30_250);
      return advanceFor(model, 250, 750, frameIntervalMs);
    };
    const at30 = run(1000 / 30);
    const at60 = run(1000 / 60);
    const at120 = run(1000 / 120);

    expect(Math.abs(shortestSignedAngularDistance(
      at30.peakDirectionDegrees,
      at60.peakDirectionDegrees,
    ))).toBeLessThan(0.02);
    expect(Math.abs(shortestSignedAngularDistance(
      at60.peakDirectionDegrees,
      at120.peakDirectionDegrees,
    ))).toBeLessThan(0.02);
    expect(maximumActivityDifference(at30, at60)).toBeLessThan(0.0002);
    expect(maximumActivityDifference(at60, at120)).toBeLessThan(0.0002);
  });

  it('clears speed, direction motion, and every ray immediately on disconnect', () => {
    const model = new WindRoseMotionModel();
    model.setTarget(5, 20, true, 0, 40_000);
    advanceFor(model, 0, 250);
    model.setTarget(5, 80, true, 250, 40_250);
    const moving = advanceFor(model, 250, 150);
    expect(Math.max(...moving.rayActivity)).toBeGreaterThan(0);

    model.setTarget(null, 0, false, 400, 40_400);
    const stopped = model.advance(400);
    expect(stopped.needsAnimation).toBe(false);
    expect(stopped.movementDirection).toBe(0);
    expect(stopped.speedMps).toBe(0);
    expect(stopped.normalizedSpeed).toBe(0);
    expect([...stopped.rayActivity]).toEqual(Array(WIND_ROSE_BAR_COUNT).fill(0));
  });

  it('fades and reforms on a 180 degree reversal without painting a long false wake through intermediate angles', () => {
    const model = new WindRoseMotionModel();
    model.setTarget(4, 0, true, 0, 50_000);
    advanceFor(model, 0, 600);
    model.setTarget(4, 180, true, 600, 50_600);

    let maximumIntermediateActivity = 0;
    let frame = model.advance(600);
    for (let time = 625; time <= 1_100; time += 25) {
      frame = model.advance(time);
      maximumIntermediateActivity = Math.max(
        maximumIntermediateActivity,
        activityAt(frame, 60),
        activityAt(frame, 90),
        activityAt(frame, 120),
        activityAt(frame, 240),
        activityAt(frame, 270),
        activityAt(frame, 300),
      );
    }

    const endpointActivity = Math.max(activityAt(frame, 0), activityAt(frame, 180));
    expect(maximumIntermediateActivity).toBeLessThan(0.12);
    expect(Math.max(activityAt(frame, 90), activityAt(frame, 270))).toBeLessThan(endpointActivity * 0.15);
    expect(Math.abs(shortestSignedAngularDistance(frame.peakDirectionDegrees, 180))).toBeLessThan(0.5);
  });

  it('accepts an unchanged value with a newer sample timestamp and ignores duplicate or older samples', () => {
    const model = new WindRoseMotionModel();
    model.setTarget(2, 90, true, 0, 60_000);
    advanceFor(model, 0, 200);

    // The unchanged fresh sample must still advance the timestamp watermark.
    model.setTarget(2, 90, true, 200, 60_200);
    // This timestamp is newer than the first sample but older than the accepted
    // unchanged sample, so a conflicting payload must not become the target.
    model.setTarget(2, 210, true, 200, 60_100);
    let frame = advanceFor(model, 200, 300);
    expect(Math.abs(shortestSignedAngularDistance(frame.peakDirectionDegrees, 90))).toBeLessThan(0.2);

    const control = new WindRoseMotionModel();
    control.setTarget(2, 90, true, 0, 60_000);
    advanceFor(control, 0, 200);
    control.setTarget(2, 90, true, 200, 60_200);

    // A resend with the exact same timestamp must have no effect beyond the
    // normal passage of simulation time.
    model.setTarget(2, 270, true, 500, 60_200);
    frame = advanceFor(model, 500, 300);
    const controlFrame = advanceFor(control, 200, 600);
    expect(Math.abs(shortestSignedAngularDistance(
      frame.peakDirectionDegrees,
      controlFrame.peakDirectionDegrees,
    ))).toBeLessThan(0.0001);
    expect(maximumActivityDifference(frame, controlFrame)).toBeLessThan(0.0001);
  });

  it('always returns exactly 120 finite ray activities constrained to zero through one', () => {
    const model = new WindRoseMotionModel();
    model.setTarget(25, 275, true, 0, 70_000);
    const frame = advanceFor(model, 0, 800);

    expect(frame.rayActivity).toHaveLength(WIND_ROSE_BAR_COUNT);
    expect(frame.rayActivity).toHaveLength(120);
    frame.rayActivity.forEach((activity) => {
      expect(Number.isFinite(activity)).toBe(true);
      expect(activity).toBeGreaterThanOrEqual(0);
      expect(activity).toBeLessThanOrEqual(1);
    });
  });

  it('turns a measurable breeze into a coherent multi-ray body with a sharp leading core', () => {
    const model = new WindRoseMotionModel();
    model.setTarget(0.1, 45, true, 0, 80_000);
    const frame = advanceFor(model, 0, 1_200);
    const visibleRays = [...frame.rayActivity].filter((activity) => activity >= 0.01);
    const maximum = Math.max(...frame.rayActivity);

    expect(visibleRays.length).toBeGreaterThanOrEqual(5);
    expect(visibleRays.length).toBeLessThanOrEqual(13);
    expect(maximum).toBeGreaterThanOrEqual(frame.normalizedSpeed * 0.95);
    expect(activityAt(frame, 45)).toBeGreaterThan(activityAt(frame, 54) * 2);
  });

  it('settles a constant wind so requestAnimationFrame and PiP can return to idle cadence', () => {
    const model = new WindRoseMotionModel();
    model.setTarget(2, 135, true, 0, 90_000);
    const settled = advanceFor(model, 0, 3_000);

    expect(settled.needsAnimation).toBe(false);
    expect(Math.abs(shortestSignedAngularDistance(settled.peakDirectionDegrees, 135))).toBeLessThan(0.1);
  });
});
