import {
  BROWSER_LOG_CSV_HEADER,
  formatBrowserLogCsvRow,
  formatBrowserLogFilenameTimestamp,
  getUtf8ByteLength,
} from './csv';
import { createStoredBrowserLogArchive } from './exportFiles';
import { acquireBrowserLogWriterLock } from './lock';
import {
  deleteAllBrowserLogs,
  deleteBrowserLogSession,
  deleteBrowserLogSessions,
  listAllBrowserLogSegments,
  putBrowserLogChunkAndSegment,
  putBrowserLogSegment,
  putBrowserLogSegments,
} from './store';
import { EMPTY_BROWSER_LOG_CATALOG, summarizeBrowserLogSegments } from './catalog';
import {
  BROWSER_LOG_MAX_STORED_BYTES,
  BROWSER_LOG_MIN_FREE_BYTES,
  BROWSER_LOG_RETENTION_MS,
  BrowserLogStorageError,
  createBrowserLogCapacityError,
  estimateBrowserLogStorage,
  normalizeBrowserLogStorageError,
} from './policy';
import type {
  BrowserLogCatalogSummary,
  BrowserLogExportPlan,
  BrowserLogPreparedArchive,
  BrowserLogSampleInput,
  BrowserLogSegmentRecord,
  BrowserLogSessionSummary,
  BrowserLogStatus,
  BrowserLogWriterLock,
  BrowserLogExportScope,
  BrowserLogWriterOptions,
} from './types';
const DEFAULT_SEGMENT_DURATION_MS = 30 * 60 * 1000;
const DEFAULT_SEGMENT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_FLUSH_BYTES = 64 * 1024;
const DEFAULT_FLUSH_ROWS = 256;
let sessionCounter = 0;

const createSessionId = (timestampMs: number): string =>
  `ble-${timestampMs}-${String(++sessionCounter).padStart(4, '0')}`;

export class BrowserLogWriter {
  private active = false;
  private sessionId: string | null = null;
  private sessionStartedAt: number | null = null;
  private sessionEndedAt: number | null = null;
  private sessionLastActivityAt: number | null = null;
  private segment: BrowserLogSegmentRecord | null = null;
  private segmentIndex = 0;
  private completedSegmentCount = 0;
  private pendingRows: string[] = [];
  private pendingBytes = 0;
  private pendingDataRows = 0;
  private totalRowCount = 0;
  private totalBytes = 0;
  private lastSampleAt: number | null = null;
  private error: string | null = null;
  private storageBlocked = false;
  private maintenanceNotice: string | null = null;
  private storageEstimate: StorageEstimate | null = null;
  private operationChain: Promise<void> = Promise.resolve();
  private catalog: BrowserLogCatalogSummary = EMPTY_BROWSER_LOG_CATALOG;
  private initializePromise: Promise<void> | null = null;
  private writerLock: BrowserLogWriterLock | null = null;

  private readonly segmentDurationMs: number;
  private readonly segmentMaxBytes: number;
  private readonly flushBytes: number;
  private readonly flushRows: number;
  private readonly retentionMs: number;
  private readonly maxStoredBytes: number;
  private readonly minFreeBytes: number;
  private readonly estimateStorage: () => Promise<StorageEstimate | null>;
  private readonly acquireWriterLock: () => Promise<BrowserLogWriterLock>;
  private readonly now: () => number;

  constructor(options: BrowserLogWriterOptions = {}) {
    this.segmentDurationMs = options.segmentDurationMs ?? DEFAULT_SEGMENT_DURATION_MS;
    this.segmentMaxBytes = options.segmentMaxBytes ?? DEFAULT_SEGMENT_MAX_BYTES;
    this.flushBytes = options.flushBytes ?? DEFAULT_FLUSH_BYTES;
    this.flushRows = options.flushRows ?? DEFAULT_FLUSH_ROWS;
    this.retentionMs = options.retentionMs ?? BROWSER_LOG_RETENTION_MS;
    this.maxStoredBytes = options.maxStoredBytes ?? BROWSER_LOG_MAX_STORED_BYTES;
    this.minFreeBytes = options.minFreeBytes ?? BROWSER_LOG_MIN_FREE_BYTES;
    this.estimateStorage = options.estimateStorage ?? estimateBrowserLogStorage;
    this.acquireWriterLock = options.acquireWriterLock ?? acquireBrowserLogWriterLock;
    this.now = options.now ?? Date.now;
  }

  isActive(): boolean {
    return this.active;
  }

  getStatus(): BrowserLogStatus {
    const currentHasData = this.sessionId !== null && this.totalRowCount > 0;
    const currentSegmentCount = currentHasData
      ? this.completedSegmentCount + (this.segment && !this.segment.completed ? 1 : 0)
      : 0;
    const storedBytes = this.catalog.sizeBytes + (currentHasData ? this.totalBytes : 0);
    const storageRemainingBytes = Math.max(0, this.maxStoredBytes - storedBytes);
    const storageQuotaBytes = this.storageEstimate?.quota ?? null;
    const storageUsageBytes = this.storageEstimate?.usage ?? null;
    const originRemainingBytes = storageQuotaBytes === null || storageUsageBytes === null
      ? null
      : Math.max(0, storageQuotaBytes - storageUsageBytes);
    const originWritableBytes = originRemainingBytes === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, originRemainingBytes - this.minFreeBytes);
    const effectiveWritableBytes = Math.max(0, Math.min(storageRemainingBytes, originWritableBytes));
    const sessions = this.getSessionSummaries(currentHasData, currentSegmentCount);

    return {
      active: this.active,
      sessionId: this.sessionId,
      rowCount: this.totalRowCount,
      segmentCount: this.completedSegmentCount + (this.segment && !this.segment.completed ? 1 : 0),
      completedSegmentCount: this.completedSegmentCount,
      currentSegmentStartedAt: this.segment?.startedAt ?? null,
      lastSampleAt: this.lastSampleAt,
      bufferedBytes: this.pendingBytes,
      storedSessionCount: this.catalog.sessionCount + (currentHasData ? 1 : 0),
      storedSegmentCount: this.catalog.segmentCount + currentSegmentCount,
      storedRowCount: this.catalog.rowCount + this.totalRowCount,
      storedBytes,
      hasExportableData: this.catalog.rowCount > 0 || (!this.active && currentHasData),
      sessions,
      retentionDays: Math.max(1, Math.round(this.retentionMs / (24 * 60 * 60 * 1000))),
      maxStoredBytes: this.maxStoredBytes,
      minFreeBytes: this.minFreeBytes,
      storageRemainingBytes,
      storageQuotaBytes,
      storageUsageBytes,
      originRemainingBytes,
      effectiveWritableBytes,
      storageLimitReached: this.storageBlocked || effectiveWritableBytes <= 0,
      maintenanceNotice: this.maintenanceNotice,
      error: this.error,
    };
  }

  async initialize(): Promise<BrowserLogStatus> {
    if (!this.initializePromise) {
      this.initializePromise = this.withExclusiveLock(
        () => this.performMaintenanceAndRefresh(this.now()),
      ).catch(async (error: unknown) => {
        await this.refreshCatalogAndEstimate().catch(() => undefined);
        const normalized = normalizeBrowserLogStorageError(error);
        this.error = normalized.message;
        this.storageBlocked = normalized.code === 'capacity' || normalized.code === 'quota';
      });
    }
    await this.initializePromise;
    return this.getStatus();
  }

  async start(startedAt: number = this.now()): Promise<BrowserLogStatus> {
    await this.initialize();
    await this.operationChain;
    const lock = await this.acquireWriterLock();
    this.writerLock = lock;
    let preserveInterruptedSession = this.segment !== null || this.pendingRows.length > 0;
    try {
      await lock.assertHeld();
      if (this.segment || this.pendingRows.length > 0) {
        await this.tryFinalizeInterruptedSession();
        if (this.segment || this.pendingRows.length > 0) {
          throw new BrowserLogStorageError(
            'storage',
            '前回停止時の未確定ログを保存できていません。不要な保存済みログを削除して状態を更新してから再試行してください。',
          );
        }
        preserveInterruptedSession = false;
      }
      await this.performMaintenanceAndRefresh(startedAt);
      this.resetCurrentSessionState();
      await this.refreshCatalogAndEstimate();
      this.error = null;
      this.storageBlocked = false;
      const headerBytes = getUtf8ByteLength(BROWSER_LOG_CSV_HEADER);
      await this.ensureStorageAvailable(headerBytes, true);
      this.sessionId = createSessionId(startedAt);
      this.sessionStartedAt = startedAt;
      this.sessionLastActivityAt = startedAt;
      await this.createSegment(startedAt, startedAt);
      this.active = true;
    } catch (error) {
      const normalized = normalizeBrowserLogStorageError(error);
      if (!preserveInterruptedSession) this.resetCurrentSessionState();
      this.error = normalized.message;
      this.storageBlocked = preserveInterruptedSession || normalized.code === 'capacity' || normalized.code === 'quota';
      await this.releaseActiveWriterLock();
      throw normalized;
    }
    return this.getStatus();
  }

  async appendSample(input: BrowserLogSampleInput): Promise<BrowserLogStatus> {
    this.operationChain = this.operationChain.then(async () => {
      if (!this.active || !this.segment) return;
      await this.writerLock?.assertHeld();

      const receivedAt = input.receivedAt ?? this.now();
      const sampleAt = Number.isFinite(input.sample.timestamp) ? input.sample.timestamp : receivedAt;
      const row = formatBrowserLogCsvRow(input.sample, receivedAt);
      const rowBytes = getUtf8ByteLength(row);
      const willRotate = this.shouldRotate(sampleAt, rowBytes);
      const additionalBytes = rowBytes + (willRotate ? getUtf8ByteLength(BROWSER_LOG_CSV_HEADER) : 0);

      try {
        await this.ensureStorageAvailable(additionalBytes, false);
      } catch (error) {
        await this.stopForStoragePolicy(sampleAt, receivedAt, normalizeBrowserLogStorageError(error));
        return;
      }

      if (willRotate) {
        await this.completeCurrentSegment(sampleAt, receivedAt);
        await this.createSegment(sampleAt, receivedAt);
      }

      if (!this.segment) return;
      this.pendingRows.push(row);
      this.pendingBytes += rowBytes;
      this.pendingDataRows++;
      this.segment.rowCount++;
      this.segment.sizeBytes += rowBytes;
      this.totalRowCount++;
      this.totalBytes += rowBytes;
      this.lastSampleAt = sampleAt;
      this.sessionLastActivityAt = receivedAt;

      if (this.pendingBytes >= this.flushBytes || this.pendingDataRows >= this.flushRows) {
        await this.flushPending();
      }
    }).catch(async (error: unknown) => {
      const normalized = normalizeBrowserLogStorageError(error);
      this.error = normalized.message;
      this.storageBlocked = normalized.code === 'capacity' || normalized.code === 'quota';
      this.active = false;
      await this.releaseActiveWriterLock();
    });

    await this.operationChain;
    return this.getStatus();
  }

  async stop(stoppedAt: number = this.now()): Promise<BrowserLogStatus> {
    await this.operationChain;
    try {
      await this.writerLock?.assertHeld();
      const emptySessionId = this.totalRowCount === 0 ? this.sessionId : null;
      if (this.segment) {
        await this.completeCurrentSegment(stoppedAt, stoppedAt);
        this.segment = null;
      }
      this.active = false;
      this.sessionEndedAt = stoppedAt;
      this.sessionLastActivityAt = stoppedAt;
      if (emptySessionId) {
        await deleteBrowserLogSession(emptySessionId);
        this.resetCurrentSessionState();
      }
      await this.refreshStorageEstimate();
      return this.getStatus();
    } finally {
      await this.releaseActiveWriterLock();
    }
  }

  async prepareExport(
    sessionId: BrowserLogExportScope = null,
    batchIndex: number = 0,
    createdAt: number = this.now(),
    plan: BrowserLogExportPlan | null = null,
  ): Promise<BrowserLogPreparedArchive> {
    await this.initialize();
    await this.operationChain;
    return this.withExclusiveLock(async () => {
      if (this.active) throw new Error('アプリ内ログ停止後にZIPを作成できます。');
      if (this.segment) {
        await this.tryFinalizeInterruptedSession();
        if (this.segment) {
          throw new Error('未確定ログを保存できないため、ZIPを作成できません。不要なログを削除して状態を更新してください。');
        }
      }
      return createStoredBrowserLogArchive(sessionId, createdAt, batchIndex, plan);
    });
  }

  async deleteSession(sessionId: string): Promise<BrowserLogStatus> {
    await this.initialize();
    await this.operationChain;
    return this.withExclusiveLock(async () => {
      if (this.active) throw new Error('アプリ内ログ停止後に削除できます。');
      await deleteBrowserLogSession(sessionId);
      if (this.sessionId === sessionId) this.resetCurrentSessionState();
      await this.tryFinalizeInterruptedSession();
      await this.refreshCatalogAndEstimate();
      this.error = null;
      this.storageBlocked = false;
      this.maintenanceNotice = '選択したアプリ内ログを削除しました。';
      return this.getStatus();
    });
  }

  async deleteAll(): Promise<BrowserLogStatus> {
    await this.initialize();
    await this.operationChain;
    return this.withExclusiveLock(async () => {
      if (this.active) throw new Error('アプリ内ログ停止後に削除できます。');
      await deleteAllBrowserLogs();
      this.resetCurrentSessionState();
      this.catalog = EMPTY_BROWSER_LOG_CATALOG;
      await this.refreshStorageEstimate();
      this.error = null;
      this.storageBlocked = false;
      this.maintenanceNotice = '保存済みアプリ内ログをすべて削除しました。';
      return this.getStatus();
    });
  }

  async refreshStorage(): Promise<BrowserLogStatus> {
    await this.initialize();
    await this.operationChain;
    return this.withExclusiveLock(async () => {
      await this.performMaintenanceAndRefresh(this.now());
      return this.getStatus();
    });
  }

  async clearSession(): Promise<BrowserLogStatus> {
    if (!this.sessionId) return this.getStatus();
    return this.deleteSession(this.sessionId);
  }

  private getSessionSummaries(
    currentHasData: boolean,
    currentSegmentCount: number,
  ): BrowserLogSessionSummary[] {
    const sessions = this.catalog.sessions.filter((session) => session.sessionId !== this.sessionId);
    if (
      currentHasData &&
      this.sessionId &&
      this.sessionStartedAt !== null &&
      this.sessionLastActivityAt !== null
    ) {
      sessions.push({
        sessionId: this.sessionId,
        startedAt: this.sessionStartedAt,
        endedAt: this.sessionEndedAt,
        lastActivityAt: this.sessionLastActivityAt,
        retentionAnchorAt: this.sessionLastActivityAt,
        expiresAt: this.sessionLastActivityAt + this.retentionMs,
        rowCount: this.totalRowCount,
        segmentCount: currentSegmentCount,
        sizeBytes: this.totalBytes,
        completed: !this.active && this.segment === null,
      });
    }
    return sessions.sort((a, b) => b.startedAt - a.startedAt || b.sessionId.localeCompare(a.sessionId));
  }

  private shouldRotate(sampleAt: number, nextRowBytes: number): boolean {
    if (!this.segment) return false;
    return (
      sampleAt - this.segment.startedAt >= this.segmentDurationMs ||
      this.segment.sizeBytes + nextRowBytes > this.segmentMaxBytes
    );
  }

  private async createSegment(startedAt: number, retentionAnchorAt: number): Promise<void> {
    if (!this.sessionId) throw new Error('アプリ内ログセッションが開始されていません');
    const filename = `ulsa_ble_${formatBrowserLogFilenameTimestamp(startedAt)}_${String(this.segmentIndex + 1).padStart(2, '0')}.csv`;
    const headerBytes = getUtf8ByteLength(BROWSER_LOG_CSV_HEADER);
    this.segment = {
      id: `${this.sessionId}-${this.segmentIndex}`,
      sessionId: this.sessionId,
      filename,
      startedAt,
      endedAt: null,
      rowCount: 0,
      sizeBytes: headerBytes,
      chunkCount: 0,
      completed: false,
      retentionAnchorAt,
    };
    this.pendingRows = [BROWSER_LOG_CSV_HEADER];
    this.pendingBytes = headerBytes;
    this.pendingDataRows = 0;
    this.totalBytes += headerBytes;
    await putBrowserLogSegment(this.segment);
  }

  private async completeCurrentSegment(endedAt: number, retentionAnchorAt: number): Promise<void> {
    if (!this.segment) return;
    await this.flushPending();
    const completedSegment: BrowserLogSegmentRecord = {
      ...this.segment,
      endedAt,
      completed: true,
      retentionAnchorAt,
    };
    await putBrowserLogSegment(completedSegment);
    this.segment = completedSegment;
    this.completedSegmentCount++;
    this.segmentIndex++;
  }

  private async flushPending(): Promise<void> {
    if (!this.segment || this.pendingRows.length === 0) return;
    await this.ensureOriginReserve(this.pendingBytes);
    const text = this.pendingRows.join('');
    const chunkIndex = this.segment.chunkCount;
    const nextSegment: BrowserLogSegmentRecord = {
      ...this.segment,
      chunkCount: chunkIndex + 1,
      retentionAnchorAt: this.sessionLastActivityAt ?? this.segment.retentionAnchorAt,
    };
    await putBrowserLogChunkAndSegment({
      id: `${this.segment.id}-${chunkIndex}`,
      segmentId: this.segment.id,
      sessionId: this.segment.sessionId,
      chunkIndex,
      text,
    }, nextSegment);
    this.segment = nextSegment;
    this.pendingRows = [];
    this.pendingBytes = 0;
    this.pendingDataRows = 0;
  }

  private async stopForStoragePolicy(
    endedAt: number,
    retentionAnchorAt: number,
    error: BrowserLogStorageError,
  ): Promise<void> {
    try {
      await this.completeCurrentSegment(endedAt, retentionAnchorAt);
      this.segment = null;
      this.sessionEndedAt = retentionAnchorAt;
      this.sessionLastActivityAt = retentionAnchorAt;
    } catch (flushError) {
      const normalizedFlushError = normalizeBrowserLogStorageError(flushError);
      this.error = normalizedFlushError.message;
      this.storageBlocked = true;
      this.active = false;
      await this.releaseActiveWriterLock();
      return;
    }
    this.error = error.message;
    this.storageBlocked = true;
    this.active = false;
    await this.releaseActiveWriterLock();
  }

  private async ensureStorageAvailable(additionalBytes: number, checkOrigin: boolean): Promise<void> {
    const acceptedBytes = this.catalog.sizeBytes + this.totalBytes;
    if (acceptedBytes + additionalBytes > this.maxStoredBytes) {
      throw createBrowserLogCapacityError();
    }
    if (checkOrigin) await this.ensureOriginReserve(additionalBytes);
  }

  private async ensureOriginReserve(additionalBytes: number): Promise<void> {
    await this.refreshStorageEstimate();
    const quota = this.storageEstimate?.quota;
    const usage = this.storageEstimate?.usage;
    if (quota === undefined || usage === undefined) return;
    if (quota - usage - this.minFreeBytes < additionalBytes) {
      throw new BrowserLogStorageError(
        'quota',
        '端末の保存領域に16 MiBの安全余裕を確保できないため、アプリ内ログを停止しました。保存済みログをZIPで書き出してから削除してください。',
      );
    }
  }

  private async performMaintenanceAndRefresh(now: number): Promise<void> {
    let segments = await listAllBrowserLogSegments();
    const initialSessionsWithData = new Set(
      segments.filter((segment) => segment.rowCount > 0).map((segment) => segment.sessionId),
    );
    const legacySegments = segments.filter(
      (segment) => initialSessionsWithData.has(segment.sessionId) && segment.retentionAnchorAt === undefined,
    );
    const notices: string[] = [];
    if (legacySegments.length > 0) {
      const migrated = segments.map((segment) => (
        initialSessionsWithData.has(segment.sessionId) && segment.retentionAnchorAt === undefined
        ? { ...segment, retentionAnchorAt: now }
        : segment
      ));
      await putBrowserLogSegments(migrated);
      segments = migrated;
      notices.push(`既存ログ${new Set(legacySegments.map((segment) => segment.sessionId)).size}件に30日の保持猶予を設定しました。`);
    }

    const sessionsWithData = new Set(
      segments.filter((segment) => segment.rowCount > 0).map((segment) => segment.sessionId),
    );
    const emptySessionIds = Array.from(new Set(
      segments
        .filter((segment) => !sessionsWithData.has(segment.sessionId))
        .map((segment) => segment.sessionId),
    )).filter((sessionId) => !this.active || sessionId !== this.sessionId);
    if (emptySessionIds.length > 0) {
      const emptyIds = new Set(emptySessionIds);
      await deleteBrowserLogSessions(emptySessionIds);
      segments = segments.filter((segment) => !emptyIds.has(segment.sessionId));
    }

    let summary = summarizeBrowserLogSegments(segments, this.retentionMs);
    const expiredSessions = summary.sessions.filter(
      (session) => session.expiresAt <= now && (!this.active || session.sessionId !== this.sessionId),
    );
    if (expiredSessions.length > 0) {
      await deleteBrowserLogSessions(expiredSessions.map((session) => session.sessionId));
      const expiredIds = new Set(expiredSessions.map((session) => session.sessionId));
      segments = segments.filter((segment) => !expiredIds.has(segment.sessionId));
      if (this.sessionId && expiredIds.has(this.sessionId)) this.resetCurrentSessionState();
      summary = summarizeBrowserLogSegments(segments, this.retentionMs);
      notices.push(`保持期限を超えたアプリ内ログ${expiredSessions.length}件を自動削除しました。`);
    }
    this.catalog = this.sessionId === null
      ? summary
      : summarizeBrowserLogSegments(
        segments.filter((segment) => segment.sessionId !== this.sessionId),
        this.retentionMs,
      );
    this.maintenanceNotice = notices.length > 0 ? notices.join(' ') : this.maintenanceNotice;
    await this.refreshStorageEstimate();
  }

  private async refreshCatalogAndEstimate(): Promise<void> {
    const segments = await listAllBrowserLogSegments();
    this.catalog = summarizeBrowserLogSegments(
      this.sessionId === null
        ? segments
        : segments.filter((segment) => segment.sessionId !== this.sessionId),
      this.retentionMs,
    );
    await this.refreshStorageEstimate();
  }

  private async refreshStorageEstimate(): Promise<void> {
    this.storageEstimate = await this.estimateStorage();
  }

  private async tryFinalizeInterruptedSession(): Promise<void> {
    if (!this.segment) return;
    try {
      const endedAt = this.now();
      await this.completeCurrentSegment(endedAt, endedAt);
      this.segment = null;
      this.sessionEndedAt = endedAt;
      this.sessionLastActivityAt = endedAt;
    } catch {
      // Keep the original storage error and pending buffer for another recovery attempt.
    }
  }

  private resetCurrentSessionState(): void {
    this.active = false;
    this.sessionId = null;
    this.sessionStartedAt = null;
    this.sessionEndedAt = null;
    this.sessionLastActivityAt = null;
    this.segment = null;
    this.segmentIndex = 0;
    this.completedSegmentCount = 0;
    this.pendingRows = [];
    this.pendingBytes = 0;
    this.pendingDataRows = 0;
    this.totalRowCount = 0;
    this.totalBytes = 0;
    this.lastSampleAt = null;
  }

  private async withExclusiveLock<T>(action: () => Promise<T>): Promise<T> {
    if (this.writerLock) {
      await this.writerLock.assertHeld();
      return action();
    }
    const lock = await this.acquireWriterLock();
    try {
      await lock.assertHeld();
      return await action();
    } finally {
      await lock.release();
    }
  }

  private async releaseActiveWriterLock(): Promise<void> {
    const lock = this.writerLock;
    this.writerLock = null;
    if (lock) await lock.release();
  }
}
