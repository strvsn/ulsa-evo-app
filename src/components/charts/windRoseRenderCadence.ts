export const WIND_ROSE_MAX_RENDER_FPS = 30;
export const WIND_ROSE_MIN_RENDER_INTERVAL_MS = 1000 / WIND_ROSE_MAX_RENDER_FPS;
const WIND_ROSE_FRAME_TIMESTAMP_TOLERANCE_MS = 0.5;

/**
 * Limits expensive Canvas submissions without changing the 120 Hz fixed-step
 * motion model. Skipped display callbacks are intentionally not simulation
 * steps; the next accepted frame advances the model to the current timestamp.
 */
export class WindRoseRenderCadence {
  private nextRenderAt: number | null = null;

  shouldRender(timestampMs: number): boolean {
    if (this.nextRenderAt === null) {
      this.nextRenderAt = timestampMs + WIND_ROSE_MIN_RENDER_INTERVAL_MS;
      return true;
    }
    if (timestampMs + WIND_ROSE_FRAME_TIMESTAMP_TOLERANCE_MS < this.nextRenderAt) {
      return false;
    }

    do {
      this.nextRenderAt += WIND_ROSE_MIN_RENDER_INTERVAL_MS;
    } while (this.nextRenderAt <= timestampMs);
    return true;
  }

  reset(): void {
    this.nextRenderAt = null;
  }
}
