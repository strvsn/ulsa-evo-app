import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { formatBrowserLogFilenameTimestamp } from './csv';
import type { BrowserLogChunkRecord, BrowserLogExportFile, BrowserLogSegmentRecord } from './types';

const storeMocks = vi.hoisted(() => ({
  segments: [] as BrowserLogSegmentRecord[],
  chunks: new Map<string, BrowserLogChunkRecord[]>(),
  streamCalls: [] as string[],
}));

vi.mock('./store', () => ({
  listAllBrowserLogSegments: vi.fn(async () => storeMocks.segments),
  streamBrowserLogChunks: vi.fn(async (
    segmentId: string,
    onChunk: (chunk: BrowserLogChunkRecord) => void,
  ) => {
    storeMocks.streamCalls.push(segmentId);
    for (const chunk of storeMocks.chunks.get(segmentId) ?? []) onChunk(chunk);
  }),
}));

import {
  createBrowserLogArchive,
  createStoredBrowserLogArchive,
  deliverBrowserLogArchive,
  planBrowserLogExportBatches,
} from './exportFiles';

const files: BrowserLogExportFile[] = [
  {
    sessionId: 'session-1',
    filename: 'ulsa_ble_20260720T010000Z_01.csv',
    text: 'header\r\nfirst\r\n',
    sizeBytes: 15,
    rowCount: 1,
  },
  {
    sessionId: 'session-2',
    filename: 'ulsa_ble_20260720T020000Z_01.csv',
    text: 'header\r\nsecond\r\n',
    sizeBytes: 16,
    rowCount: 1,
  },
];

const readFileBytes = (file: File): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });

const segment = (
  id: string,
  sessionId: string,
  filename: string,
  text: string,
): BrowserLogSegmentRecord => ({
  id,
  sessionId,
  filename,
  startedAt: Date.UTC(2026, 6, 20, 1),
  endedAt: Date.UTC(2026, 6, 20, 2),
  rowCount: 1,
  sizeBytes: new TextEncoder().encode(text).byteLength,
  chunkCount: 1,
  completed: true,
  retentionAnchorAt: Date.UTC(2026, 6, 20, 2),
});

describe('browser log ZIP export', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    storeMocks.segments = [];
    storeMocks.chunks.clear();
    storeMocks.streamCalls.length = 0;
  });

  it('packs every supplied CSV into one ZIP archive without a final ArrayBuffer copy', async () => {
    const createdAt = Date.UTC(2026, 6, 20, 3, 4, 5);
    const archive = await createBrowserLogArchive(files, createdAt);
    const entries = unzipSync(await readFileBytes(archive));

    expect(archive.name).toBe(`ulsa_evo_logs_${formatBrowserLogFilenameTimestamp(createdAt)}.zip`);
    expect(archive.name).toMatch(/^ulsa_evo_logs_\d{8}_\d{6}\.zip$/);
    expect(archive.type).toBe('application/zip');
    expect(Object.keys(entries)).toEqual([
      'ulsa_ble_20260720T010000Z_01.csv',
      'ulsa_ble_20260720T020000Z_01.csv',
    ]);
    expect(strFromU8(entries['ulsa_ble_20260720T010000Z_01.csv'])).toContain('first');
    expect(strFromU8(entries['ulsa_ble_20260720T020000Z_01.csv'])).toContain('second');
  });

  it('streams stored chunks one segment at a time and preserves complete CSV data', async () => {
    const firstText = 'header\r\nfirst\r\n';
    const secondText = 'header\r\nsecond\r\n';
    storeMocks.segments = [
      segment('segment-1', 'session-1', 'first.csv', firstText),
      segment('segment-2', 'session-2', 'second.csv', secondText),
    ];
    storeMocks.chunks.set('segment-1', [{
      id: 'chunk-1', segmentId: 'segment-1', sessionId: 'session-1', chunkIndex: 0, text: firstText,
    }]);
    storeMocks.chunks.set('segment-2', [{
      id: 'chunk-2', segmentId: 'segment-2', sessionId: 'session-2', chunkIndex: 0, text: secondText,
    }]);

    const prepared = await createStoredBrowserLogArchive(null, Date.UTC(2026, 6, 20, 3, 4, 5));
    const entries = unzipSync(await readFileBytes(prepared.file));

    expect(prepared.sessionCount).toBe(2);
    expect(prepared.segmentCount).toBe(2);
    expect(storeMocks.streamCalls).toEqual(['segment-1', 'segment-2']);
    expect(strFromU8(entries['first.csv'])).toBe(firstText);
    expect(strFromU8(entries['second.csv'])).toBe(secondText);
  });

  it('keeps ZIP entry dates valid for historical and future segments in any terminal timezone', async () => {
    const oldText = 'header\r\nold\r\n';
    const futureText = 'header\r\nfuture\r\n';
    storeMocks.segments = [
      { ...segment('old', 'session-old', 'old.csv', oldText), startedAt: Date.UTC(1970, 0, 1) },
      { ...segment('future', 'session-future', 'future.csv', futureText), startedAt: Date.UTC(2100, 0, 1) },
    ];
    storeMocks.chunks.set('old', [{
      id: 'old-chunk', segmentId: 'old', sessionId: 'session-old', chunkIndex: 0, text: oldText,
    }]);
    storeMocks.chunks.set('future', [{
      id: 'future-chunk', segmentId: 'future', sessionId: 'session-future', chunkIndex: 0, text: futureText,
    }]);

    const prepared = await createStoredBrowserLogArchive(null, Date.UTC(2026, 6, 20, 3, 4, 5));
    const entries = unzipSync(await readFileBytes(prepared.file));
    expect(Object.keys(entries)).toEqual(['old.csv', 'future.csv']);
  });

  it('creates one archive for an explicitly selected set of sessions', async () => {
    const firstText = 'header\r\nfirst\r\n';
    const secondText = 'header\r\nsecond\r\n';
    storeMocks.segments = [
      segment('segment-1', 'session-1', 'first.csv', firstText),
      segment('segment-2', 'session-2', 'second.csv', secondText),
    ];
    storeMocks.chunks.set('segment-1', [{
      id: 'chunk-1', segmentId: 'segment-1', sessionId: 'session-1', chunkIndex: 0, text: firstText,
    }]);
    storeMocks.chunks.set('segment-2', [{
      id: 'chunk-2', segmentId: 'segment-2', sessionId: 'session-2', chunkIndex: 0, text: secondText,
    }]);

    const prepared = await createStoredBrowserLogArchive(['session-1', 'session-2'], 5000);
    expect(prepared.sessionCount).toBe(2);
    expect(prepared.scopeSessionId).toBeNull();
    expect(prepared.segmentCount).toBe(2);
  });

  it('fails closed when stored chunk metadata does not match the stream', async () => {
    const text = 'header\r\nfirst\r\n';
    storeMocks.segments = [{ ...segment('segment-1', 'session-1', 'first.csv', text), chunkCount: 2 }];
    storeMocks.chunks.set('segment-1', [{
      id: 'chunk-1', segmentId: 'segment-1', sessionId: 'session-1', chunkIndex: 0, text,
    }]);

    await expect(createStoredBrowserLogArchive()).rejects.toThrow('chunk整合性');
  });

  it('fails closed when chunk indices contain a gap even if count and bytes match', async () => {
    const first = 'header\r\n';
    const second = 'first\r\n';
    const metadata = segment('segment-1', 'session-1', 'first.csv', first + second);
    storeMocks.segments = [{ ...metadata, chunkCount: 2 }];
    storeMocks.chunks.set('segment-1', [
      { id: 'chunk-0', segmentId: 'segment-1', sessionId: 'session-1', chunkIndex: 0, text: first },
      { id: 'chunk-2', segmentId: 'segment-1', sessionId: 'session-1', chunkIndex: 2, text: second },
    ]);

    await expect(createStoredBrowserLogArchive()).rejects.toThrow('chunk番号が連続していない');
  });

  it('splits over-limit legacy data at segment boundaries without reading chunks', () => {
    const legacySegments = [
      { ...segment('segment-1', 'session-1', 'legacy-1.csv', 'x'), sizeBytes: 60 * 1024 * 1024 },
      { ...segment('segment-2', 'session-1', 'legacy-2.csv', 'x'), sizeBytes: 60 * 1024 * 1024 },
    ];

    expect(planBrowserLogExportBatches(legacySegments)).toEqual([
      [legacySegments[0]],
      [legacySegments[1]],
    ]);
    expect(storeMocks.streamCalls).toEqual([]);
  });

  it('keeps later parts bound to the original ordered segment snapshot', async () => {
    const firstText = 'first\r\n';
    const secondText = 'second\r\n';
    const first = segment('segment-1', 'session-1', 'first.csv', firstText);
    const second = segment('segment-2', 'session-2', 'second.csv', secondText);
    storeMocks.segments = [first, second];
    storeMocks.chunks.set('segment-1', [{
      id: 'chunk-1', segmentId: 'segment-1', sessionId: 'session-1', chunkIndex: 0, text: firstText,
    }]);
    storeMocks.chunks.set('segment-2', [{
      id: 'chunk-2', segmentId: 'segment-2', sessionId: 'session-2', chunkIndex: 0, text: secondText,
    }]);
    const plan = {
      batches: [
        [{ id: first.id, sessionId: first.sessionId, filename: first.filename, sizeBytes: first.sizeBytes, chunkCount: first.chunkCount, rowCount: first.rowCount }],
        [{ id: second.id, sessionId: second.sessionId, filename: second.filename, sizeBytes: second.sizeBytes, chunkCount: second.chunkCount, rowCount: second.rowCount }],
      ],
      totalRawBytes: first.sizeBytes + second.sizeBytes,
    };

    const firstPart = await createStoredBrowserLogArchive(null, 5000, 0, plan);
    storeMocks.segments = [segment('new-segment', 'new-session', 'new.csv', 'new\r\n'), first, second];
    const secondPart = await createStoredBrowserLogArchive(null, 5000, 1, firstPart.plan);
    const entries = unzipSync(await readFileBytes(secondPart.file));

    expect(firstPart.file.name).toContain('part01-of02');
    expect(secondPart.file.name).toContain('part02-of02');
    expect(Object.keys(entries)).toEqual(['second.csv']);

    storeMocks.segments = [first];
    await expect(createStoredBrowserLogArchive(null, 5000, 1, plan)).rejects.toThrow('変更または削除');
  });

  it('rejects a single corrupt segment larger than the archive limit', () => {
    const oversized = {
      ...segment('segment-1', 'session-1', 'legacy.csv', 'x'),
      sizeBytes: 100 * 1024 * 1024 + 1,
    };
    expect(() => planBrowserLogExportBatches([oversized])).toThrow('100 MiB');
  });

  it('shares a prepared ZIP from the direct delivery action', async () => {
    const share = vi.fn(async (data: ShareData) => {
      void data;
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn(() => true),
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });
    const archive = await createBrowserLogArchive(files);

    await expect(deliverBrowserLogArchive(archive)).resolves.toBe('share');
    expect(share).toHaveBeenCalledTimes(1);
    expect((share.mock.calls[0]?.[0].files as File[])[0]).toBe(archive);
  });

  it('falls back to a browser download when sharing cannot start', async () => {
    const share = vi.fn(async () => { throw new DOMException('activation lost', 'NotAllowedError'); });
    const createObjectURL = vi.fn(() => 'blob:logs');
    const revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    const archive = await createBrowserLogArchive(files);

    await expect(deliverBrowserLogArchive(archive)).resolves.toBe('download');
    expect(createObjectURL).toHaveBeenCalledWith(archive);
  });
});
