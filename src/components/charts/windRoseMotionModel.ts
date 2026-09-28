import { normalizeWindRoseSpeed, normalizeDegrees, shortestSignedAngularDistance } from './windRoseGaugeMath';

export const WIND_ROSE_BAR_STEP_DEGREES = 3;
export const WIND_ROSE_BAR_COUNT = 360 / WIND_ROSE_BAR_STEP_DEGREES;

export interface WindRoseMotionFrame {
  speedMps: number;
  normalizedSpeed: number;
  peakDirectionDegrees: number;
  angularVelocityDegreesPerSecond: number;
  movementDirection: -1 | 0 | 1;
  /** Final activity for each existing three-degree ray. Every ray is drawn at most once. */
  rayActivity: Float32Array;
  needsAnimation: boolean;
}

interface MotionTarget {
  speedMps: number;
  vectorX: number;
  vectorY: number;
  hasLiveData: boolean;
}

interface WindSample {
  timestampMs: number;
  speedMps: number;
  unitX: number;
  unitY: number;
}

const FIXED_STEP_SECONDS = 1 / 120;
const MAX_ELAPSED_SECONDS = 0.5;
const SPEED_RISE_OMEGA = 30;
const SPEED_FALL_OMEGA = 18;
const VECTOR_CALM_OMEGA = 16;
const VECTOR_FULL_OMEGA = 30;
const DIRECTION_CONFIDENCE_LOW_MPS = 0.035;
const DIRECTION_CONFIDENCE_HIGH_MPS = 0.18;
const CALM_TARGET_PREFILTER_SECONDS = 0.45;
const DIRECTION_HOLD_MAGNITUDE_MPS = 0.015;
const DIRECTION_REACQUIRE_COHERENCE = 0.12;
const ANGULAR_VELOCITY_TAU_SECONDS = 0.06;
const MOVEMENT_START_DEGREES_PER_SECOND = 6;
const MOVEMENT_STOP_DEGREES_PER_SECOND = 2;
const SAMPLE_HISTORY_SECONDS = 0.6;
const WAKE_ADVECTION_RATIO = 0.2;
const WAKE_DIFFUSION_BASE_DEGREES_SQUARED_PER_SECOND = 55;
const WAKE_DIFFUSION_VARIABILITY_DEGREES_SQUARED_PER_SECOND = 35;
const WAKE_LOW_SPEED_TAU_SECONDS = 0.30;
const WAKE_HIGH_SPEED_TAU_SECONDS = 0.52;
const WAKE_VARIABILITY_TAU_SECONDS = 0.06;
const WAKE_MAX_TAU_SECONDS = 0.58;
const WAKE_FORWARD_TAU_SECONDS = 0.14;
const WAKE_SPEED_LOW_MPS = 0.15;
const WAKE_SPEED_HIGH_MPS = 0.5;
const SOURCE_SIGMA_STABLE_DEGREES = 4.2;
const SOURCE_SIGMA_VARIABILITY_DEGREES = 5.4;
const SOURCE_PEAK_RATIO = 0.84;
const SOURCE_RISE_TAU_SECONDS = 0.055;
const SOURCE_FORWARD_SUPPRESSION = 0.8;
const FULL_MOTION_DEGREES_PER_SECOND = 90;
const CORE_COHERENCE_FLOOR = 0.32;

const clamp = (value: number, minimum = 0, maximum = 1): number =>
  Math.min(Math.max(value, minimum), maximum);

const smoothstep = (value: number): number => {
  const clamped = clamp(value);
  return clamped * clamped * (3 - 2 * clamped);
};

const exponentialAlpha = (deltaSeconds: number, timeConstant: number): number =>
  1 - Math.exp(-deltaSeconds / Math.max(timeConstant, Number.EPSILON));

const directionConfidence = (speedMps: number): number => smoothstep(
  (speedMps - DIRECTION_CONFIDENCE_LOW_MPS)
    / (DIRECTION_CONFIDENCE_HIGH_MPS - DIRECTION_CONFIDENCE_LOW_MPS),
);

const emptyFrame = (): WindRoseMotionFrame => ({
  speedMps: 0,
  normalizedSpeed: 0,
  peakDirectionDegrees: 0,
  angularVelocityDegreesPerSecond: 0,
  movementDirection: 0,
  rayActivity: new Float32Array(WIND_ROSE_BAR_COUNT),
  needsAnimation: false,
});

/**
 * Exact fixed-step solution of a critically damped second-order response for
 * a target that is constant throughout this simulation step.
 */
const advanceCriticalDamped = (
  position: number,
  velocity: number,
  target: number,
  omega: number,
  deltaSeconds: number,
): [number, number] => {
  const error = position - target;
  const helper = velocity + omega * error;
  const decay = Math.exp(-omega * deltaSeconds);
  return [
    target + (error + helper * deltaSeconds) * decay,
    (velocity - omega * helper * deltaSeconds) * decay,
  ];
};

const sampleCircular = (values: Float64Array, index: number): number => {
  const count = values.length;
  const wrapped = ((index % count) + count) % count;
  const lower = Math.floor(wrapped);
  const upper = (lower + 1) % count;
  const fraction = wrapped - lower;
  return values[lower] * (1 - fraction) + values[upper] * fraction;
};

export class WindRoseMotionModel {
  private target: MotionTarget = { speedMps: 0, vectorX: 0, vectorY: 0, hasLiveData: false };
  private initialized = false;
  private lastAdvanceMs: number | null = null;
  private accumulatorSeconds = 0;
  private lastSampleTimestampMs: number | null = null;
  private targetVectorX = 0;
  private targetVectorY = 0;
  private filteredVectorX = 0;
  private filteredVectorY = 0;
  private filteredVectorVelocityX = 0;
  private filteredVectorVelocityY = 0;
  private filteredSpeed = 0;
  private filteredSpeedVelocity = 0;
  private filteredDirection = 0;
  private angularVelocity = 0;
  private movementDirection: -1 | 0 | 1 = 0;
  private directionSuppressed = false;
  private variability = 0;
  private samples: WindSample[] = [];
  private field = new Float64Array(WIND_ROSE_BAR_COUNT);
  private advectedField = new Float64Array(WIND_ROSE_BAR_COUNT);
  private nextField = new Float64Array(WIND_ROSE_BAR_COUNT);
  private finalActivity = new Float32Array(WIND_ROSE_BAR_COUNT);
  private lastFieldDelta = 0;

  setTarget(
    speedMps: number | null,
    directionDegrees: number,
    hasLiveData: boolean,
    nowMs: number,
    sampleTimestampMs = nowMs,
  ): void {
    const valid = hasLiveData
      && speedMps !== null
      && Number.isFinite(speedMps)
      && Number.isFinite(directionDegrees)
      && Number.isFinite(sampleTimestampMs);
    if (!valid) {
      this.reset();
      this.initialized = false;
      this.target = { speedMps: 0, vectorX: 0, vectorY: 0, hasLiveData: false };
      this.lastAdvanceMs = nowMs;
      return;
    }

    const nextSpeed = Math.max(0, speedMps);
    const normalizedDirection = normalizeDegrees(directionDegrees);
    const radians = normalizedDirection * Math.PI / 180;
    const rawUnitX = Math.sin(radians);
    const rawUnitY = Math.cos(radians);
    const rawVectorX = rawUnitX * nextSpeed;
    const rawVectorY = rawUnitY * nextSpeed;

    if (!this.initialized) {
      this.reset(normalizedDirection);
      this.initialized = true;
      this.lastAdvanceMs = nowMs;
      this.targetVectorX = rawVectorX;
      this.targetVectorY = rawVectorY;
    } else {
      this.advanceStateTo(nowMs);
      if (this.lastSampleTimestampMs !== null && sampleTimestampMs <= this.lastSampleTimestampMs) {
        return;
      }
      const sampleDeltaSeconds = this.lastSampleTimestampMs === null
        ? 0
        : clamp((sampleTimestampMs - this.lastSampleTimestampMs) / 1000, 0, 0.25);
      const confidence = directionConfidence(nextSpeed);
      const calmAlpha = sampleDeltaSeconds <= 0
        ? 1
        : exponentialAlpha(sampleDeltaSeconds, CALM_TARGET_PREFILTER_SECONDS);
      const targetAlpha = confidence + (1 - confidence) * calmAlpha;
      this.targetVectorX += (rawVectorX - this.targetVectorX) * targetAlpha;
      this.targetVectorY += (rawVectorY - this.targetVectorY) * targetAlpha;
    }

    this.target = {
      speedMps: nextSpeed,
      vectorX: this.targetVectorX,
      vectorY: this.targetVectorY,
      hasLiveData: true,
    };
    this.lastSampleTimestampMs = sampleTimestampMs;
    this.recordSample({
      timestampMs: sampleTimestampMs,
      speedMps: nextSpeed,
      unitX: rawUnitX,
      unitY: rawUnitY,
    });
  }

  advance(nowMs: number): WindRoseMotionFrame {
    if (!this.target.hasLiveData) return emptyFrame();
    this.advanceStateTo(nowMs);
    this.composeFinalActivity();

    let maximumActivity = 0;
    for (const activity of this.finalActivity) maximumActivity = Math.max(maximumActivity, activity);
    const vectorError = Math.hypot(
      this.target.vectorX - this.filteredVectorX,
      this.target.vectorY - this.filteredVectorY,
    );
    const velocityEnergy = Math.hypot(
      this.filteredVectorVelocityX,
      this.filteredVectorVelocityY,
    );
    return {
      speedMps: this.filteredSpeed,
      normalizedSpeed: normalizeWindRoseSpeed(this.filteredSpeed),
      peakDirectionDegrees: normalizeDegrees(this.filteredDirection),
      angularVelocityDegreesPerSecond: this.angularVelocity,
      movementDirection: this.movementDirection,
      rayActivity: new Float32Array(this.finalActivity),
      needsAnimation: Math.abs(this.target.speedMps - this.filteredSpeed) >= 0.0015
        || Math.abs(this.filteredSpeedVelocity) >= 0.004
        || vectorError >= 0.0015
        || velocityEnergy >= 0.004
        || Math.abs(this.angularVelocity) >= 0.08
        || (maximumActivity > 0 && this.lastFieldDelta >= 0.00008),
    };
  }

  reset(initialDirection = 0): void {
    this.target = { speedMps: 0, vectorX: 0, vectorY: 0, hasLiveData: false };
    this.initialized = false;
    this.lastAdvanceMs = null;
    this.accumulatorSeconds = 0;
    this.lastSampleTimestampMs = null;
    this.targetVectorX = 0;
    this.targetVectorY = 0;
    this.filteredVectorX = 0;
    this.filteredVectorY = 0;
    this.filteredVectorVelocityX = 0;
    this.filteredVectorVelocityY = 0;
    this.filteredSpeed = 0;
    this.filteredSpeedVelocity = 0;
    this.filteredDirection = normalizeDegrees(initialDirection);
    this.angularVelocity = 0;
    this.movementDirection = 0;
    this.directionSuppressed = false;
    this.variability = 0;
    this.samples = [];
    this.field.fill(0);
    this.advectedField.fill(0);
    this.nextField.fill(0);
    this.finalActivity.fill(0);
    this.lastFieldDelta = 0;
  }

  private advanceStateTo(nowMs: number): void {
    if (this.lastAdvanceMs === null) {
      this.lastAdvanceMs = nowMs;
      return;
    }
    const rawElapsed = Math.max(0, (nowMs - this.lastAdvanceMs) / 1000);
    this.lastAdvanceMs = nowMs;
    this.accumulatorSeconds += Math.min(rawElapsed, MAX_ELAPSED_SECONDS);
    while (this.accumulatorSeconds >= FIXED_STEP_SECONDS) {
      this.step(FIXED_STEP_SECONDS);
      this.accumulatorSeconds -= FIXED_STEP_SECONDS;
    }
  }

  private step(deltaSeconds: number): void {
    const confidence = directionConfidence(this.target.speedMps);
    const vectorOmega = VECTOR_CALM_OMEGA
      + (VECTOR_FULL_OMEGA - VECTOR_CALM_OMEGA) * confidence;
    [this.filteredVectorX, this.filteredVectorVelocityX] = advanceCriticalDamped(
      this.filteredVectorX,
      this.filteredVectorVelocityX,
      this.target.vectorX,
      vectorOmega,
      deltaSeconds,
    );
    [this.filteredVectorY, this.filteredVectorVelocityY] = advanceCriticalDamped(
      this.filteredVectorY,
      this.filteredVectorVelocityY,
      this.target.vectorY,
      vectorOmega,
      deltaSeconds,
    );
    const speedOmega = this.target.speedMps >= this.filteredSpeed
      ? SPEED_RISE_OMEGA
      : SPEED_FALL_OMEGA;
    [this.filteredSpeed, this.filteredSpeedVelocity] = advanceCriticalDamped(
      this.filteredSpeed,
      this.filteredSpeedVelocity,
      this.target.speedMps,
      speedOmega,
      deltaSeconds,
    );
    this.filteredSpeed = Math.max(0, this.filteredSpeed);

    this.updateDirection(deltaSeconds);
    this.updateWakeField(deltaSeconds);
  }

  private updateDirection(deltaSeconds: number): void {
    const vectorMagnitude = Math.hypot(this.filteredVectorX, this.filteredVectorY);
    const coherence = clamp(vectorMagnitude / (this.filteredSpeed + 0.001));
    if (vectorMagnitude < DIRECTION_HOLD_MAGNITUDE_MPS || coherence < DIRECTION_REACQUIRE_COHERENCE) {
      this.directionSuppressed = true;
      this.angularVelocity *= Math.exp(-deltaSeconds / ANGULAR_VELOCITY_TAU_SECONDS);
      this.updateMovementDirection();
      return;
    }

    const candidate = normalizeDegrees(Math.atan2(this.filteredVectorX, this.filteredVectorY) * 180 / Math.PI);
    const delta = shortestSignedAngularDistance(this.filteredDirection, candidate);
    let instantaneousVelocity = 0;
    if (this.directionSuppressed && Math.abs(delta) > 120) {
      // A near-opposite reversal is represented by the old body fading and a
      // new body forming, not by inventing a 180-degree rotation path.
      this.filteredDirection += delta;
    } else {
      const reliability = directionConfidence(this.filteredSpeed) * coherence;
      const directionRate = 5 + 25 * reliability;
      const alpha = 1 - Math.exp(-directionRate * deltaSeconds);
      const appliedDelta = delta * alpha;
      this.filteredDirection += appliedDelta;
      instantaneousVelocity = appliedDelta / deltaSeconds;
    }
    this.directionSuppressed = false;
    this.angularVelocity += (instantaneousVelocity - this.angularVelocity)
      * exponentialAlpha(deltaSeconds, ANGULAR_VELOCITY_TAU_SECONDS);
    this.updateMovementDirection();
  }

  private updateMovementDirection(): void {
    if (this.movementDirection === 0) {
      if (this.angularVelocity > MOVEMENT_START_DEGREES_PER_SECOND) this.movementDirection = 1;
      if (this.angularVelocity < -MOVEMENT_START_DEGREES_PER_SECOND) this.movementDirection = -1;
    } else if (Math.abs(this.angularVelocity) < MOVEMENT_STOP_DEGREES_PER_SECOND) {
      this.movementDirection = 0;
    } else if (this.angularVelocity * this.movementDirection < -MOVEMENT_START_DEGREES_PER_SECOND) {
      this.movementDirection = this.angularVelocity > 0 ? 1 : -1;
    }
  }

  private updateWakeField(deltaSeconds: number): void {
    const advectionBins = this.angularVelocity * WAKE_ADVECTION_RATIO
      * deltaSeconds / WIND_ROSE_BAR_STEP_DEGREES;
    for (let index = 0; index < WIND_ROSE_BAR_COUNT; index += 1) {
      this.advectedField[index] = sampleCircular(this.field, index - advectionBins);
    }

    const diffusion = WAKE_DIFFUSION_BASE_DEGREES_SQUARED_PER_SECOND
      + WAKE_DIFFUSION_VARIABILITY_DEGREES_SQUARED_PER_SECOND * this.variability;
    const diffusionCoefficient = diffusion * deltaSeconds
      / (WIND_ROSE_BAR_STEP_DEGREES * WIND_ROSE_BAR_STEP_DEGREES);
    const speedRatio = smoothstep(
      (this.filteredSpeed - WAKE_SPEED_LOW_MPS) / (WAKE_SPEED_HIGH_MPS - WAKE_SPEED_LOW_MPS),
    );
    const normalTau = Math.min(
      WAKE_MAX_TAU_SECONDS,
      WAKE_LOW_SPEED_TAU_SECONDS
        + (WAKE_HIGH_SPEED_TAU_SECONDS - WAKE_LOW_SPEED_TAU_SECONDS) * speedRatio
        + WAKE_VARIABILITY_TAU_SECONDS * this.variability,
    );
    const motionStrength = smoothstep(
      (Math.abs(this.angularVelocity) - MOVEMENT_START_DEGREES_PER_SECOND)
        / (FULL_MOTION_DEGREES_PER_SECOND - MOVEMENT_START_DEGREES_PER_SECOND),
    );
    const flowDirection = this.angularVelocity >= 0 ? 1 : -1;
    const sourceSigma = SOURCE_SIGMA_STABLE_DEGREES
      + SOURCE_SIGMA_VARIABILITY_DEGREES * this.variability;
    const sourcePeak = normalizeWindRoseSpeed(this.filteredSpeed) * SOURCE_PEAK_RATIO;
    const sourceAlpha = exponentialAlpha(deltaSeconds, SOURCE_RISE_TAU_SECONDS);
    let maximumDelta = 0;

    for (let index = 0; index < WIND_ROSE_BAR_COUNT; index += 1) {
      const previous = this.advectedField[index];
      const left = this.advectedField[(index - 1 + WIND_ROSE_BAR_COUNT) % WIND_ROSE_BAR_COUNT];
      const right = this.advectedField[(index + 1) % WIND_ROSE_BAR_COUNT];
      let value = Math.max(0, previous + diffusionCoefficient * (left - 2 * previous + right));
      const binAngle = index * WIND_ROSE_BAR_STEP_DEGREES;
      const signedDistance = shortestSignedAngularDistance(this.filteredDirection, binAngle);
      const isForward = motionStrength > 0 && signedDistance * flowDirection > 0;
      const tau = isForward
        ? normalTau * (1 - motionStrength) + WAKE_FORWARD_TAU_SECONDS * motionStrength
        : normalTau;
      value *= Math.exp(-deltaSeconds / tau);

      let sourceTarget = sourcePeak * Math.exp(-0.5 * (signedDistance / sourceSigma) ** 2);
      if (isForward) sourceTarget *= 1 - SOURCE_FORWARD_SUPPRESSION * motionStrength;
      if (sourceTarget > value) value += (sourceTarget - value) * sourceAlpha;
      value = clamp(value);
      this.nextField[index] = value;
      maximumDelta = Math.max(maximumDelta, Math.abs(value - this.field[index]));
    }

    const previousField = this.field;
    this.field = this.nextField;
    this.nextField = previousField;
    this.lastFieldDelta = maximumDelta;
  }

  private composeFinalActivity(): void {
    this.finalActivity.fill(0);
    const normalizedSpeed = normalizeWindRoseSpeed(this.filteredSpeed);
    const vectorMagnitude = Math.hypot(this.filteredVectorX, this.filteredVectorY);
    const coherence = clamp(vectorMagnitude / (this.filteredSpeed + 0.001));
    const coreAmplitude = normalizedSpeed * (CORE_COHERENCE_FLOOR + (1 - CORE_COHERENCE_FLOOR) * coherence);
    const fractionalIndex = normalizeDegrees(this.filteredDirection) / WIND_ROSE_BAR_STEP_DEGREES;
    const lowerIndex = Math.floor(fractionalIndex) % WIND_ROSE_BAR_COUNT;
    const upperIndex = (lowerIndex + 1) % WIND_ROSE_BAR_COUNT;
    const blend = smoothstep(fractionalIndex - Math.floor(fractionalIndex));
    let lowerWeight = 1 - blend;
    let upperWeight = blend;
    const strongestWeight = Math.max(lowerWeight, upperWeight, Number.EPSILON);
    lowerWeight /= strongestWeight;
    upperWeight /= strongestWeight;

    for (let index = 0; index < WIND_ROSE_BAR_COUNT; index += 1) {
      let core = 0;
      if (index === lowerIndex) core = coreAmplitude * lowerWeight;
      if (index === upperIndex) core = Math.max(core, coreAmplitude * upperWeight);
      this.finalActivity[index] = Math.max(this.field[index], core);
    }
  }

  private recordSample(sample: WindSample): void {
    this.samples.push(sample);
    const cutoff = sample.timestampMs - SAMPLE_HISTORY_SECONDS * 1000;
    while (this.samples.length > 0 && this.samples[0].timestampMs < cutoff) this.samples.shift();
    if (this.samples.length < 2) {
      this.variability = 0;
      return;
    }

    let weightedX = 0;
    let weightedY = 0;
    let totalWeight = 0;
    let speedSum = 0;
    for (const entry of this.samples) {
      const weight = Math.max(entry.speedMps, 0.001);
      weightedX += entry.unitX * weight;
      weightedY += entry.unitY * weight;
      totalWeight += weight;
      speedSum += entry.speedMps;
    }
    const meanSpeed = speedSum / this.samples.length;
    let speedVariance = 0;
    for (const entry of this.samples) speedVariance += (entry.speedMps - meanSpeed) ** 2;
    speedVariance /= this.samples.length;
    const concentration = totalWeight <= Number.EPSILON
      ? 1
      : clamp(Math.hypot(weightedX, weightedY) / totalWeight);
    const circularVariability = clamp((1 - concentration) * 4);
    const coefficientOfVariation = Math.sqrt(speedVariance) / Math.max(meanSpeed, 0.001);
    const speedVariability = clamp(coefficientOfVariation / 0.65);
    this.variability = directionConfidence(meanSpeed)
      * (0.8 * circularVariability + 0.2 * speedVariability);
  }
}

export const WIND_ROSE_MOTION_CONSTANTS = {
  fixedStepSeconds: FIXED_STEP_SECONDS,
  speedRiseOmega: SPEED_RISE_OMEGA,
  speedFallOmega: SPEED_FALL_OMEGA,
  vectorCalmOmega: VECTOR_CALM_OMEGA,
  vectorFullOmega: VECTOR_FULL_OMEGA,
  directionConfidenceLowMps: DIRECTION_CONFIDENCE_LOW_MPS,
  directionConfidenceHighMps: DIRECTION_CONFIDENCE_HIGH_MPS,
  calmTargetPrefilterSeconds: CALM_TARGET_PREFILTER_SECONDS,
  directionHoldMagnitudeMps: DIRECTION_HOLD_MAGNITUDE_MPS,
  angularVelocityTauSeconds: ANGULAR_VELOCITY_TAU_SECONDS,
  wakeAdvectionRatio: WAKE_ADVECTION_RATIO,
  wakeDiffusionBase: WAKE_DIFFUSION_BASE_DEGREES_SQUARED_PER_SECOND,
  wakeDiffusionVariability: WAKE_DIFFUSION_VARIABILITY_DEGREES_SQUARED_PER_SECOND,
  sourceSigmaStableDegrees: SOURCE_SIGMA_STABLE_DEGREES,
  sourceSigmaVariabilityDegrees: SOURCE_SIGMA_VARIABILITY_DEGREES,
  sourcePeakRatio: SOURCE_PEAK_RATIO,
  sourceRiseTauSeconds: SOURCE_RISE_TAU_SECONDS,
} as const;
