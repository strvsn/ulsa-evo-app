type PerfBucket = {
  count: number;
  totalMs: number;
  maxMs: number;
};

export const shouldEnableRenderPerfDiagnostics = (
  env: Pick<ImportMetaEnv, 'DEV' | 'VITE_RENDER_PERF_DEBUG'>
): boolean => env.DEV && env.VITE_RENDER_PERF_DEBUG === '1';

const PERF_DEBUG_ENABLED = shouldEnableRenderPerfDiagnostics(import.meta.env);
const FLUSH_INTERVAL_MS = 5000;

const buckets = new Map<string, PerfBucket>();
let lastFlushAt = 0;

const getNow = (): number => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
);

const flushPerfBuckets = (now: number): void => {
  if (buckets.size === 0 || now - lastFlushAt < FLUSH_INTERVAL_MS) return;

  const rows = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, bucket]) => ({
      name,
      count: bucket.count,
      totalMs: Number(bucket.totalMs.toFixed(2)),
      avgMs: Number((bucket.totalMs / bucket.count).toFixed(3)),
      maxMs: Number(bucket.maxMs.toFixed(3)),
    }));

  lastFlushAt = now;
  buckets.clear();
  console.table(rows);
};

export const recordPerfEvent = (name: string, durationMs = 0): void => {
  if (!PERF_DEBUG_ENABLED) return;

  const now = getNow();
  const bucket = buckets.get(name) ?? { count: 0, totalMs: 0, maxMs: 0 };
  bucket.count += 1;
  bucket.totalMs += durationMs;
  bucket.maxMs = Math.max(bucket.maxMs, durationMs);
  buckets.set(name, bucket);

  flushPerfBuckets(now);
};

export const measurePerfEvent = <T>(name: string, action: () => T): T => {
  if (!PERF_DEBUG_ENABLED) return action();

  const startedAt = getNow();
  try {
    return action();
  } finally {
    recordPerfEvent(name, getNow() - startedAt);
  }
};
