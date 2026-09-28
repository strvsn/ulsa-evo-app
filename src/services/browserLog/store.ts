import type { BrowserLogChunkRecord, BrowserLogSegmentRecord } from './types';

const DB_NAME = 'ulsa-evo-browser-logs';
const DB_VERSION = 3;
const SEGMENT_STORE = 'segments';
const CHUNK_STORE = 'chunks';
const META_STORE = 'meta';
const SEGMENT_CHUNK_ORDER_INDEX = 'segmentChunkOrder';

let dbPromise: Promise<IDBDatabase> | null = null;

export const closeBrowserLogDbForTests = async (): Promise<void> => {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  try {
    (await pending).close();
  } catch {
    // A failed open has no database handle to close.
  }
};

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });

const openBrowserLogDb = (): Promise<IDBDatabase> => {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDBが利用できません'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let upgradeBlocked = false;

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SEGMENT_STORE)) {
        const segments = db.createObjectStore(SEGMENT_STORE, { keyPath: 'id' });
        segments.createIndex('sessionId', 'sessionId', { unique: false });
      }
      const chunks = db.objectStoreNames.contains(CHUNK_STORE)
        ? request.transaction?.objectStore(CHUNK_STORE)
        : db.createObjectStore(CHUNK_STORE, { keyPath: 'id' });
      if (chunks) {
        if (!chunks.indexNames.contains('sessionId')) {
          chunks.createIndex('sessionId', 'sessionId', { unique: false });
        }
        if (!chunks.indexNames.contains('segmentId')) {
          chunks.createIndex('segmentId', 'segmentId', { unique: false });
        }
        if (!chunks.indexNames.contains(SEGMENT_CHUNK_ORDER_INDEX)) {
          chunks.createIndex(SEGMENT_CHUNK_ORDER_INDEX, ['segmentId', 'chunkIndex'], { unique: true });
        }
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      if (upgradeBlocked) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onblocked = () => {
      upgradeBlocked = true;
      dbPromise = null;
      reject(new Error('別のタブでアプリ内ログが開かれているため、保存領域を更新できません。ほかのタブを閉じて再試行してください。'));
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('IndexedDBを開けません'));
    };
  });

  return dbPromise;
};

export const putBrowserLogSegment = async (segment: BrowserLogSegmentRecord): Promise<void> => {
  const db = await openBrowserLogDb();
  const transaction = db.transaction(SEGMENT_STORE, 'readwrite');
  transaction.objectStore(SEGMENT_STORE).put(segment);
  await transactionDone(transaction);
};

export const putBrowserLogSegments = async (segments: BrowserLogSegmentRecord[]): Promise<void> => {
  if (segments.length === 0) return;
  const db = await openBrowserLogDb();
  const transaction = db.transaction(SEGMENT_STORE, 'readwrite');
  const store = transaction.objectStore(SEGMENT_STORE);
  for (const segment of segments) store.put(segment);
  await transactionDone(transaction);
};

export const putBrowserLogChunk = async (chunk: BrowserLogChunkRecord): Promise<void> => {
  const db = await openBrowserLogDb();
  const transaction = db.transaction(CHUNK_STORE, 'readwrite');
  transaction.objectStore(CHUNK_STORE).put(chunk);
  await transactionDone(transaction);
};

export const putBrowserLogChunkAndSegment = async (
  chunk: BrowserLogChunkRecord,
  segment: BrowserLogSegmentRecord,
): Promise<void> => {
  const db = await openBrowserLogDb();
  const transaction = db.transaction([CHUNK_STORE, SEGMENT_STORE], 'readwrite');
  transaction.objectStore(CHUNK_STORE).put(chunk);
  transaction.objectStore(SEGMENT_STORE).put(segment);
  await transactionDone(transaction);
};

const collectByIndex = async <T>(
  storeName: string,
  indexName: string,
  key: string
): Promise<T[]> => {
  const db = await openBrowserLogDb();
  const transaction = db.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  const index = store.index(indexName);
  const records: T[] = [];

  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(IDBKeyRange.only(key));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      records.push(cursor.value as T);
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed'));
  });
  await transactionDone(transaction);

  return records;
};

export const listBrowserLogSegments = async (
  sessionId: string
): Promise<BrowserLogSegmentRecord[]> => {
  const segments = await collectByIndex<BrowserLogSegmentRecord>(SEGMENT_STORE, 'sessionId', sessionId);
  return segments.sort((a, b) => a.startedAt - b.startedAt || a.filename.localeCompare(b.filename));
};

export const listAllBrowserLogSegments = async (): Promise<BrowserLogSegmentRecord[]> => {
  const db = await openBrowserLogDb();
  const transaction = db.transaction(SEGMENT_STORE, 'readonly');
  const request = transaction.objectStore(SEGMENT_STORE).getAll();
  const segments = await new Promise<BrowserLogSegmentRecord[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as BrowserLogSegmentRecord[]);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB segments read failed'));
  });
  await transactionDone(transaction);
  return segments.sort((a, b) =>
    a.startedAt - b.startedAt ||
    a.sessionId.localeCompare(b.sessionId) ||
    a.filename.localeCompare(b.filename)
  );
};

export const listBrowserLogChunks = async (
  segmentId: string
): Promise<BrowserLogChunkRecord[]> => {
  const chunks = await collectByIndex<BrowserLogChunkRecord>(CHUNK_STORE, 'segmentId', segmentId);
  return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
};

export const deleteBrowserLogSession = async (sessionId: string): Promise<void> => {
  await deleteBrowserLogSessions([sessionId]);
};

export const deleteBrowserLogSessions = async (sessionIds: string[]): Promise<void> => {
  if (sessionIds.length === 0) return;
  const db = await openBrowserLogDb();
  const transaction = db.transaction([SEGMENT_STORE, CHUNK_STORE], 'readwrite');
  const targets = new Set(sessionIds);

  for (const storeName of [SEGMENT_STORE, CHUNK_STORE]) {
    const request = transaction.objectStore(storeName).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value as BrowserLogSegmentRecord | BrowserLogChunkRecord;
      if (targets.has(record.sessionId)) cursor.delete();
      cursor.continue();
    };
  }

  await transactionDone(transaction);
};

export const deleteAllBrowserLogs = async (): Promise<void> => {
  const db = await openBrowserLogDb();
  const transaction = db.transaction([SEGMENT_STORE, CHUNK_STORE], 'readwrite');
  transaction.objectStore(SEGMENT_STORE).clear();
  transaction.objectStore(CHUNK_STORE).clear();
  await transactionDone(transaction);
};

export const streamBrowserLogChunks = async (
  segmentId: string,
  onChunk: (chunk: BrowserLogChunkRecord) => void,
): Promise<void> => {
  const db = await openBrowserLogDb();
  const transaction = db.transaction(CHUNK_STORE, 'readonly');
  const index = transaction.objectStore(CHUNK_STORE).index(SEGMENT_CHUNK_ORDER_INDEX);
  const range = IDBKeyRange.bound(
    [segmentId, 0],
    [segmentId, Number.MAX_SAFE_INTEGER],
  );

  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      try {
        onChunk(cursor.value as BrowserLogChunkRecord);
        cursor.continue();
      } catch (error) {
        reject(error);
        try {
          transaction.abort();
        } catch {
          // The transaction may already be completing after the callback failure.
        }
      }
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB chunk stream failed'));
  });
  await transactionDone(transaction);
};

interface BrowserLogLeaseRecord {
  key: 'writer-lock';
  ownerId: string;
  expiresAt: number;
}

export const acquireBrowserLogWriterLease = async (
  ownerId: string,
  now: number,
  leaseMs: number,
): Promise<boolean> => {
  const db = await openBrowserLogDb();
  const transaction = db.transaction(META_STORE, 'readwrite');
  const store = transaction.objectStore(META_STORE);
  let acquired = false;
  await new Promise<void>((resolve, reject) => {
    const request = store.get('writer-lock');
    request.onsuccess = () => {
      const current = request.result as BrowserLogLeaseRecord | undefined;
      if (!current || current.ownerId === ownerId || current.expiresAt <= now) {
        store.put({ key: 'writer-lock', ownerId, expiresAt: now + leaseMs } satisfies BrowserLogLeaseRecord);
        acquired = true;
      }
      resolve();
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB writer lease read failed'));
  });
  await transactionDone(transaction);
  return acquired;
};

export const renewBrowserLogWriterLease = async (
  ownerId: string,
  now: number,
  leaseMs: number,
): Promise<boolean> => {
  const db = await openBrowserLogDb();
  const transaction = db.transaction(META_STORE, 'readwrite');
  const store = transaction.objectStore(META_STORE);
  let renewed = false;
  await new Promise<void>((resolve, reject) => {
    const request = store.get('writer-lock');
    request.onsuccess = () => {
      const current = request.result as BrowserLogLeaseRecord | undefined;
      if (current?.ownerId === ownerId) {
        store.put({ ...current, expiresAt: now + leaseMs });
        renewed = true;
      }
      resolve();
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB writer lease renewal failed'));
  });
  await transactionDone(transaction);
  return renewed;
};

export const releaseBrowserLogWriterLease = async (ownerId: string): Promise<void> => {
  const db = await openBrowserLogDb();
  const transaction = db.transaction(META_STORE, 'readwrite');
  const store = transaction.objectStore(META_STORE);
  await new Promise<void>((resolve, reject) => {
    const request = store.get('writer-lock');
    request.onsuccess = () => {
      const current = request.result as BrowserLogLeaseRecord | undefined;
      if (current?.ownerId === ownerId) store.delete('writer-lock');
      resolve();
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB writer lease release failed'));
  });
  await transactionDone(transaction);
};
