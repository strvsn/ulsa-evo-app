import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserLogChunkRecord, BrowserLogSegmentRecord } from './types';
const storeMock = vi.hoisted(() => ({
    chunks: new Map<string, BrowserLogChunkRecord>(),
    segments: new Map<string, BrowserLogSegmentRecord>(),
    leaseOwner: null as string | null,
    failAtomicCommits: false,
}));
vi.mock('./store', () => ({
    putBrowserLogSegment: vi.fn(async (segment: BrowserLogSegmentRecord) => {
        storeMock.segments.set(segment.id, { ...segment });
    }),
    putBrowserLogSegments: vi.fn(async (segments: BrowserLogSegmentRecord[]) => {
        for (const segment of segments)
            storeMock.segments.set(segment.id, { ...segment });
    }),
    putBrowserLogChunk: vi.fn(async (chunk: BrowserLogChunkRecord) => {
        storeMock.chunks.set(chunk.id, { ...chunk });
    }),
    putBrowserLogChunkAndSegment: vi.fn(async (chunk: BrowserLogChunkRecord, segment: BrowserLogSegmentRecord) => {
        if (storeMock.failAtomicCommits)
            throw new DOMException('quota', 'QuotaExceededError');
        storeMock.chunks.set(chunk.id, { ...chunk });
        storeMock.segments.set(segment.id, { ...segment });
    }),
    listBrowserLogSegments: vi.fn(async (sessionId: string) => Array.from(storeMock.segments.values()).filter((segment) => segment.sessionId === sessionId)),
    listAllBrowserLogSegments: vi.fn(async () => Array.from(storeMock.segments.values())
        .sort((a, b) => a.startedAt - b.startedAt || a.filename.localeCompare(b.filename))),
    listBrowserLogChunks: vi.fn(async (segmentId: string) => Array.from(storeMock.chunks.values()).filter((chunk) => chunk.segmentId === segmentId)),
    deleteBrowserLogSession: vi.fn(async (sessionId: string) => {
        for (const [id, segment] of storeMock.segments) {
            if (segment.sessionId === sessionId)
                storeMock.segments.delete(id);
        }
        for (const [id, chunk] of storeMock.chunks) {
            if (chunk.sessionId === sessionId)
                storeMock.chunks.delete(id);
        }
    }),
    deleteBrowserLogSessions: vi.fn(async (sessionIds: string[]) => {
        const targets = new Set(sessionIds);
        for (const [id, segment] of storeMock.segments) {
            if (targets.has(segment.sessionId))
                storeMock.segments.delete(id);
        }
        for (const [id, chunk] of storeMock.chunks) {
            if (targets.has(chunk.sessionId))
                storeMock.chunks.delete(id);
        }
    }),
    deleteAllBrowserLogs: vi.fn(async () => {
        storeMock.segments.clear();
        storeMock.chunks.clear();
    }),
    streamBrowserLogChunks: vi.fn(async (segmentId: string, onChunk: (chunk: BrowserLogChunkRecord) => void) => {
        Array.from(storeMock.chunks.values())
            .filter((chunk) => chunk.segmentId === segmentId)
            .sort((a, b) => a.chunkIndex - b.chunkIndex)
            .forEach(onChunk);
    }),
    acquireBrowserLogWriterLease: vi.fn(async (ownerId: string) => {
        if (storeMock.leaseOwner && storeMock.leaseOwner !== ownerId)
            return false;
        storeMock.leaseOwner = ownerId;
        return true;
    }),
    renewBrowserLogWriterLease: vi.fn(async (ownerId: string) => storeMock.leaseOwner === ownerId),
    releaseBrowserLogWriterLease: vi.fn(async (ownerId: string) => {
        if (storeMock.leaseOwner === ownerId)
            storeMock.leaseOwner = null;
    }),
}));
import { BrowserLogWriter } from './BrowserLogWriter';
import { BROWSER_LOG_CSV_HEADER, formatBrowserLogCsvRow, formatBrowserLogFilenameTimestamp, formatBrowserLogTimestampIso, getUtf8ByteLength, } from './csv';
import type { SensorData } from '../../types/ble';
const sample = (timestamp: number): SensorData => ({
    windDirection: 123.456,
    windSpeed: 1.23456,
    windSpeedA: null,
    windSpeedB: null,
    temperature: 24.567,
    soundSpeed: 344.1234,
    headingSpeed: 0.4567,
    sensorStatus: 1,
    statusProtocolVersion: 2,
    statusFlags: 192,
    serviceStatus: 6,
    activeCause: 0,
    ntcReadingStatus: 0,
    timestamp,
});
describe('browser log writer', () => {
    beforeEach(() => {
        storeMock.chunks.clear();
        storeMock.segments.clear();
        storeMock.leaseOwner = null;
        storeMock.failAtomicCommits = false;
    });
    it('formats BLE sensor samples as CSV rows', () => {
        expect(formatBrowserLogCsvRow(sample(1000), 1200))
            .toBe(`${formatBrowserLogTimestampIso(1000)},1000,1200,123.46,1.235,0.457,344.123,24.57,1,2,192,6,0,0\r\n`);
    });
    it('records receiving-terminal local time with an offset and keeps the original epoch', () => {
        const timestamp = Date.parse('2026-09-21T00:46:38.259Z');
        expect(formatBrowserLogTimestampIso(timestamp, 540)).toBe('2026-09-21T09:46:38.259+09:00');
        expect(formatBrowserLogFilenameTimestamp(timestamp, 540)).toBe('20260921_094638');
        expect(formatBrowserLogTimestampIso(timestamp, 345)).toBe('2026-09-21T06:31:38.259+05:45');
        expect(formatBrowserLogFilenameTimestamp(timestamp, 345)).toBe('20260921_063138');
        expect(formatBrowserLogTimestampIso(timestamp, -240)).toBe('2026-09-20T20:46:38.259-04:00');
        expect(formatBrowserLogTimestampIso(timestamp, 0)).toBe('2026-09-21T00:46:38.259+00:00');
        const row = formatBrowserLogCsvRow(sample(timestamp), timestamp + 10);
        const [localIso, epochMs, browserReceivedAtMs] = row.trim().split(',');
        expect(localIso).toMatch(/[+-]\d{2}:\d{2}$/);
        expect(Date.parse(localIso)).toBe(timestamp);
        expect(epochMs).toBe(String(timestamp));
        expect(browserReceivedAtMs).toBe(String(timestamp + 10));
    });
    it('distinguishes repeated local clock times in CSV while using the SD filename stem', () => {
        const beforeRollback = Date.parse('2026-11-01T05:30:00.000Z');
        const afterRollback = Date.parse('2026-11-01T06:30:00.000Z');
        expect(formatBrowserLogTimestampIso(beforeRollback, -240)).toBe('2026-11-01T01:30:00.000-04:00');
        expect(formatBrowserLogTimestampIso(afterRollback, -300)).toBe('2026-11-01T01:30:00.000-05:00');
        expect(formatBrowserLogFilenameTimestamp(beforeRollback, -240)).toBe('20261101_013000');
        expect(formatBrowserLogFilenameTimestamp(afterRollback, -300)).toBe('20261101_013000');
    });
    it('leaves measurements blank until their characteristics have reported', () => {
        expect(formatBrowserLogCsvRow({
            ...sample(1000),
            windDirection: Number.NaN,
            windSpeed: Number.NaN,
            soundSpeed: Number.NaN,
            headingSpeed: Number.NaN,
        }, 1200)).toBe(`${formatBrowserLogTimestampIso(1000)},1000,1200,,,,,24.57,1,2,192,6,0,0\r\n`);
    });
    it('flushes rows and splits files by segment duration', async () => {
        const writer = new BrowserLogWriter({
            segmentDurationMs: 1000,
            flushRows: 1,
            now: () => 0,
        });
        await writer.start(0);
        await writer.appendSample({ sample: sample(100), receivedAt: 120 });
        await writer.appendSample({ sample: sample(1200), receivedAt: 1220 });
        const status = await writer.stop(1300);
        const prepared = await writer.prepareExport();
        expect(status.active).toBe(false);
        expect(status.rowCount).toBe(2);
        expect(status.completedSegmentCount).toBe(2);
        expect(prepared.segmentCount).toBe(2);
        expect(prepared.sessionCount).toBe(1);
        expect(Array.from(storeMock.chunks.values()).map((chunk) => chunk.text).join('')).toContain(BROWSER_LOG_CSV_HEADER);
        expect(Array.from(storeMock.chunks.values()).map((chunk) => chunk.text).join('')).toContain(formatBrowserLogTimestampIso(1200));
        expect(Array.from(storeMock.segments.values()).map((segment) => segment.filename)).toEqual([
            `ulsa_ble_${formatBrowserLogFilenameTimestamp(0)}_01.csv`,
            `ulsa_ble_${formatBrowserLogFilenameTimestamp(1200)}_02.csv`
        ]);
    });
    it('keeps repeated start-stop sessions and exports every saved CSV', async () => {
        const writer = new BrowserLogWriter({ flushRows: 1, now: () => 0 });
        await writer.start(1000);
        await writer.appendSample({ sample: sample(1100), receivedAt: 1120 });
        await writer.stop(1200);
        await writer.start(2000);
        await writer.appendSample({ sample: sample(2100), receivedAt: 2120 });
        const status = await writer.stop(2200);
        const prepared = await writer.prepareExport();
        expect(status.storedSessionCount).toBe(2);
        expect(status.storedSegmentCount).toBe(2);
        expect(status.storedRowCount).toBe(2);
        expect(prepared.segmentCount).toBe(2);
        expect(prepared.sessionCount).toBe(2);
        expect(Array.from(storeMock.chunks.values()).map((chunk) => chunk.text).join('')).toContain(formatBrowserLogTimestampIso(1100));
        expect(Array.from(storeMock.chunks.values()).map((chunk) => chunk.text).join('')).toContain(formatBrowserLogTimestampIso(2100));
    });
    it('restores saved sessions with a new writer instance', async () => {
        const firstWriter = new BrowserLogWriter({ flushRows: 1, now: () => 0 });
        await firstWriter.start(1000);
        await firstWriter.appendSample({ sample: sample(1100), receivedAt: 1120 });
        await firstWriter.stop(1200);
        const restoredWriter = new BrowserLogWriter({ now: () => 5000 });
        const restoredStatus = await restoredWriter.initialize();
        const prepared = await restoredWriter.prepareExport();
        expect(restoredStatus.active).toBe(false);
        expect(restoredStatus.sessionId).toBeNull();
        expect(restoredStatus.storedSessionCount).toBe(1);
        expect(restoredStatus.storedRowCount).toBe(1);
        expect(restoredStatus.hasExportableData).toBe(true);
        expect(prepared.segmentCount).toBe(1);
    });
    it('grants legacy logs a full retention grace period before expiring them', async () => {
        storeMock.segments.set('legacy-segment', {
            id: 'legacy-segment',
            sessionId: 'legacy-session',
            filename: 'legacy.csv',
            startedAt: 0,
            endedAt: 100,
            rowCount: 1,
            sizeBytes: 10,
            chunkCount: 1,
            completed: true,
        });
        const migratedWriter = new BrowserLogWriter({ retentionMs: 1000, now: () => 10000 });
        const migrated = await migratedWriter.initialize();
        expect(migrated.storedSessionCount).toBe(1);
        expect(migrated.maintenanceNotice).toContain('30日の保持猶予');
        expect(storeMock.segments.get('legacy-segment')?.retentionAnchorAt).toBe(10000);
        const expiredWriter = new BrowserLogWriter({ retentionMs: 1000, now: () => 11001 });
        const expired = await expiredWriter.initialize();
        expect(expired.storedSessionCount).toBe(0);
        expect(expired.maintenanceNotice).toContain('自動削除');
    });
    it('deletes only expired sessions and preserves unexpired bytes', async () => {
        storeMock.segments.set('expired', {
            id: 'expired', sessionId: 'expired-session', filename: 'expired.csv', startedAt: 0, endedAt: 100,
            rowCount: 1, sizeBytes: 20, chunkCount: 1, completed: true, retentionAnchorAt: 100,
        });
        storeMock.segments.set('current', {
            id: 'current', sessionId: 'current-session', filename: 'current.csv', startedAt: 1500, endedAt: 1600,
            rowCount: 2, sizeBytes: 40, chunkCount: 1, completed: true, retentionAnchorAt: 1600,
        });
        const writer = new BrowserLogWriter({ retentionMs: 1000, now: () => 2000 });
        const status = await writer.initialize();
        expect(status.storedSessionCount).toBe(1);
        expect(status.storedBytes).toBe(40);
        expect(status.sessions[0]?.sessionId).toBe('current-session');
        expect(storeMock.segments.has('expired')).toBe(false);
        expect(storeMock.segments.has('current')).toBe(true);
    });
    it('removes zero-row orphan sessions left by an interrupted start', async () => {
        storeMock.segments.set('empty', {
            id: 'empty', sessionId: 'empty-session', filename: 'empty.csv', startedAt: 1000, endedAt: null,
            rowCount: 0, sizeBytes: getUtf8ByteLength(BROWSER_LOG_CSV_HEADER), chunkCount: 0, completed: false,
        });
        const writer = new BrowserLogWriter({ now: () => 2000 });
        const status = await writer.initialize();
        expect(status.storedSessionCount).toBe(0);
        expect(storeMock.segments.has('empty')).toBe(false);
    });
    it('accepts the exact logical capacity and safely stops before the next row', async () => {
        const row = formatBrowserLogCsvRow(sample(100), 120);
        const exactLimit = getUtf8ByteLength(BROWSER_LOG_CSV_HEADER) + getUtf8ByteLength(row);
        const writer = new BrowserLogWriter({
            maxStoredBytes: exactLimit,
            flushRows: 1,
            now: () => 0,
            estimateStorage: async () => null,
        });
        await writer.start(0);
        const exact = await writer.appendSample({ sample: sample(100), receivedAt: 120 });
        expect(exact.active).toBe(true);
        expect(exact.storedBytes).toBe(exactLimit);
        const stopped = await writer.appendSample({ sample: sample(200), receivedAt: 220 });
        expect(stopped.active).toBe(false);
        expect(stopped.rowCount).toBe(1);
        expect(stopped.error).toContain('保存上限');
        expect(stopped.storageLimitReached).toBe(true);
    });
    it('never drops an interrupted pending buffer when a new start is attempted', async () => {
        const writer = new BrowserLogWriter({ flushRows: 1, now: () => 1000 });
        await writer.start(1000);
        storeMock.failAtomicCommits = true;
        const interrupted = await writer.appendSample({ sample: sample(1100), receivedAt: 1120 });
        expect(interrupted.active).toBe(false);
        expect(interrupted.rowCount).toBe(1);
        expect(interrupted.bufferedBytes).toBeGreaterThan(0);
        await expect(writer.start(2000)).rejects.toThrow('未確定ログ');
        expect(writer.getStatus().rowCount).toBe(1);
        expect(writer.getStatus().bufferedBytes).toBeGreaterThan(0);
        storeMock.failAtomicCommits = false;
        const recovered = await writer.start(3000);
        expect(recovered.active).toBe(true);
        expect(recovered.storedSessionCount).toBe(1);
        await writer.stop(3100);
    });
    it('finalizes an interrupted segment during export and allows recording to restart', async () => {
        const writer = new BrowserLogWriter({ flushRows: 1, now: () => 1000 });
        await writer.start(1000);
        storeMock.failAtomicCommits = true;
        await writer.appendSample({ sample: sample(1100), receivedAt: 1120 });
        storeMock.failAtomicCommits = false;
        const prepared = await writer.prepareExport();
        expect(prepared.segmentCount).toBe(1);
        expect(writer.getStatus().bufferedBytes).toBe(0);
        await expect(writer.start(2000)).resolves.toMatchObject({ active: true });
        await writer.stop(2100);
    });
    it('enforces the origin reserve boundary without treating an unavailable estimate as failure', async () => {
        const headerBytes = getUtf8ByteLength(BROWSER_LOG_CSV_HEADER);
        const reserve = 16 * 1024 * 1024;
        const exactWriter = new BrowserLogWriter({
            minFreeBytes: reserve,
            estimateStorage: async () => ({ quota: reserve + headerBytes, usage: 0 }),
        });
        await expect(exactWriter.start(1000)).resolves.toMatchObject({ active: true });
        await exactWriter.stop(1001);
        const blockedWriter = new BrowserLogWriter({
            minFreeBytes: reserve,
            estimateStorage: async () => ({ quota: reserve + headerBytes - 1, usage: 0 }),
        });
        await expect(blockedWriter.start(1000)).rejects.toThrow('安全余裕');
        const unsupportedWriter = new BrowserLogWriter({ estimateStorage: async () => null });
        await expect(unsupportedWriter.start(1000)).resolves.toMatchObject({ active: true });
        await unsupportedWriter.stop(1001);
    });
    it('prevents two writers from recording against the same total-cap catalog concurrently', async () => {
        const first = new BrowserLogWriter({ now: () => 1000 });
        const second = new BrowserLogWriter({ now: () => 1000 });
        await first.start(1000);
        await expect(second.start(1100)).rejects.toThrow('別のタブ');
        await first.stop(1200);
        await expect(second.start(1300)).resolves.toMatchObject({ active: true });
        await second.stop(1400);
    });
    it('deletes one session or all sessions only while recording is stopped', async () => {
        const writer = new BrowserLogWriter({ flushRows: 1, now: () => 0 });
        await writer.start(1000);
        await writer.appendSample({ sample: sample(1100), receivedAt: 1120 });
        await expect(writer.deleteSession(writer.getStatus().sessionId!)).rejects.toThrow('ログ停止後');
        await writer.stop(1200);
        const sessionId = writer.getStatus().sessionId!;
        const deleted = await writer.deleteSession(sessionId);
        expect(deleted.storedSessionCount).toBe(0);
        await writer.start(2000);
        await writer.appendSample({ sample: sample(2100), receivedAt: 2120 });
        await writer.stop(2200);
        const cleared = await writer.deleteAll();
        expect(cleared.storedSessionCount).toBe(0);
        expect(storeMock.segments.size).toBe(0);
        expect(storeMock.chunks.size).toBe(0);
    });
});
