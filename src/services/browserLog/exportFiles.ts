import { strToU8, Zip, ZipDeflate } from 'fflate';
import { formatBrowserLogFilenameTimestamp } from './csv';
import { listAllBrowserLogSegments, streamBrowserLogChunks } from './store';
import { BROWSER_LOG_MAX_STORED_BYTES, BrowserLogStorageError } from './policy';
import type {
  BrowserLogExportFile,
  BrowserLogExportScope,
  BrowserLogExportPlan,
  BrowserLogExportPlanSegment,
  BrowserLogPreparedArchive,
  BrowserLogSegmentRecord,
} from './types';

export type BrowserLogExportMethod = 'share' | 'download';

const ZIP_OUTPUT_PART_BYTES = 1024 * 1024;
// ZIP/DOS entry dates are encoded with local Date getters by fflate.
const ZIP_MIN_TIMESTAMP = new Date(1980, 0, 1).getTime();
const ZIP_MAX_TIMESTAMP = new Date(2099, 11, 31, 23, 59, 58).getTime();

const createUniqueEntryName = (filename: string, usedNames: Set<string>): string => {
  if (!usedNames.has(filename)) {
    usedNames.add(filename);
    return filename;
  }

  const dotIndex = filename.lastIndexOf('.');
  const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : '';
  let suffix = 2;
  while (usedNames.has(`${stem}_${suffix}${extension}`)) suffix += 1;
  const uniqueName = `${stem}_${suffix}${extension}`;
  usedNames.add(uniqueName);
  return uniqueName;
};

type ArchiveEntryWriter = (
  archive: Zip,
  usedNames: Set<string>,
  checkError: () => void,
) => Promise<void>;

const createArchiveFile = async (
  writeEntries: ArchiveEntryWriter,
  createdAt: number,
  partLabel: string | null = null,
): Promise<File> => {
  const parts: BlobPart[] = [];
  let pendingOutput: Uint8Array[] = [];
  let pendingOutputBytes = 0;
  let streamError: Error | null = null;
  let resolveCompletion: (() => void) | null = null;
  let rejectCompletion: ((error: Error) => void) | null = null;
  const completion = new Promise<void>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });

  const flushOutput = () => {
    if (pendingOutputBytes === 0) return;
    const merged = new Uint8Array(pendingOutputBytes);
    let offset = 0;
    for (const chunk of pendingOutput) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    parts.push(merged.buffer);
    pendingOutput = [];
    pendingOutputBytes = 0;
  };

  const archive = new Zip((error, data, final) => {
    if (error) {
      streamError = error instanceof Error ? error : new Error(String(error));
      rejectCompletion?.(streamError);
      return;
    }
    if (data?.byteLength) {
      pendingOutput.push(data);
      pendingOutputBytes += data.byteLength;
      if (pendingOutputBytes >= ZIP_OUTPUT_PART_BYTES) flushOutput();
    }
    if (final) {
      flushOutput();
      resolveCompletion?.();
    }
  });
  const checkError = () => {
    if (streamError) throw streamError;
  };

  try {
    await writeEntries(archive, new Set<string>(), checkError);
    checkError();
    archive.end();
    await completion;
    checkError();
  } catch (error) {
    archive.terminate();
    throw error;
  }

  return new File(
    parts,
    `ulsa_evo_logs_${formatBrowserLogFilenameTimestamp(createdAt)}${partLabel ? `_${partLabel}` : ''}.zip`,
    { type: 'application/zip' },
  );
};

const addTextEntry = (
  archive: Zip,
  filename: string,
  text: string,
  checkError: () => void,
) => {
  const entry = new ZipDeflate(filename, { level: 6 });
  archive.add(entry);
  entry.push(strToU8(text), true);
  checkError();
};

const addStoredSegmentEntry = async (
  archive: Zip,
  segment: BrowserLogSegmentRecord,
  filename: string,
  checkError: () => void,
) => {
  const entry = new ZipDeflate(filename, { level: 6 });
  entry.mtime = new Date(Math.min(ZIP_MAX_TIMESTAMP, Math.max(ZIP_MIN_TIMESTAMP, segment.startedAt)));
  archive.add(entry);
  let streamedChunks = 0;
  let streamedBytes = 0;
  let expectedChunkIndex = 0;

  await streamBrowserLogChunks(segment.id, (chunk) => {
    if (chunk.chunkIndex !== expectedChunkIndex) {
      throw new Error(
        `保存済みログ ${segment.filename} のchunk番号が連続していないため、ZIP作成を中止しました。`,
      );
    }
    const bytes = strToU8(chunk.text);
    entry.push(bytes, false);
    streamedChunks += 1;
    streamedBytes += bytes.byteLength;
    expectedChunkIndex += 1;
    checkError();
  });

  if (streamedChunks !== segment.chunkCount || streamedBytes !== segment.sizeBytes) {
    throw new Error(
      `保存済みログ ${segment.filename} のchunk整合性を確認できないため、ZIP作成を中止しました。`,
    );
  }
  entry.push(new Uint8Array(0), true);
  checkError();
};

export const createBrowserLogArchive = async (
  files: BrowserLogExportFile[],
  createdAt: number = Date.now(),
): Promise<File> => createArchiveFile(async (archive, usedNames, checkError) => {
  for (const file of files) {
    addTextEntry(archive, createUniqueEntryName(file.filename, usedNames), file.text, checkError);
  }
}, createdAt);

export const planBrowserLogExportBatches = (
  segments: BrowserLogSegmentRecord[],
): BrowserLogSegmentRecord[][] => {
  const batches: BrowserLogSegmentRecord[][] = [];
  let currentBatch: BrowserLogSegmentRecord[] = [];
  let currentBatchBytes = 0;
  for (const segment of segments) {
    if (segment.sizeBytes > BROWSER_LOG_MAX_STORED_BYTES) {
      throw new BrowserLogStorageError(
        'capacity',
        `${segment.filename}が単一ZIP上限100 MiBを超えているため、安全に書き出せません。`,
      );
    }
    if (currentBatch.length > 0 && currentBatchBytes + segment.sizeBytes > BROWSER_LOG_MAX_STORED_BYTES) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchBytes = 0;
    }
    currentBatch.push(segment);
    currentBatchBytes += segment.sizeBytes;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches;
};

const createExportPlan = (segments: BrowserLogSegmentRecord[]): BrowserLogExportPlan => ({
  batches: planBrowserLogExportBatches(segments).map((batch) => batch.map((segment) => ({
    id: segment.id,
    sessionId: segment.sessionId,
    filename: segment.filename,
    sizeBytes: segment.sizeBytes,
    chunkCount: segment.chunkCount,
    rowCount: segment.rowCount,
  }))),
  totalRawBytes: segments.reduce((total, segment) => total + segment.sizeBytes, 0),
});

const resolveExportPlanBatch = (
  segments: BrowserLogSegmentRecord[],
  planBatch: BrowserLogExportPlanSegment[],
): BrowserLogSegmentRecord[] => {
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]));
  return planBatch.map((snapshot) => {
    const current = segmentsById.get(snapshot.id);
    if (!current) {
      throw new Error('分割ZIPの対象ログが変更または削除されたため、最初のZIPから作り直してください。');
    }
    if (
      current.sessionId !== snapshot.sessionId ||
      current.filename !== snapshot.filename ||
      current.sizeBytes !== snapshot.sizeBytes ||
      current.chunkCount !== snapshot.chunkCount ||
      current.rowCount !== snapshot.rowCount
    ) {
      throw new Error('分割ZIPの対象ログ内容が変更されたため、最初のZIPから作り直してください。');
    }
    return current;
  });
};

export const createStoredBrowserLogArchive = async (
  sessionId: BrowserLogExportScope = null,
  createdAt: number = Date.now(),
  batchIndex: number = 0,
  existingPlan: BrowserLogExportPlan | null = null,
): Promise<BrowserLogPreparedArchive> => {
  const allSegments = await listAllBrowserLogSegments();
  const selectedSessionIds = Array.isArray(sessionId) ? new Set(sessionId) : null;
  const segments = allSegments.filter((segment) => (
    segment.rowCount > 0 && (
      sessionId === null ||
      (selectedSessionIds ? selectedSessionIds.has(segment.sessionId) : segment.sessionId === sessionId)
    )
  ));
  if (!existingPlan && segments.length === 0) {
    throw new Error('書き出せるアプリ内ログがありません。');
  }
  const plan = existingPlan ?? createExportPlan(segments);
  if (!Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex >= plan.batches.length) {
    throw new Error('指定されたZIP分割番号が保存済みログの範囲外です。');
  }
  const selectedSegments = resolveExportPlanBatch(allSegments, plan.batches[batchIndex]);
  const rawBytes = selectedSegments.reduce((total, segment) => total + segment.sizeBytes, 0);
  const partLabel = plan.batches.length > 1
    ? `part${String(batchIndex + 1).padStart(2, '0')}-of${String(plan.batches.length).padStart(2, '0')}`
    : null;

  const file = await createArchiveFile(async (archive, usedNames, checkError) => {
    for (const segment of selectedSegments) {
      await addStoredSegmentEntry(
        archive,
        segment,
        createUniqueEntryName(segment.filename, usedNames),
        checkError,
      );
    }
  }, createdAt, partLabel);

  return {
    file,
    createdAt,
    rawBytes,
    totalRawBytes: plan.totalRawBytes,
    sessionCount: new Set(selectedSegments.map((segment) => segment.sessionId)).size,
    segmentCount: selectedSegments.length,
    scopeSessionId: typeof sessionId === 'string' ? sessionId : null,
    batchIndex,
    batchCount: plan.batches.length,
    plan,
  };
};

const canShareFiles = (files: File[]): boolean => {
  if (typeof navigator === 'undefined') return false;
  const navigatorWithShare = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
  };
  return Boolean(
    'share' in navigator &&
    navigatorWithShare.canShare &&
    navigatorWithShare.canShare({ files })
  );
};

const downloadFile = (file: File): void => {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Call directly from the second user click so Web Share keeps transient activation. */
export const deliverBrowserLogArchive = async (
  archive: File,
): Promise<BrowserLogExportMethod> => {
  if (canShareFiles([archive])) {
    try {
      const sharePromise = navigator.share({
        files: [archive],
        title: 'ULSA EVO BLE logs archive',
      });
      await sharePromise;
      return 'share';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      // If transient user activation was lost while the ZIP was generated,
      // keep the one-click flow usable with the browser's normal download.
      downloadFile(archive);
      return 'download';
    }
  }

  downloadFile(archive);
  return 'download';
};
