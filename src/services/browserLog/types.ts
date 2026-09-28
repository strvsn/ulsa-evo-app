import type { SensorData } from '../../types/ble';

export type LogRecordingMode = 'none' | 'browser' | 'card' | 'dual';
export type BrowserLogExportScope = string | string[] | null;

export interface BrowserLogSessionSummary {
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
  lastActivityAt: number;
  retentionAnchorAt: number;
  expiresAt: number;
  rowCount: number;
  segmentCount: number;
  sizeBytes: number;
  completed: boolean;
}

export interface BrowserLogStatus {
  active: boolean;
  sessionId: string | null;
  rowCount: number;
  segmentCount: number;
  completedSegmentCount: number;
  currentSegmentStartedAt: number | null;
  lastSampleAt: number | null;
  bufferedBytes: number;
  storedSessionCount: number;
  storedSegmentCount: number;
  storedRowCount: number;
  storedBytes: number;
  hasExportableData: boolean;
  sessions: BrowserLogSessionSummary[];
  retentionDays: number;
  maxStoredBytes: number;
  minFreeBytes: number;
  storageRemainingBytes: number;
  storageQuotaBytes: number | null;
  storageUsageBytes: number | null;
  originRemainingBytes: number | null;
  effectiveWritableBytes: number;
  storageLimitReached: boolean;
  maintenanceNotice: string | null;
  error: string | null;
}

export interface BrowserLogSegmentRecord {
  id: string;
  sessionId: string;
  filename: string;
  startedAt: number;
  endedAt: number | null;
  rowCount: number;
  sizeBytes: number;
  chunkCount: number;
  completed: boolean;
  /** Added with the retention policy. Missing legacy values receive a full grace period. */
  retentionAnchorAt?: number;
}

export interface BrowserLogChunkRecord {
  id: string;
  segmentId: string;
  sessionId: string;
  chunkIndex: number;
  text: string;
}

export interface BrowserLogExportFile {
  sessionId: string;
  filename: string;
  text: string;
  sizeBytes: number;
  rowCount: number;
}

export interface BrowserLogPreparedArchive {
  file: File;
  createdAt: number;
  rawBytes: number;
  totalRawBytes: number;
  sessionCount: number;
  segmentCount: number;
  scopeSessionId: string | null;
  batchIndex: number;
  batchCount: number;
  plan: BrowserLogExportPlan;
}

export interface BrowserLogExportPlanSegment {
  id: string;
  sessionId: string;
  filename: string;
  sizeBytes: number;
  chunkCount: number;
  rowCount: number;
}

export interface BrowserLogExportPlan {
  batches: BrowserLogExportPlanSegment[][];
  totalRawBytes: number;
}

export interface BrowserLogCatalogSummary {
  sessionCount: number;
  segmentCount: number;
  rowCount: number;
  sizeBytes: number;
  sessions: BrowserLogSessionSummary[];
}

export interface BrowserLogWriterOptions {
  segmentDurationMs?: number;
  segmentMaxBytes?: number;
  flushBytes?: number;
  flushRows?: number;
  retentionMs?: number;
  maxStoredBytes?: number;
  minFreeBytes?: number;
  estimateStorage?: () => Promise<StorageEstimate | null>;
  acquireWriterLock?: () => Promise<BrowserLogWriterLock>;
  now?: () => number;
}

export interface BrowserLogWriterLock {
  assertHeld: () => Promise<void>;
  release: () => Promise<void>;
}

export interface BrowserLogSampleInput {
  sample: SensorData;
  receivedAt?: number;
}
