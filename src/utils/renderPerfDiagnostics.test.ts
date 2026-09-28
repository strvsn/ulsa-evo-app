import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldEnableRenderPerfDiagnostics } from './renderPerfDiagnostics';

const importDiagnostics = async (renderPerfDebug: '0' | '1') => {
  vi.resetModules();
  vi.stubEnv('VITE_RENDER_PERF_DEBUG', renderPerfDebug);
  return import('./renderPerfDiagnostics');
};

describe('renderPerfDiagnostics', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('runs measured actions exactly once and stays silent when the perf flag is disabled', async () => {
    const consoleTable = vi.spyOn(console, 'table').mockImplementation(() => {});
    const { measurePerfEvent, recordPerfEvent } = await importDiagnostics('0');
    const action = vi.fn(() => 'ok');

    expect(measurePerfEvent('LineChart.setOption', action)).toBe('ok');
    recordPerfEvent('LineChart.setOption', 12);

    expect(action).toHaveBeenCalledTimes(1);
    expect(consoleTable).not.toHaveBeenCalled();
  });

  it('keeps production diagnostics disabled even when the perf flag is enabled', () => {
    expect(shouldEnableRenderPerfDiagnostics({ DEV: false, VITE_RENDER_PERF_DEBUG: '1' })).toBe(false);
    expect(shouldEnableRenderPerfDiagnostics({ DEV: true, VITE_RENDER_PERF_DEBUG: '0' })).toBe(false);
    expect(shouldEnableRenderPerfDiagnostics({ DEV: true, VITE_RENDER_PERF_DEBUG: '1' })).toBe(true);
  });

  it('flushes counters as a console table no more often than every five seconds', async () => {
    const consoleTable = vi.spyOn(console, 'table').mockImplementation(() => {});
    const nowSpy = vi.spyOn(performance, 'now');
    const { recordPerfEvent } = await importDiagnostics('1');

    nowSpy.mockReturnValue(1000);
    recordPerfEvent('LineChart.setOption', 3);
    nowSpy.mockReturnValue(4999);
    recordPerfEvent('LineChart.setOption', 4);

    expect(consoleTable).not.toHaveBeenCalled();

    nowSpy.mockReturnValue(5000);
    recordPerfEvent('Dashboard.render', 0);

    expect(consoleTable).toHaveBeenCalledTimes(1);
    expect(consoleTable).toHaveBeenCalledWith([
      {
        name: 'Dashboard.render',
        count: 1,
        totalMs: 0,
        avgMs: 0,
        maxMs: 0,
      },
      {
        name: 'LineChart.setOption',
        count: 2,
        totalMs: 7,
        avgMs: 3.5,
        maxMs: 4,
      },
    ]);
  });
});
