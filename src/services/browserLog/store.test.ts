import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BrowserLogChunkRecord, BrowserLogSegmentRecord } from './types';
import {
  closeBrowserLogDbForTests,
  acquireBrowserLogWriterLease,
  deleteAllBrowserLogs,
  deleteBrowserLogSession,
  listAllBrowserLogSegments,
  listBrowserLogChunks,
  putBrowserLogChunkAndSegment,
  putBrowserLogSegment,
  releaseBrowserLogWriterLease,
  renewBrowserLogWriterLease,
  streamBrowserLogChunks,
} from './store';

const DB_NAME = 'ulsa-evo-browser-logs';

Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: indexedDB });
Object.defineProperty(globalThis, 'IDBKeyRange', { configurable: true, value: IDBKeyRange });

const segment = (overrides: Partial<BrowserLogSegmentRecord> = {}): BrowserLogSegmentRecord => ({
  id: 'segment-1',
  sessionId: 'session-1',
  filename: 'session-1.csv',
  startedAt: 1000,
  endedAt: 2000,
  rowCount: 1,
  sizeBytes: 8,
  chunkCount: 1,
  completed: true,
  retentionAnchorAt: 2000,
  ...overrides,
});

const chunk = (overrides: Partial<BrowserLogChunkRecord> = {}): BrowserLogChunkRecord => ({
  id: 'chunk-1',
  segmentId: 'segment-1',
  sessionId: 'session-1',
  chunkIndex: 0,
  text: 'row\r\n',
  ...overrides,
});

const deleteDatabase = async (): Promise<void> => {
  await closeBrowserLogDbForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB deletion was blocked'));
  });
};

const createLegacyV1Database = async (): Promise<void> => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const opened = request.result;
      const segments = opened.createObjectStore('segments', { keyPath: 'id' });
      segments.createIndex('sessionId', 'sessionId', { unique: false });
      const chunks = opened.createObjectStore('chunks', { keyPath: 'id' });
      chunks.createIndex('sessionId', 'sessionId', { unique: false });
      chunks.createIndex('segmentId', 'segmentId', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transaction = db.transaction(['segments', 'chunks'], 'readwrite');
  const legacySegment = segment({ retentionAnchorAt: undefined });
  transaction.objectStore('segments').put(legacySegment);
  transaction.objectStore('chunks').put(chunk());
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();
};

describe('browser log IndexedDB store', () => {
  beforeEach(deleteDatabase);
  afterEach(deleteDatabase);

  it('upgrades v1 data to the ordered chunk index without losing legacy records', async () => {
    await createLegacyV1Database();

    const segments = await listAllBrowserLogSegments();
    const streamed: BrowserLogChunkRecord[] = [];
    await streamBrowserLogChunks('segment-1', (record) => streamed.push(record));

    expect(segments).toHaveLength(1);
    expect(segments[0].retentionAnchorAt).toBeUndefined();
    expect(streamed.map((record) => record.text)).toEqual(['row\r\n']);

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(upgraded.version).toBe(3);
    expect(upgraded.transaction('chunks').objectStore('chunks').indexNames.contains('segmentChunkOrder')).toBe(true);
    upgraded.close();
  });

  it('serializes writer leases across owners and allows takeover after release', async () => {
    expect(await acquireBrowserLogWriterLease('owner-a', 1000, 1000)).toBe(true);
    expect(await acquireBrowserLogWriterLease('owner-b', 1001, 1000)).toBe(false);
    expect(await renewBrowserLogWriterLease('owner-a', 1500, 1000)).toBe(true);
    expect(await renewBrowserLogWriterLease('owner-b', 1500, 1000)).toBe(false);

    await releaseBrowserLogWriterLease('owner-a');
    expect(await acquireBrowserLogWriterLease('owner-b', 1600, 1000)).toBe(true);
  });

  it('rolls back segment metadata when the atomic chunk commit violates the unique order index', async () => {
    await putBrowserLogChunkAndSegment(chunk(), segment());

    await expect(putBrowserLogChunkAndSegment(
      chunk({ id: 'chunk-duplicate-order' }),
      segment({ rowCount: 999, sizeBytes: 999 }),
    )).rejects.toBeTruthy();

    expect(await listAllBrowserLogSegments()).toEqual([segment()]);
    expect(await listBrowserLogChunks('segment-1')).toEqual([chunk()]);
  });

  it('deletes one session without touching another, then clears both stores', async () => {
    await putBrowserLogChunkAndSegment(chunk(), segment());
    await putBrowserLogChunkAndSegment(
      chunk({ id: 'chunk-2', segmentId: 'segment-2', sessionId: 'session-2' }),
      segment({ id: 'segment-2', sessionId: 'session-2', filename: 'session-2.csv' }),
    );

    await deleteBrowserLogSession('session-1');
    expect((await listAllBrowserLogSegments()).map((record) => record.sessionId)).toEqual(['session-2']);

    await deleteAllBrowserLogs();
    expect(await listAllBrowserLogSegments()).toEqual([]);
    expect(await listBrowserLogChunks('segment-2')).toEqual([]);
  });

  it('keeps a segment record writable independently before its first chunk', async () => {
    await putBrowserLogSegment(segment({ rowCount: 0, sizeBytes: 0, chunkCount: 0 }));
    expect(await listAllBrowserLogSegments()).toHaveLength(1);
  });
});
