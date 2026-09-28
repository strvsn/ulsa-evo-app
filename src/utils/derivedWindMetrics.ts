/** The reference cards use received wind-speed samples, not an official gust record. */
export const REFERENCE_WIND_METRICS_WINDOW_MS = 10 * 60 * 1000;

// Keep 10 minutes at the fastest supported cadence plus a timing margin without
// increasing the chart buffers, which have a separate rendering cost.
export const MAX_REFERENCE_WIND_SAMPLES = 30_500;

/**
 * A bounded, time-based window for the two trustworthy speed-only references.
 * The average is O(1) amortized per sample; max is scanned only for display.
 * If the capacity is exceeded before the window expires, return no value
 * until the dropped samples have aged out rather than report a shorter window.
 */
export class ReferenceWindSpeedWindow {
  private readonly timestamps: Float64Array;
  private readonly speeds: Float64Array;
  private head = 0;
  private count = 0;
  private sum = 0;
  private lastTimestamp: number | null = null;
  private lastDroppedTimestamp: number | null = null;

  constructor(
    private readonly capacity = MAX_REFERENCE_WIND_SAMPLES,
    private readonly windowMs = REFERENCE_WIND_METRICS_WINDOW_MS,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1 || !Number.isFinite(windowMs) || windowMs <= 0) {
      throw new RangeError('reference wind window needs a positive capacity and duration');
    }
    this.timestamps = new Float64Array(capacity);
    this.speeds = new Float64Array(capacity);
  }

  get length(): number { return this.count; }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.sum = 0;
    this.lastTimestamp = null;
    this.lastDroppedTimestamp = null;
  }

  push(speed: number, timestampMs: number): void {
    if (!Number.isFinite(timestampMs)) return;
    // A delayed older notification must not erase valid in-window samples.
    // During a device-clock rollback, reads fail closed until time catches up.
    if (this.lastTimestamp !== null && timestampMs < this.lastTimestamp) return;
    this.lastTimestamp = timestampMs;
    this.evictExpired(timestampMs);
    if (!Number.isFinite(speed) || speed < 0) return;

    if (this.count === this.capacity) {
      this.lastDroppedTimestamp = this.timestamps[this.head];
      this.removeOldest();
    }
    const tail = (this.head + this.count) % this.capacity;
    this.timestamps[tail] = timestampMs;
    this.speeds[tail] = speed;
    this.count += 1;
    this.sum += speed;
  }

  getAverage(nowMs: number): number | null {
    if (!this.prepareRead(nowMs)) return null;
    return Math.round((this.sum / this.count + Number.EPSILON) * 100) / 100;
  }

  getObservedMax(nowMs: number): number | null {
    if (!this.prepareRead(nowMs)) return null;
    let max = -Infinity;
    for (let i = 0; i < this.count; i++) {
      max = Math.max(max, this.speeds[(this.head + i) % this.capacity]);
    }
    return max;
  }

  private prepareRead(nowMs: number): boolean {
    if (!Number.isFinite(nowMs) || (this.lastTimestamp !== null && nowMs < this.lastTimestamp)) return false;
    this.evictExpired(nowMs);
    return this.count > 0 && this.lastDroppedTimestamp === null;
  }

  private evictExpired(nowMs: number): void {
    const cutoff = nowMs - this.windowMs;
    while (this.count > 0 && this.timestamps[this.head] < cutoff) this.removeOldest();
    if (this.lastDroppedTimestamp !== null && this.lastDroppedTimestamp < cutoff) {
      this.lastDroppedTimestamp = null;
    }
  }

  private removeOldest(): void {
    this.sum -= this.speeds[this.head];
    this.head = (this.head + 1) % this.capacity;
    this.count -= 1;
    if (this.count === 0) this.sum = 0;
  }
}
