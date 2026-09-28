import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLogRecording } from './useLogRecording';
import type { SensorData } from '../../types/ble';
import { BROWSER_LOG_INTERVAL_STORAGE_KEY, LOG_RECORDING_MODE_STORAGE_KEY, } from './logRecordingPreferences';
const browserLogMocks = vi.hoisted(() => ({
    instances: [] as Array<{
        initialize: ReturnType<typeof vi.fn>;
        start: ReturnType<typeof vi.fn>;
        stop: ReturnType<typeof vi.fn>;
        appendSample: ReturnType<typeof vi.fn>;
        prepareExport: ReturnType<typeof vi.fn>;
        refreshStorage: ReturnType<typeof vi.fn>;
        deleteSession: ReturnType<typeof vi.fn>;
        deleteAll: ReturnType<typeof vi.fn>;
        getStatus: ReturnType<typeof vi.fn>;
        isActive: ReturnType<typeof vi.fn>;
    }>,
    deliverBrowserLogArchive: vi.fn(async () => 'download'),
    restoredStatus: null as Record<string, unknown> | null,
}));
vi.mock('../../services/browserLog', () => {
    type MockBrowserLogStatus = {
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
        sessions: Array<{
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
        }>;
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
    };
    const createStatus = (overrides: Partial<MockBrowserLogStatus> = {}): MockBrowserLogStatus => ({
        active: false,
        sessionId: null,
        rowCount: 0,
        segmentCount: 0,
        completedSegmentCount: 0,
        currentSegmentStartedAt: null,
        lastSampleAt: null,
        bufferedBytes: 0,
        storedSessionCount: 0,
        storedSegmentCount: 0,
        storedRowCount: 0,
        storedBytes: 0,
        hasExportableData: false,
        sessions: [],
        retentionDays: 30,
        maxStoredBytes: 100 * 1024 * 1024,
        minFreeBytes: 16 * 1024 * 1024,
        storageRemainingBytes: 100 * 1024 * 1024,
        storageQuotaBytes: null,
        storageUsageBytes: null,
        originRemainingBytes: null,
        effectiveWritableBytes: 100 * 1024 * 1024,
        storageLimitReached: false,
        maintenanceNotice: null,
        error: null,
        ...overrides,
    });
    class BrowserLogWriter {
        private status = createStatus();
        initialize = vi.fn(async () => {
            if (browserLogMocks.restoredStatus) {
                this.status = createStatus(browserLogMocks.restoredStatus);
            }
            return this.status;
        });
        start = vi.fn(async () => {
            this.status = createStatus({
                active: true,
                sessionId: 'browser-log-session',
                segmentCount: 1,
                currentSegmentStartedAt: 1000,
            });
            return this.status;
        });
        stop = vi.fn(async () => {
            this.status = {
                ...this.status,
                active: false,
                completedSegmentCount: this.status.segmentCount,
                currentSegmentStartedAt: null,
            };
            return this.status;
        });
        appendSample = vi.fn(async () => {
            if (this.status.active) {
                this.status = {
                    ...this.status,
                    rowCount: this.status.rowCount + 1,
                    lastSampleAt: 2000,
                    bufferedBytes: this.status.bufferedBytes + 96,
                    storedSessionCount: 1,
                    storedSegmentCount: 1,
                    storedRowCount: this.status.storedRowCount + 1,
                    storedBytes: this.status.storedBytes + 96,
                    hasExportableData: true,
                };
            }
            return this.status;
        });
        prepareExport = vi.fn(async (sessionId: string | null = null, batchIndex: number = 0, createdAt: number = 1000, plan: {
            batches: never[][];
            totalRawBytes: number;
        } | null = null) => {
            const exportPlan = plan ?? { batches: [[]], totalRawBytes: this.status.storedBytes };
            return {
                file: new File(['zip'], 'logs.zip', { type: 'application/zip' }),
                createdAt,
                rawBytes: this.status.storedBytes,
                totalRawBytes: exportPlan.totalRawBytes,
                sessionCount: this.status.storedSessionCount,
                segmentCount: this.status.storedSegmentCount,
                scopeSessionId: sessionId,
                batchIndex,
                batchCount: exportPlan.batches.length,
                plan: exportPlan,
            };
        });
        refreshStorage = vi.fn(async () => this.status);
        deleteSession = vi.fn(async () => {
            this.status = createStatus();
            return this.status;
        });
        deleteAll = vi.fn(async () => {
            this.status = createStatus();
            return this.status;
        });
        getStatus = vi.fn(() => this.status);
        isActive = vi.fn(() => this.status.active);
        constructor() {
            browserLogMocks.instances.push(this);
        }
    }
    return {
        BROWSER_LOG_MAX_STORED_BYTES: 100 * 1024 * 1024,
        BROWSER_LOG_MIN_FREE_BYTES: 16 * 1024 * 1024,
        BROWSER_LOG_RETENTION_DAYS: 30,
        BrowserLogWriter,
        createEmptyBrowserLogStatus: createStatus,
        deliverBrowserLogArchive: browserLogMocks.deliverBrowserLogArchive,
    };
});
const sample: SensorData = {
    windDirection: 123,
    windSpeed: 1.23,
    windSpeedA: null,
    windSpeedB: null,
    temperature: 24.5,
    soundSpeed: 344.1,
    headingSpeed: 0.12,
    sensorStatus: 0,
    timestamp: 1783230000000,
};
const timelineListeners = new Set<(sample: SensorData) => void>();
const subscribeTimelineSamples = (listener: (sample: SensorData) => void) => {
    timelineListeners.add(listener);
    return () => timelineListeners.delete(listener);
};
const emitTimelineSample = (nextSample: SensorData) => {
    timelineListeners.forEach((listener) => listener(nextSample));
};
const createOptions = (overrides = {}) => ({
    connectionState: 'connected' as const,
    dataSource: 'empty' as const,
    sensorData: null,
    subscribeTimelineSamples,
    cardLoggingActive: false,
    cardAvailable: true,
    cardLogErrorActive: false,
    cardLogOperationBusy: false,
    cardLogButtonDisabled: false,
    cardLogButtonTitle: 'カードログ記録を開始',
    setCardLoggingOnDevice: vi.fn(async () => undefined),
    ...overrides,
});
describe('useLogRecording', () => {
    beforeEach(() => {
        browserLogMocks.instances.length = 0;
        browserLogMocks.deliverBrowserLogArchive.mockClear();
        browserLogMocks.restoredStatus = null;
        timelineListeners.clear();
        window.localStorage.removeItem(LOG_RECORDING_MODE_STORAGE_KEY);
        window.localStorage.removeItem(BROWSER_LOG_INTERVAL_STORAGE_KEY);
    });
    it('does not touch IndexedDB logging for live samples while app logging is inactive', async () => {
        renderHook((options: ReturnType<typeof createOptions>) => useLogRecording(options), { initialProps: createOptions() });
        act(() => {
            for (let index = 1; index <= 10; index += 1) {
                emitTimelineSample({ ...sample, timestamp: sample.timestamp + index * 100 });
            }
        });
        expect(browserLogMocks.instances.at(-1)?.appendSample).not.toHaveBeenCalled();
    });
    it('preserves the existing カードログging button behavior by default', async () => {
        const setCardLoggingOnDevice = vi.fn(async () => undefined);
        const { result } = renderHook(() => useLogRecording(createOptions({ setCardLoggingOnDevice })));
        expect(result.current.logRecordingMode).toBe('card');
        expect(result.current.logButtonTitle).toBe('カードログ記録を開始');
        act(() => {
            result.current.toggleLogRecording();
        });
        await waitFor(() => {
            expect(setCardLoggingOnDevice).toHaveBeenCalledWith(true);
        });
        expect(browserLogMocks.instances.at(-1)?.start).not.toHaveBeenCalled();
    });
    it('restores exportable browser log sessions from IndexedDB on mount', async () => {
        browserLogMocks.restoredStatus = {
            storedSessionCount: 2,
            storedSegmentCount: 3,
            storedRowCount: 240,
            storedBytes: 8192,
            hasExportableData: true,
        };
        const { result } = renderHook(() => useLogRecording(createOptions()));
        await waitFor(() => expect(result.current.browserLogStatus.storedSessionCount).toBe(2));
        expect(result.current.browserLogStatus.storedSegmentCount).toBe(3);
        expect(result.current.browserLogExportDisabled).toBe(false);
        expect(result.current.browserLogExportTitle).toContain('保存済みログ2件');
    });
    it('toggles card destinations and persists their combined selection', async () => {
        const { result } = renderHook(() => useLogRecording(createOptions()));
        await waitFor(() => expect(browserLogMocks.instances.at(-1)?.initialize).toHaveBeenCalled());
        act(() => {
            result.current.toggleLogRecordingDestination('browser');
        });
        expect(result.current.logRecordingMode).toBe('dual');
        expect(window.localStorage.getItem(LOG_RECORDING_MODE_STORAGE_KEY)).toBe('dual');
        act(() => {
            result.current.toggleLogRecordingDestination('card');
        });
        expect(result.current.logRecordingMode).toBe('browser');
        expect(window.localStorage.getItem(LOG_RECORDING_MODE_STORAGE_KEY)).toBe('browser');
        act(() => {
            result.current.toggleLogRecordingDestination('browser');
        });
        expect(result.current.logRecordingMode).toBe('none');
        expect(result.current.logButtonDisabled).toBe(true);
        expect(result.current.logButtonTitle).toBe('保存先を選択してください');
    });
    it('records browser-only samples without touching カードログging when the card side is unavailable', async () => {
        const setCardLoggingOnDevice = vi.fn(async () => undefined);
        const { result, rerender } = renderHook((options: ReturnType<typeof createOptions>) => useLogRecording(options), {
            initialProps: createOptions({
                cardAvailable: false,
                cardLogButtonDisabled: true,
                setCardLoggingOnDevice,
            }),
        });
        act(() => {
            result.current.setLogRecordingMode('browser');
        });
        expect(result.current.logButtonDisabled).toBe(false);
        act(() => {
            result.current.toggleLogRecording();
        });
        await waitFor(() => {
            expect(result.current.browserLogStatus.active).toBe(true);
        });
        expect(result.current.logButtonTitle).toBe('ログ記録を停止');
        expect(setCardLoggingOnDevice).not.toHaveBeenCalled();
        rerender(createOptions({
            dataSource: 'live',
            sensorData: sample,
            setCardLoggingOnDevice,
        }));
        act(() => emitTimelineSample(sample));
        await waitFor(() => {
            expect(result.current.browserLogStatus.rowCount).toBe(1);
        });
        expect(browserLogMocks.instances.at(-1)?.appendSample).toHaveBeenCalledTimes(1);
    });
    it('selects App only when the hidden default Card destination is unavailable', async () => {
        const setCardLoggingOnDevice = vi.fn(async () => undefined);
        const { result } = renderHook(() => useLogRecording(createOptions({
            cardAvailable: false,
            cardLogButtonDisabled: true,
            cardLogButtonTitle: 'カードが検出されていません',
            setCardLoggingOnDevice,
        })));
        expect(result.current.logRecordingMode).toBe('card');
        expect(result.current.recordingDestinations[0]).toMatchObject({ selected: true, state: 'disabled' });
        act(() => result.current.toggleLogRecordingDestination('browser'));
        expect(result.current.logRecordingMode).toBe('browser');
        expect(result.current.logButtonDisabled).toBe(false);
        expect(result.current.logButtonTitle).toBe('アプリログ記録を開始');
        expect(result.current.recordingDestinations[1]).toMatchObject({ selected: true, state: 'ready' });
        act(() => result.current.toggleLogRecording());
        await waitFor(() => expect(result.current.browserLogStatus.active).toBe(true));
        expect(browserLogMocks.instances.at(-1)?.start).toHaveBeenCalledOnce();
        expect(setCardLoggingOnDevice).not.toHaveBeenCalled();
    });
    it('shows how to recover a previously saved dual selection when Card is unavailable', () => {
        const { result } = renderHook(() => useLogRecording(createOptions({
            cardAvailable: false,
            cardLogButtonDisabled: true,
            cardLogButtonTitle: 'カードが検出されていません',
        })));
        act(() => result.current.setLogRecordingMode('dual'));
        expect(result.current.logButtonDisabled).toBe(true);
        expect(result.current.logButtonTitle).toContain('カード内保存を解除するとアプリ内保存だけで記録できます');
        expect(result.current.recordingDestinations.map(({ selected }) => selected)).toEqual([true, true]);
        act(() => result.current.toggleLogRecordingDestination('card'));
        expect(result.current.logRecordingMode).toBe('browser');
        expect(result.current.logButtonDisabled).toBe(false);
    });
    it('blocks app-only logging until BLE connects, then records live data', async () => {
        const setCardLoggingOnDevice = vi.fn(async () => undefined);
        const { result, rerender } = renderHook((options: ReturnType<typeof createOptions>) => useLogRecording(options), {
            initialProps: createOptions({
                connectionState: 'disconnected',
                setCardLoggingOnDevice,
            }),
        });
        act(() => {
            result.current.setLogRecordingMode('browser');
        });
        expect(result.current.logButtonDisabled).toBe(true);
        expect(result.current.logButtonTitle).toBe('BLEデバイスを接続するとログ記録を開始できます');
        expect(result.current.recordingDestinations).toEqual([
            { destination: 'card', selected: false, state: 'disabled' },
            { destination: 'browser', selected: true, state: 'ready' }
        ]);
        act(() => {
            result.current.toggleLogRecording();
        });
        expect(result.current.browserLogStatus.active).toBe(false);
        expect(setCardLoggingOnDevice).not.toHaveBeenCalled();
        expect(browserLogMocks.instances.at(-1)?.start).not.toHaveBeenCalled();
        expect(browserLogMocks.instances.at(-1)?.appendSample).not.toHaveBeenCalled();
        rerender(createOptions({
            connectionState: 'connected',
            setCardLoggingOnDevice,
        }));
        expect(result.current.logButtonDisabled).toBe(false);
        expect(result.current.logButtonTitle).toBe('アプリログ記録を開始');
        act(() => {
            result.current.toggleLogRecording();
        });
        await waitFor(() => {
            expect(result.current.browserLogStatus.active).toBe(true);
        });
        rerender(createOptions({
            connectionState: 'connected',
            dataSource: 'live',
            sensorData: sample,
            setCardLoggingOnDevice,
        }));
        act(() => emitTimelineSample(sample));
        await waitFor(() => {
            expect(result.current.browserLogStatus.rowCount).toBe(1);
        });
        expect(browserLogMocks.instances.at(-1)?.appendSample).toHaveBeenCalledTimes(1);
    });
    it('writes exactly one browser CSV row for each of ten timeline samples', async () => {
        const { result } = renderHook((options: ReturnType<typeof createOptions>) => useLogRecording(options), { initialProps: createOptions() });
        act(() => {
            result.current.setLogRecordingMode('browser');
        });
        act(() => {
            result.current.toggleLogRecording();
        });
        await waitFor(() => expect(result.current.browserLogStatus.active).toBe(true));
        act(() => {
            for (let index = 1; index <= 10; index += 1) {
                emitTimelineSample({
                    ...sample,
                    windSpeed: index,
                    timestamp: sample.timestamp + index * 100,
                });
            }
        });
        await waitFor(() => expect(browserLogMocks.instances.at(-1)?.appendSample).toHaveBeenCalledTimes(10));
        expect(browserLogMocks.instances.at(-1)?.appendSample).toHaveBeenCalledTimes(10);
    });
    it('keeps the default cadence near 10 Hz when notifications arrive slightly early', async () => {
        const { result } = renderHook(() => useLogRecording(createOptions()));
        act(() => result.current.setLogRecordingMode('browser'));
        act(() => result.current.toggleLogRecording());
        await waitFor(() => expect(result.current.browserLogStatus.active).toBe(true));
        act(() => {
            for (let index = 0; index < 10; index += 1) {
                emitTimelineSample({ ...sample, timestamp: sample.timestamp + index * 95 });
            }
        });
        await waitFor(() => expect(browserLogMocks.instances.at(-1)?.appendSample).toHaveBeenCalledTimes(9));
    });
    it('stores only the latest received sample when the independent App interval elapses', async () => {
        const { result } = renderHook((options: ReturnType<typeof createOptions>) => useLogRecording(options), { initialProps: createOptions() });
        let accepted = false;
        act(() => { accepted = result.current.setBrowserLogIntervalMs(10000); });
        expect(accepted).toBe(true);
        expect(result.current.browserLogIntervalMs).toBe(10000);
        act(() => result.current.setLogRecordingMode('browser'));
        act(() => result.current.toggleLogRecording());
        await waitFor(() => expect(result.current.browserLogStatus.active).toBe(true));
        act(() => {
            for (let seconds = 0; seconds <= 10; seconds += 1) {
                emitTimelineSample({
                    ...sample,
                    windSpeed: seconds,
                    timestamp: sample.timestamp + seconds * 1000,
                });
            }
        });
        await waitFor(() => expect(browserLogMocks.instances.at(-1)?.appendSample).toHaveBeenCalledTimes(2));
        expect(browserLogMocks.instances.at(-1)?.appendSample.mock.calls.map(([input]) => input.sample.windSpeed))
            .toEqual([0, 10]);
    });
    it('does not allow the App log interval to change while App recording is active', async () => {
        const { result } = renderHook(() => useLogRecording(createOptions()));
        act(() => result.current.setLogRecordingMode('browser'));
        act(() => result.current.toggleLogRecording());
        await waitFor(() => expect(result.current.browserLogStatus.active).toBe(true));
        expect(result.current.setBrowserLogIntervalMs(10000)).toBe(false);
        expect(result.current.browserLogIntervalMs).toBe(100);
    });
    it('rolls browser logging back when dual-mode Card start fails', async () => {
        const setCardLoggingOnDevice = vi.fn(async () => {
            throw new Error('Card start failed');
        });
        const { result } = renderHook(() => useLogRecording(createOptions({ setCardLoggingOnDevice })));
        act(() => {
            result.current.setLogRecordingMode('dual');
        });
        act(() => {
            result.current.toggleLogRecording();
        });
        await waitFor(() => {
            expect(setCardLoggingOnDevice).toHaveBeenCalledWith(true);
        });
        await waitFor(() => {
            expect(result.current.browserLogStatus.active).toBe(false);
            expect(result.current.browserLogStatus.error).toBe('Card start failed');
        });
        expect(browserLogMocks.instances.at(-1)?.start).toHaveBeenCalledTimes(1);
        expect(browserLogMocks.instances.at(-1)?.stop).toHaveBeenCalledTimes(1);
    });
    it('allows browser log finalization after the Card side of dual logging has failed', async () => {
        const setCardLoggingOnDevice = vi.fn(async () => undefined);
        const { result, rerender } = renderHook((options: ReturnType<typeof createOptions>) => useLogRecording(options), { initialProps: createOptions({ setCardLoggingOnDevice }) });
        act(() => {
            result.current.setLogRecordingMode('dual');
        });
        act(() => {
            result.current.toggleLogRecording();
        });
        await waitFor(() => {
            expect(result.current.browserLogStatus.active).toBe(true);
            expect(setCardLoggingOnDevice).toHaveBeenCalledWith(true);
        });
        rerender(createOptions({
            dataSource: 'live',
            sensorData: sample,
            cardLoggingActive: true,
            setCardLoggingOnDevice,
        }));
        act(() => emitTimelineSample(sample));
        await waitFor(() => {
            expect(result.current.browserLogStatus.hasExportableData).toBe(true);
        });
        rerender(createOptions({
            cardLoggingActive: false,
            cardAvailable: false,
            cardLogErrorActive: true,
            cardStopReasonCode: 3,
            cardLogButtonDisabled: true,
            cardLogButtonTitle: 'カードが検出されていません',
            setCardLoggingOnDevice,
        }));
        expect(result.current.logButtonActive).toBe(true);
        expect(result.current.logButtonDisabled).toBe(false);
        expect(result.current.logButtonTitle).toBe('ログ記録を停止');
        expect(result.current.recordingDestinations).toEqual([
            { destination: 'card', selected: true, state: 'error', detail: '書込失敗' },
            { destination: 'browser', selected: true, state: 'recording' }
        ]);
        expect(result.current.recordingElapsedLabel).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        act(() => {
            result.current.toggleLogRecording();
        });
        await waitFor(() => {
            expect(result.current.browserLogStatus.active).toBe(false);
        });
        expect(browserLogMocks.instances.at(-1)?.stop).toHaveBeenCalledTimes(1);
        expect(setCardLoggingOnDevice).toHaveBeenCalledTimes(1);
        expect(result.current.browserLogExportDisabled).toBe(false);
    });
    it('stops an already active カードログ even if no destination was selected in this app session', async () => {
        window.localStorage.setItem(LOG_RECORDING_MODE_STORAGE_KEY, 'none');
        const setCardLoggingOnDevice = vi.fn(async () => undefined);
        const { result } = renderHook(() => useLogRecording(createOptions({
            cardLoggingActive: true,
            setCardLoggingOnDevice,
        })));
        expect(result.current.logRecordingMode).toBe('none');
        expect(result.current.logButtonActive).toBe(true);
        expect(result.current.logButtonDisabled).toBe(false);
        act(() => {
            result.current.toggleLogRecording();
        });
        await waitFor(() => {
            expect(setCardLoggingOnDevice).toHaveBeenCalledWith(false);
        });
    });
    it('prepares the ZIP first and only shares it from the second user action', async () => {
        browserLogMocks.restoredStatus = {
            storedSessionCount: 1,
            storedSegmentCount: 2,
            storedRowCount: 100,
            storedBytes: 4096,
            hasExportableData: true,
        };
        const { result } = renderHook(() => useLogRecording(createOptions()));
        await waitFor(() => expect(result.current.browserLogStatus.hasExportableData).toBe(true));
        act(() => result.current.prepareBrowserLogExport());
        await waitFor(() => expect(result.current.browserLogPreparedArchive).not.toBeNull());
        expect(browserLogMocks.deliverBrowserLogArchive).not.toHaveBeenCalled();
        expect(result.current.logButtonDisabled).toBe(true);
        expect(result.current.logButtonTitle).toContain('準備済みZIP');
        act(() => result.current.deliverPreparedBrowserLogExport());
        await waitFor(() => expect(browserLogMocks.deliverBrowserLogArchive).toHaveBeenCalledOnce());
        await waitFor(() => expect(result.current.browserLogPreparedArchive).toBeNull());
        expect(result.current.browserLogExportNotice).toContain('自動削除されません');
    });
    it('keeps a prepared ZIP after the share sheet is cancelled', async () => {
        browserLogMocks.restoredStatus = {
            storedSessionCount: 1,
            storedSegmentCount: 1,
            storedRowCount: 10,
            storedBytes: 1024,
            hasExportableData: true,
        };
        browserLogMocks.deliverBrowserLogArchive.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
        const { result } = renderHook(() => useLogRecording(createOptions()));
        await waitFor(() => expect(result.current.browserLogStatus.hasExportableData).toBe(true));
        act(() => result.current.prepareBrowserLogExport());
        await waitFor(() => expect(result.current.browserLogPreparedArchive).not.toBeNull());
        act(() => result.current.deliverPreparedBrowserLogExport());
        await waitFor(() => expect(result.current.browserLogExportNotice).toContain('共有をキャンセル'));
        expect(result.current.browserLogPreparedArchive).not.toBeNull();
        expect(result.current.browserLogStatus.error).toBeNull();
    });
    it('never lets app-log ZIP state block stopping an active card recording', async () => {
        browserLogMocks.restoredStatus = {
            storedSessionCount: 1,
            storedSegmentCount: 1,
            storedRowCount: 10,
            storedBytes: 1024,
            hasExportableData: true,
        };
        const setCardLoggingOnDevice = vi.fn(async () => undefined);
        const { result } = renderHook(() => useLogRecording(createOptions({
            cardLoggingActive: true,
            setCardLoggingOnDevice,
        })));
        await waitFor(() => expect(result.current.browserLogStatus.hasExportableData).toBe(true));
        act(() => result.current.prepareBrowserLogExport());
        await waitFor(() => expect(result.current.browserLogPreparedArchive).not.toBeNull());
        expect(result.current.logButtonActive).toBe(true);
        expect(result.current.logButtonDisabled).toBe(false);
        expect(result.current.logButtonTitle).toBe('ログ記録を停止');
        act(() => result.current.toggleLogRecording());
        await waitFor(() => expect(setCardLoggingOnDevice).toHaveBeenCalledWith(false));
    });
    it('prepares legacy over-limit ZIP batches one explicit save at a time', async () => {
        browserLogMocks.restoredStatus = {
            storedSessionCount: 2,
            storedSegmentCount: 12,
            storedRowCount: 1000,
            storedBytes: 120 * 1024 * 1024,
            hasExportableData: true,
        };
        const { result } = renderHook(() => useLogRecording(createOptions()));
        await waitFor(() => expect(result.current.browserLogStatus.hasExportableData).toBe(true));
        const writer = browserLogMocks.instances.at(-1)!;
        const exportPlan = { batches: [[], []], totalRawBytes: 120 * 1024 * 1024 };
        writer.prepareExport
            .mockResolvedValueOnce({
            file: new File(['part1'], 'logs_part01-of02.zip'),
            createdAt: 5000,
            rawBytes: 90 * 1024 * 1024,
            totalRawBytes: 120 * 1024 * 1024,
            sessionCount: 2,
            segmentCount: 9,
            scopeSessionId: null,
            batchIndex: 0,
            batchCount: 2,
            plan: exportPlan,
        })
            .mockResolvedValueOnce({
            file: new File(['part2'], 'logs_part02-of02.zip'),
            createdAt: 5000,
            rawBytes: 30 * 1024 * 1024,
            totalRawBytes: 120 * 1024 * 1024,
            sessionCount: 1,
            segmentCount: 3,
            scopeSessionId: null,
            batchIndex: 1,
            batchCount: 2,
            plan: exportPlan,
        });
        act(() => result.current.prepareBrowserLogExport());
        await waitFor(() => expect(result.current.browserLogPreparedArchive?.batchIndex).toBe(0));
        act(() => result.current.deliverPreparedBrowserLogExport());
        await waitFor(() => expect(result.current.browserLogNextExportBatch?.batchIndex).toBe(1));
        expect(result.current.logButtonDisabled).toBe(true);
        expect(result.current.logButtonTitle).toContain('次のZIP');
        act(() => result.current.prepareNextBrowserLogExport());
        await waitFor(() => expect(writer.prepareExport).toHaveBeenLastCalledWith(null, 1, 5000, exportPlan));
        await waitFor(() => expect(result.current.browserLogPreparedArchive?.batchIndex).toBe(1));
    });
    it('keeps the next split ZIP cursor when preparation fails and blocks maintenance', async () => {
        browserLogMocks.restoredStatus = {
            storedSessionCount: 2,
            storedSegmentCount: 12,
            storedRowCount: 1000,
            storedBytes: 120 * 1024 * 1024,
            hasExportableData: true,
        };
        const { result } = renderHook(() => useLogRecording(createOptions()));
        await waitFor(() => expect(result.current.browserLogStatus.hasExportableData).toBe(true));
        const writer = browserLogMocks.instances.at(-1)!;
        const exportPlan = { batches: [[], []], totalRawBytes: 120 * 1024 * 1024 };
        writer.prepareExport.mockResolvedValueOnce({
            file: new File(['part1'], 'logs_part01-of02.zip'),
            createdAt: 7000,
            rawBytes: 90 * 1024 * 1024,
            totalRawBytes: 120 * 1024 * 1024,
            sessionCount: 2,
            segmentCount: 9,
            scopeSessionId: null,
            batchIndex: 0,
            batchCount: 2,
            plan: exportPlan,
        });
        act(() => result.current.prepareBrowserLogExport());
        await waitFor(() => expect(result.current.browserLogPreparedArchive).not.toBeNull());
        act(() => result.current.deliverPreparedBrowserLogExport());
        await waitFor(() => expect(result.current.browserLogNextExportBatch?.batchIndex).toBe(1));
        writer.prepareExport.mockRejectedValueOnce(new Error('temporary export failure'));
        act(() => result.current.prepareNextBrowserLogExport());
        await waitFor(() => expect(result.current.browserLogExportError).toBe('temporary export failure'));
        expect(result.current.browserLogNextExportBatch?.batchIndex).toBe(1);
        act(() => result.current.refreshBrowserLogs());
        expect(writer.refreshStorage).not.toHaveBeenCalled();
    });
    it('routes session deletion through one mutually exclusive maintenance operation', async () => {
        browserLogMocks.restoredStatus = {
            storedSessionCount: 1,
            storedSegmentCount: 1,
            storedRowCount: 10,
            storedBytes: 1024,
            hasExportableData: true,
        };
        const { result } = renderHook(() => useLogRecording(createOptions()));
        await waitFor(() => expect(result.current.browserLogStatus.storedSessionCount).toBe(1));
        act(() => result.current.deleteBrowserLogSession('session-1'));
        await waitFor(() => expect(browserLogMocks.instances.at(-1)?.deleteSession).toHaveBeenCalledWith('session-1'));
        await waitFor(() => expect(result.current.browserLogMaintenanceOperation).toBeNull());
        expect(result.current.browserLogStatus.storedSessionCount).toBe(0);
    });
    it('releases maintenance busy state and reports deletion failures separately', async () => {
        browserLogMocks.restoredStatus = {
            storedSessionCount: 1,
            storedSegmentCount: 1,
            storedRowCount: 10,
            storedBytes: 1024,
            hasExportableData: true,
        };
        const { result } = renderHook(() => useLogRecording(createOptions()));
        await waitFor(() => expect(result.current.browserLogStatus.storedSessionCount).toBe(1));
        browserLogMocks.instances.at(-1)?.deleteSession.mockRejectedValueOnce(new Error('delete failed'));
        act(() => result.current.deleteBrowserLogSession('session-1'));
        await waitFor(() => expect(result.current.browserLogMaintenanceError).toBe('delete failed'));
        expect(result.current.browserLogMaintenanceOperation).toBeNull();
        expect(result.current.browserLogStatus.storedSessionCount).toBe(1);
    });
});
