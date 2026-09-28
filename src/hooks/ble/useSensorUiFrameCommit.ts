import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { SensorFieldName, StandardSensorField } from '../../services/ble';
import type { SensorData } from '../../types/ble';
import { recordPerfEvent } from '../../utils/renderPerfDiagnostics';
import { synchronizeConnectedNodeId } from './connectedNodeIdentity';
import type {
  BLEDataState,
  BLEDeviceInfo,
  SensorDisplayUpdate,
  SensorFieldReceivedAt,
} from './types';

type StateSetter<T> = Dispatch<SetStateAction<T>>;

const STANDARD_SENSOR_FIELDS = new Set<StandardSensorField>([
  'windDirection',
  'windSpeed',
  'temperature',
]);

export class SensorUiFrameBatch {
  private pending: SensorDisplayUpdate | null = null;
  private standardFieldReceivedAt: SensorFieldReceivedAt = {};
  private lastStandardReceivedAt: number | null = null;

  enqueue(sample: SensorData, changedField: SensorFieldName, receivedAt: number): void {
    const isStandard = STANDARD_SENSOR_FIELDS.has(changedField as StandardSensorField);
    if (isStandard) {
      this.standardFieldReceivedAt = {
        ...this.standardFieldReceivedAt,
        [changedField]: receivedAt,
      };
      this.lastStandardReceivedAt = Math.max(this.lastStandardReceivedAt ?? receivedAt, receivedAt);
    }
    this.pending = {
      latestSample: sample,
      standardFieldReceivedAt: { ...this.standardFieldReceivedAt },
      lastStandardReceivedAt: this.lastStandardReceivedAt,
    };
  }

  drain(): SensorDisplayUpdate | null {
    const update = this.pending;
    this.pending = null;
    return update;
  }

  clear(): void {
    this.pending = null;
    this.standardFieldReceivedAt = {};
    this.lastStandardReceivedAt = null;
  }
}

type ScheduledFrame =
  | { kind: 'raf'; id: number }
  | { kind: 'timeout'; id: number };

const scheduleFrame = (callback: () => void): ScheduledFrame => {
  if (typeof window.requestAnimationFrame === 'function') {
    return { kind: 'raf', id: window.requestAnimationFrame(callback) };
  }
  return { kind: 'timeout', id: window.setTimeout(callback, 16) };
};

const cancelFrame = (frame: ScheduledFrame): void => {
  if (frame.kind === 'raf' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frame.id);
    return;
  }
  window.clearTimeout(frame.id);
};

interface UseSensorUiFrameCommitOptions {
  lastSensorDataAtRef: MutableRefObject<number | null>;
  setDataState: StateSetter<BLEDataState>;
  setConnectedDevice: StateSetter<BLEDeviceInfo | null>;
  onSensorDataCommitted?: (update: SensorDisplayUpdate) => void;
}

export const useSensorUiFrameCommit = ({
  lastSensorDataAtRef,
  setDataState,
  setConnectedDevice,
  onSensorDataCommitted,
}: UseSensorUiFrameCommitOptions) => {
  const batchRef = useRef(new SensorUiFrameBatch());
  const scheduledFrameRef = useRef<ScheduledFrame | null>(null);

  const flush = useCallback(() => {
    scheduledFrameRef.current = null;
    const update = batchRef.current.drain();
    if (!update) return;

    recordPerfEvent('useBLE.commitSensorUiFrame');
    onSensorDataCommitted?.(update);
    synchronizeConnectedNodeId(setConnectedDevice, update.latestSample.nodeId);
    if (update.lastStandardReceivedAt !== null) {
      setDataState('live');
    }
  }, [
    setConnectedDevice,
    setDataState,
    onSensorDataCommitted,
  ]);

  const enqueue = useCallback((
    sample: SensorData,
    changedField: SensorFieldName,
    receivedAt: number,
    flushImmediately = false,
  ) => {
    if (STANDARD_SENSOR_FIELDS.has(changedField as StandardSensorField)) {
      lastSensorDataAtRef.current = receivedAt;
    }
    batchRef.current.enqueue(sample, changedField, receivedAt);
    if (flushImmediately) {
      if (scheduledFrameRef.current !== null) cancelFrame(scheduledFrameRef.current);
      scheduledFrameRef.current = null;
      flush();
      return;
    }
    if (scheduledFrameRef.current === null) {
      scheduledFrameRef.current = scheduleFrame(flush);
    }
  }, [flush, lastSensorDataAtRef]);

  const cancel = useCallback(() => {
    if (scheduledFrameRef.current !== null) {
      cancelFrame(scheduledFrameRef.current);
      scheduledFrameRef.current = null;
    }
    batchRef.current.clear();
  }, []);

  useEffect(() => cancel, [cancel]);

  return { enqueueSensorUiUpdate: enqueue, cancelPendingSensorUiUpdate: cancel };
};
