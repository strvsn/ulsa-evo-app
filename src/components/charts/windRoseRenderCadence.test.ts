import { describe, expect, it } from 'vitest';
import {
  WIND_ROSE_MAX_RENDER_FPS,
  WindRoseRenderCadence,
} from './windRoseRenderCadence';

describe('WindRoseRenderCadence', () => {
  it('caps 120 Hz display callbacks to approximately 30 Canvas submissions per second', () => {
    const cadence = new WindRoseRenderCadence();
    let rendered = 0;
    for (let index = 0; index <= 120; index += 1) {
      if (cadence.shouldRender(index * (1000 / 120))) rendered += 1;
    }

    expect(rendered).toBeGreaterThanOrEqual(WIND_ROSE_MAX_RENDER_FPS);
    expect(rendered).toBeLessThanOrEqual(WIND_ROSE_MAX_RENDER_FPS + 1);
  });


  it('allows an immediate redraw after visibility or layout reset', () => {
    const cadence = new WindRoseRenderCadence();
    expect(cadence.shouldRender(100)).toBe(true);
    expect(cadence.shouldRender(110)).toBe(false);

    cadence.reset();
    expect(cadence.shouldRender(110)).toBe(true);
  });

});
