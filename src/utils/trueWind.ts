import { normalizeDegrees } from '../components/charts/windRoseGaugeMath';

export type GnssAuthorization =
  | 'authorized'
  | 'denied'
  | 'restricted'
  | 'notDetermined'
  | 'unsupported';

export type GnssAccuracyAuthorization = 'full' | 'reduced' | 'unsupported';

export interface GnssMotionSample {
  speedMps: number | null;
  speedAccuracyMps: number | null;
  courseDegrees: number | null;
  courseAccuracyDegrees: number | null;
  horizontalAccuracyMeters: number | null;
  timestampMs: number | null;
  available: boolean;
  authorization: GnssAuthorization;
  accuracyAuthorization: GnssAccuracyAuthorization;
}

export type GnssMotionStatus =
  | 'off'
  | 'requesting'
  | 'ready'
  | 'stationary'
  | 'lowAccuracy'
  | 'stale'
  | 'denied'
  | 'restricted'
  | 'unavailable';

export interface GnssMotionAssessment {
  status: GnssMotionStatus;
  usable: boolean;
  platformSpeedMps: number;
  platformCourseDegrees: number | null;
  reason: string | null;
}

export interface GnssMotionAssessmentContext {
  previousAssessment?: GnssMotionAssessment | null;
}

export interface TrueWindInput {
  apparentSpeedMps: number;
  /** Wind-from angle clockwise from the ULSA/iPhone forward axis. */
  apparentDirectionFromDeviceDegrees: number;
  /** iPhone top-edge bearing clockwise from geographic true north. */
  deviceTrueHeadingDegrees: number;
  /** Ground speed reported by Core Location. */
  platformSpeedMps: number;
  /** Ground course clockwise from geographic true north. */
  platformCourseDegrees: number | null;
}

export interface TrueWindSolution {
  speedMps: number;
  /** Meteorological wind-from bearing clockwise from geographic true north. */
  directionFromTrueNorthDegrees: number | null;
  /** The same true-wind direction expressed relative to the iPhone/ULSA forward axis. */
  directionFromDeviceDegrees: number | null;
  apparentDirectionFromTrueNorthDegrees: number;
  isCalm: boolean;
}

export const GNSS_LOCATION_STALE_MS = 5_000;
export const GNSS_MAX_SPEED_ACCURACY_MPS = 2;
export const GNSS_RETAIN_MAX_SPEED_ACCURACY_MPS = 3;
export const GNSS_MAX_COURSE_ACCURACY_DEGREES = 45;
export const GNSS_RETAIN_MAX_COURSE_ACCURACY_DEGREES = 60;
export const GNSS_MAX_HORIZONTAL_ACCURACY_METERS = 80;
export const GNSS_RETAIN_MAX_HORIZONTAL_ACCURACY_METERS = 120;
export const GNSS_STATIONARY_ENTER_SPEED_MPS = 0.5;
export const GNSS_STATIONARY_EXIT_SPEED_MPS = 1;
export const TRUE_WIND_CALM_SPEED_MPS = 0.01;

const invalidAssessment = (
  status: GnssMotionStatus,
  reason: string,
): GnssMotionAssessment => ({
  status,
  usable: false,
  platformSpeedMps: 0,
  platformCourseDegrees: null,
  reason,
});

export const assessGnssMotion = (
  sample: GnssMotionSample,
  nowMs: number,
  enabled = true,
  context: GnssMotionAssessmentContext = {},
): GnssMotionAssessment => {
  if (!enabled) return invalidAssessment('off', 'GNSS補正はオフです');
  if (sample.authorization === 'denied') {
    return invalidAssessment('denied', '位置情報の使用が許可されていません');
  }
  if (sample.authorization === 'restricted') {
    return invalidAssessment('restricted', '位置情報の使用が制限されています');
  }
  if (sample.authorization === 'unsupported') {
    return invalidAssessment('unavailable', 'この端末ではGNSS情報を利用できません');
  }
  if (sample.authorization === 'notDetermined' || !sample.available) {
    return invalidAssessment('requesting', 'GNSSの速度情報を待っています');
  }

  const {
    speedMps,
    speedAccuracyMps,
    horizontalAccuracyMeters,
    timestampMs,
  } = sample;
  if (
    speedMps === null
    || speedAccuracyMps === null
    || horizontalAccuracyMeters === null
    || timestampMs === null
    || !Number.isFinite(speedMps)
    || !Number.isFinite(speedAccuracyMps)
    || !Number.isFinite(horizontalAccuracyMeters)
    || !Number.isFinite(timestampMs)
    || speedMps < 0
    || speedAccuracyMps < 0
    || horizontalAccuracyMeters < 0
  ) {
    return invalidAssessment('requesting', '有効なGNSS速度情報を待っています');
  }

  const ageMs = nowMs - timestampMs;
  if (ageMs > GNSS_LOCATION_STALE_MS || ageMs < -1_000) {
    return invalidAssessment('stale', 'GNSS情報の更新が停止しています');
  }
  if (sample.accuracyAuthorization === 'reduced') {
    return invalidAssessment('lowAccuracy', 'iPhoneの「正確な位置情報」をオンにしてください');
  }
  const wasUsable = context.previousAssessment?.usable === true;

  // Course has no physical meaning while the vehicle is stopped. Core Location
  // commonly reports a non-zero speed uncertainty and no course inside a car.
  // A separate exit threshold prevents stopped/moving chatter. Stationary entry
  // may use the wider retained quality limits because no uncertain velocity
  // vector is applied to the true-wind calculation.
  const stationarySpeedLimit = context.previousAssessment?.status === 'stationary'
    ? GNSS_STATIONARY_EXIT_SPEED_MPS
    : GNSS_STATIONARY_ENTER_SPEED_MPS;
  if (
    speedMps <= stationarySpeedLimit
    && speedAccuracyMps <= GNSS_RETAIN_MAX_SPEED_ACCURACY_MPS
    && horizontalAccuracyMeters <= GNSS_RETAIN_MAX_HORIZONTAL_ACCURACY_METERS
  ) {
    return {
      status: 'stationary',
      usable: true,
      platformSpeedMps: 0,
      platformCourseDegrees: null,
      reason: null,
    };
  }

  const speedAccuracyLimit = wasUsable
    ? GNSS_RETAIN_MAX_SPEED_ACCURACY_MPS
    : GNSS_MAX_SPEED_ACCURACY_MPS;
  const horizontalAccuracyLimit = wasUsable
    ? GNSS_RETAIN_MAX_HORIZONTAL_ACCURACY_METERS
    : GNSS_MAX_HORIZONTAL_ACCURACY_METERS;
  if (
    speedAccuracyMps > speedAccuracyLimit
    || horizontalAccuracyMeters > horizontalAccuracyLimit
  ) {
    const reason = speedAccuracyMps > speedAccuracyLimit
      ? `GNSS速度精度 ${speedAccuracyMps.toFixed(1)} m/s（${speedAccuracyLimit.toFixed(1)}以下が必要）`
      : `GNSS位置精度 ${Math.round(horizontalAccuracyMeters)} m（${horizontalAccuracyLimit}以下が必要）`;
    return invalidAssessment('lowAccuracy', reason);
  }

  const { courseDegrees, courseAccuracyDegrees } = sample;
  if (
    courseDegrees === null
    || courseAccuracyDegrees === null
    || !Number.isFinite(courseDegrees)
    || !Number.isFinite(courseAccuracyDegrees)
    || courseDegrees < 0
    || courseAccuracyDegrees < 0
  ) {
    return invalidAssessment(
      'requesting',
      `GNSS移動方位を待っています（速度 ${speedMps.toFixed(1)} m/s）`,
    );
  }
  const courseAccuracyLimit = wasUsable
    ? GNSS_RETAIN_MAX_COURSE_ACCURACY_DEGREES
    : GNSS_MAX_COURSE_ACCURACY_DEGREES;
  if (courseAccuracyDegrees > courseAccuracyLimit) {
    return invalidAssessment(
      'lowAccuracy',
      `GNSS方位精度 ±${Math.round(courseAccuracyDegrees)}°（±${courseAccuracyLimit}°以内が必要）`,
    );
  }

  return {
    status: 'ready',
    usable: true,
    platformSpeedMps: speedMps,
    platformCourseDegrees: normalizeDegrees(courseDegrees),
    reason: null,
  };
};

const bearingVector = (speed: number, bearingDegrees: number) => {
  const radians = normalizeDegrees(bearingDegrees) * (Math.PI / 180);
  return {
    east: speed * Math.sin(radians),
    north: speed * Math.cos(radians),
  };
};

const vectorBearing = (east: number, north: number): number =>
  normalizeDegrees(Math.atan2(east, north) * (180 / Math.PI));

/**
 * Removes the iPhone/vehicle ground-velocity vector from the apparent wind.
 *
 * ULSA reports the direction the wind comes FROM. Vector addition uses the
 * direction the air travels TO, so the apparent vector is negated before
 * adding platform velocity:
 *
 *   trueAirVelocity = apparentAirVelocity + platformGroundVelocity
 */
export const calculateTrueWind = (input: TrueWindInput): TrueWindSolution | null => {
  const {
    apparentSpeedMps,
    apparentDirectionFromDeviceDegrees,
    deviceTrueHeadingDegrees,
    platformSpeedMps,
    platformCourseDegrees,
  } = input;
  if (
    !Number.isFinite(apparentSpeedMps)
    || !Number.isFinite(apparentDirectionFromDeviceDegrees)
    || !Number.isFinite(deviceTrueHeadingDegrees)
    || !Number.isFinite(platformSpeedMps)
    || apparentSpeedMps < 0
    || platformSpeedMps < 0
    || (platformSpeedMps > 0 && (
      platformCourseDegrees === null || !Number.isFinite(platformCourseDegrees)
    ))
  ) {
    return null;
  }

  const apparentDirectionFromTrueNorthDegrees = normalizeDegrees(
    apparentDirectionFromDeviceDegrees + deviceTrueHeadingDegrees,
  );
  const apparentFrom = bearingVector(
    apparentSpeedMps,
    apparentDirectionFromTrueNorthDegrees,
  );
  const platformTo = platformSpeedMps > 0 && platformCourseDegrees !== null
    ? bearingVector(platformSpeedMps, platformCourseDegrees)
    : { east: 0, north: 0 };
  const trueToEast = -apparentFrom.east + platformTo.east;
  const trueToNorth = -apparentFrom.north + platformTo.north;
  const speedMps = Math.hypot(trueToEast, trueToNorth);
  const isCalm = speedMps < TRUE_WIND_CALM_SPEED_MPS;
  const directionFromTrueNorthDegrees = isCalm
    ? null
    : vectorBearing(-trueToEast, -trueToNorth);

  return {
    speedMps: isCalm ? 0 : speedMps,
    directionFromTrueNorthDegrees,
    directionFromDeviceDegrees: directionFromTrueNorthDegrees === null
      ? null
      : normalizeDegrees(directionFromTrueNorthDegrees - deviceTrueHeadingDegrees),
    apparentDirectionFromTrueNorthDegrees,
    isCalm,
  };
};
