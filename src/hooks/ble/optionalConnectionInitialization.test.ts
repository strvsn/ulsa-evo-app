import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OPTIONAL_CONNECTION_TASK_TIMEOUT_MS,
  startOptionalConnectionTasks,
  type OptionalConnectionTask,
} from './optionalConnectionInitialization';

describe('optional connection task runner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts independent tasks without waiting for a pending task', async () => {
    let resolvePending!: (value: unknown) => void;
    const pending = new Promise<unknown>((resolve) => {
      resolvePending = resolve;
    });
    const applied = vi.fn();
    const tasks: OptionalConnectionTask<unknown>[] = [
      { name: 'pending', read: () => pending, apply: vi.fn() },
      { name: 'ready', read: async () => 'ready', apply: applied },
    ];

    startOptionalConnectionTasks(tasks, () => true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(applied).toHaveBeenCalledWith('ready');
    resolvePending('done');
  });

  it('times out one task without affecting the others', async () => {
    vi.useFakeTimers();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rejected = vi.fn();
    const applied = vi.fn();
    const tasks: OptionalConnectionTask<unknown>[] = [
      { name: 'pending', read: () => new Promise(() => undefined), apply: vi.fn(), reject: rejected },
      { name: 'ready', read: async () => 'ready', apply: applied },
    ];

    startOptionalConnectionTasks(tasks, () => true);
    await vi.advanceTimersByTimeAsync(OPTIONAL_CONNECTION_TASK_TIMEOUT_MS);

    expect(rejected).toHaveBeenCalledOnce();
    expect(applied).toHaveBeenCalledWith('ready');
    consoleWarn.mockRestore();
  });

  it('drops delayed results from an old connection session', async () => {
    let currentSession = true;
    let resolveRead!: (value: unknown) => void;
    const apply = vi.fn();
    const read = new Promise<unknown>((resolve) => {
      resolveRead = resolve;
    });

    startOptionalConnectionTasks(
      [{ name: 'delayed', read: () => read, apply }],
      () => currentSession
    );
    currentSession = false;
    resolveRead('stale');
    await Promise.resolve();
    await Promise.resolve();

    expect(apply).not.toHaveBeenCalled();
  });
});
