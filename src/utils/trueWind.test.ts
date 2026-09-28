import { describe, expect, it } from 'vitest';
import {
  assessGnssMotion,
  calculateTrueWind,
  type GnssMotionSample,
} from './trueWind';

const NOW = 1_000_000;

const motionSample = (
  overrides: Partial<GnssMotionSample> = {},
): GnssMotionSample => ({
  speedMps: 5,
  speedAccuracyMps: 0.2,
  courseDegrees: 0,
  courseAccuracyDegrees: 3,
  horizontalAccuracyMeters: 4,
  timestampMs: NOW - 200,
  available: true,
  authorization: 'authorized',
  accuracyAuthorization: 'full',
  ...overrides,
});

describe('assessGnssMotion', () => {
  it('accepts a fresh accurate moving vector', () => {
    expect(assessGnssMotion(motionSample(), NOW)).toEqual({
      status: 'ready',
      usable: true,
      platformSpeedMps: 5,
      platformCourseDegrees: 0,
      reason: null,
    });
  });

  it('treats a stopped vehicle as stationary without requiring a course', () => {
    expect(assessGnssMotion(motionSample({
      speedMps: 0.12,
      speedAccuracyMps: 2.8,
      horizontalAccuracyMeters: 110,
      courseDegrees: null,
      courseAccuracyDegrees: null,
    }), NOW)).toEqual({
      status: 'stationary',
      usable: true,
      platformSpeedMps: 0,
      platformCourseDegrees: null,
      reason: null,
    });
  });

  it('uses a wider exit threshold to prevent stopped and moving state chatter', () => {
    const stationary = assessGnssMotion(motionSample({
      speedMps: 0.3,
      courseDegrees: null,
      courseAccuracyDegrees: null,
    }), NOW);
    const retained = assessGnssMotion(motionSample({
      speedMps: 0.8,
      courseDegrees: null,
      courseAccuracyDegrees: null,
    }), NOW, true, { previousAssessment: stationary });
    const moving = assessGnssMotion(motionSample({
      speedMps: 1.1,
      courseDegrees: null,
      courseAccuracyDegrees: null,
    }), NOW, true, { previousAssessment: retained });

    expect(retained.status).toBe('stationary');
    expect(retained.usable).toBe(true);
    expect(moving.status).toBe('requesting');
    expect(moving.usable).toBe(false);
  });

  it('rejects stale, reduced-accuracy, and entry data outside vehicle thresholds', () => {
    expect(assessGnssMotion(motionSample({ timestampMs: NOW - 5_001 }), NOW).status)
      .toBe('stale');
    expect(assessGnssMotion(motionSample({ accuracyAuthorization: 'reduced' }), NOW).status)
      .toBe('lowAccuracy');
    expect(assessGnssMotion(motionSample({ speedAccuracyMps: 2.01 }), NOW).status)
      .toBe('lowAccuracy');
    expect(assessGnssMotion(motionSample({ horizontalAccuracyMeters: 80.1 }), NOW).status)
      .toBe('lowAccuracy');
    expect(assessGnssMotion(motionSample({ courseAccuracyDegrees: 45.1 }), NOW).status)
      .toBe('lowAccuracy');
  });

  it('retains an established correction through moderate accuracy degradation', () => {
    const ready = assessGnssMotion(motionSample(), NOW);
    expect(assessGnssMotion(motionSample({
      speedAccuracyMps: 2.8,
      horizontalAccuracyMeters: 110,
      courseAccuracyDegrees: 55,
    }), NOW, true, { previousAssessment: ready })).toMatchObject({
      status: 'ready',
      usable: true,
    });
  });

  it('drops an established correction on severe degradation or stale data', () => {
    const ready = assessGnssMotion(motionSample(), NOW);
    expect(assessGnssMotion(
      motionSample({ speedAccuracyMps: 3.1 }),
      NOW,
      true,
      { previousAssessment: ready },
    ).usable).toBe(false);
    expect(assessGnssMotion(
      motionSample({ timestampMs: NOW - 5_001 }),
      NOW,
      true,
      { previousAssessment: ready },
    ).status).toBe('stale');
  });

  it('does not mistake missing moving course data for a valid true-wind correction', () => {
    const assessment = assessGnssMotion(motionSample({
      speedMps: 4,
      courseDegrees: null,
      courseAccuracyDegrees: null,
    }), NOW);
    expect(assessment.usable).toBe(false);
    expect(assessment.status).toBe('requesting');
  });
});

describe('calculateTrueWind', () => {
  it('returns the compass-corrected apparent wind while stationary', () => {
    const result = calculateTrueWind({
      apparentSpeedMps: 2,
      apparentDirectionFromDeviceDegrees: 30,
      deviceTrueHeadingDegrees: 45,
      platformSpeedMps: 0,
      platformCourseDegrees: null,
    });
    expect(result?.speedMps).toBeCloseTo(2, 8);
    expect(result?.directionFromTrueNorthDegrees).toBeCloseTo(75, 8);
    expect(result?.directionFromDeviceDegrees).toBeCloseTo(30, 8);
  });

  it('cancels motion-induced headwind in still air', () => {
    const result = calculateTrueWind({
      apparentSpeedMps: 10,
      apparentDirectionFromDeviceDegrees: 0,
      deviceTrueHeadingDegrees: 0,
      platformSpeedMps: 10,
      platformCourseDegrees: 0,
    });
    expect(result?.speedMps).toBe(0);
    expect(result?.isCalm).toBe(true);
    expect(result?.directionFromTrueNorthDegrees).toBeNull();
    expect(result?.directionFromDeviceDegrees).toBeNull();
  });

  it('adds platform velocity to a same-direction tailwind', () => {
    const result = calculateTrueWind({
      apparentSpeedMps: 5,
      apparentDirectionFromDeviceDegrees: 180,
      deviceTrueHeadingDegrees: 0,
      platformSpeedMps: 10,
      platformCourseDegrees: 0,
    });
    expect(result?.speedMps).toBeCloseTo(15, 8);
    expect(result?.directionFromTrueNorthDegrees).toBeCloseTo(180, 8);
  });

  it('solves a crosswind vector and keeps device-relative rendering consistent', () => {
    const result = calculateTrueWind({
      apparentSpeedMps: 4,
      apparentDirectionFromDeviceDegrees: 270,
      deviceTrueHeadingDegrees: 90,
      platformSpeedMps: 3,
      platformCourseDegrees: 90,
    });
    // Device heading east turns the relative west wind into a true-north
    // apparent wind. Adding 3 m/s eastward ground velocity gives a 3-4-5
    // true-air vector whose wind-from bearing is about 323.13 degrees.
    expect(result?.speedMps).toBeCloseTo(5, 8);
    expect(result?.directionFromTrueNorthDegrees).toBeCloseTo(323.130102, 6);
    expect(result?.directionFromDeviceDegrees).toBeCloseTo(233.130102, 6);
  });

  it('rejects correction when movement course is missing', () => {
    expect(calculateTrueWind({
      apparentSpeedMps: 3,
      apparentDirectionFromDeviceDegrees: 0,
      deviceTrueHeadingDegrees: 0,
      platformSpeedMps: 4,
      platformCourseDegrees: null,
    })).toBeNull();
  });
});
