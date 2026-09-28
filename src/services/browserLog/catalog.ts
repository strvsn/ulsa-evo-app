import type { BrowserLogCatalogSummary, BrowserLogSegmentRecord } from './types';
import { BROWSER_LOG_RETENTION_MS } from './policy';

export const EMPTY_BROWSER_LOG_CATALOG: BrowserLogCatalogSummary = {
  sessionCount: 0,
  segmentCount: 0,
  rowCount: 0,
  sizeBytes: 0,
  sessions: [],
};

export const summarizeBrowserLogSegments = (
  segments: BrowserLogSegmentRecord[],
  retentionMs: number = BROWSER_LOG_RETENTION_MS,
): BrowserLogCatalogSummary => {
  const dataSegments = segments.filter((segment) => segment.rowCount > 0);
  const sessionsById = new Map<string, BrowserLogCatalogSummary['sessions'][number]>();
  for (const segment of dataSegments) {
    const existing = sessionsById.get(segment.sessionId);
    const segmentLastActivityAt = segment.endedAt ?? segment.startedAt;
    const segmentRetentionAnchorAt = segment.retentionAnchorAt ?? segmentLastActivityAt;
    if (!existing) {
      sessionsById.set(segment.sessionId, {
        sessionId: segment.sessionId,
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
        lastActivityAt: segmentLastActivityAt,
        retentionAnchorAt: segmentRetentionAnchorAt,
        expiresAt: segmentRetentionAnchorAt + retentionMs,
        rowCount: segment.rowCount,
        segmentCount: 1,
        sizeBytes: segment.sizeBytes,
        completed: segment.completed,
      });
      continue;
    }
    existing.startedAt = Math.min(existing.startedAt, segment.startedAt);
    existing.endedAt = existing.endedAt === null || segment.endedAt === null
      ? null
      : Math.max(existing.endedAt, segment.endedAt);
    existing.lastActivityAt = Math.max(existing.lastActivityAt, segmentLastActivityAt);
    existing.retentionAnchorAt = Math.max(existing.retentionAnchorAt, segmentRetentionAnchorAt);
    existing.expiresAt = existing.retentionAnchorAt + retentionMs;
    existing.rowCount += segment.rowCount;
    existing.segmentCount += 1;
    existing.sizeBytes += segment.sizeBytes;
    existing.completed &&= segment.completed;
  }
  const sessions = Array.from(sessionsById.values()).sort(
    (a, b) => b.startedAt - a.startedAt || b.sessionId.localeCompare(a.sessionId)
  );
  return {
    sessionCount: sessions.length,
    segmentCount: dataSegments.length,
    rowCount: dataSegments.reduce((total, segment) => total + segment.rowCount, 0),
    sizeBytes: dataSegments.reduce((total, segment) => total + segment.sizeBytes, 0),
    sessions,
  };
};
