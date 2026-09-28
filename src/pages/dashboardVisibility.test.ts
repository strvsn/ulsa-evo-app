import { describe, expect, it } from 'vitest';
import { shouldRenderMemoryMonitor } from './dashboardVisibility';

describe('dashboard visibility guards', () => {
  it('never renders the memory monitor in production', () => {
    expect(shouldRenderMemoryMonitor(false, true)).toBe(false);
    expect(shouldRenderMemoryMonitor(false, false)).toBe(false);
  });

  it('renders the memory monitor only when development display is enabled', () => {
    expect(shouldRenderMemoryMonitor(true, true)).toBe(true);
    expect(shouldRenderMemoryMonitor(true, false)).toBe(false);
  });
});
