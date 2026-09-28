import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { logBLEDebug } from '../../services/ble/bleLogger';
import type { IBLEAdapter, BLEPlatformInfo, BLEParseErrorStats, SensorNotificationEvent, } from '../../services/ble';
import type { BLECapabilitiesStatus, DeviceHealthStatus, DeviceInfo, DeviceModeStatus, I2cConfigStatus, LEDBrightnessStatus, RtcTimeStatus, SampleMetadataStatus, CardLogControlStatus, CardLogDetailStatus, CardLogSettingsStatus, CardStatus, SensorData, Stm32FirmwareVersionStatus, } from '../../types/ble';
import { recordPerfEvent } from '../../utils/renderPerfDiagnostics';
import { normalizeBleUserMessage } from '../../utils/normalizeBleUserMessage';
import { getTimezoneById } from '../../services/timezoneCatalog';
import { EMPTY_PARSE_ERROR_STATS, EMPTY_RTC_TIME_STATUS, } from './constants';
import { mergeDeviceInfoList, toDeviceInfo, upsertDeviceInfo, validateNotificationStartResult, } from './deviceList';
import { areDeviceModeStatusesEqual } from './statusEquality';
import { synchronizeConnectedNodeId } from './connectedNodeIdentity';
import { useConnectedSensorMonitors } from './useConnectedSensorMonitors';
import { startOptionalConnectionInitialization } from './optionalConnectionInitialization';
import { ULSA_DEVICE_NOT_FOUND_ERROR } from './scanMessages';
import { useSensorUiFrameCommit } from './useSensorUiFrameCommit';
import { useSensorNotificationPauseController } from './useSensorNotificationPauseController';
import { readCardLogControlSafely } from './readCardLogControlSafely';
import type { BLEConnectionState, BLEDataState, BLEDeviceInfo, SensorDisplayUpdate, SensorFieldReceivedAt } from './types';
type StateSetter<T> = Dispatch<SetStateAction<T>>;
interface UseBLEConnectionLifecycleOptions {
    adapterRef: MutableRefObject<IBLEAdapter | null>;
    connectionState: BLEConnectionState;
    platformInfo: BLEPlatformInfo | null;
    backgroundSensorDisplayActiveRef: MutableRefObject<boolean>;
    lastSensorDataAtRef: MutableRefObject<number | null>;
    rtcRefreshInFlightRef: MutableRefObject<boolean>;
    setConnectionState: StateSetter<BLEConnectionState>;
    setConnectedDevice: StateSetter<BLEDeviceInfo | null>;
    setAvailableDevices: StateSetter<BLEDeviceInfo[]>;
    setIdentifyingDeviceId: StateSetter<string | null>;
    setSensorData: StateSetter<SensorData | null>;
    setSensorFieldReceivedAt: StateSetter<SensorFieldReceivedAt>;
    setDataState: StateSetter<BLEDataState>;
    setLastSensorDataAt: StateSetter<number | null>;
    setDeviceInfo: StateSetter<DeviceInfo | null>;
    setStm32FirmwareVersion: StateSetter<Stm32FirmwareVersionStatus | null>;
    setStm32FirmwareVersionLastReadAt: StateSetter<number | null>;
    setSampleMetadataStatus: StateSetter<SampleMetadataStatus | null>;
    setSampleMetadataLastReadAt: StateSetter<number | null>;
    setDeviceHealthStatus: StateSetter<DeviceHealthStatus | null>;
    setDeviceHealthLastReadAt: StateSetter<number | null>;
    setCapabilitiesStatus: StateSetter<BLECapabilitiesStatus | null>;
    setCapabilitiesLastReadAt: StateSetter<number | null>;
    setLedBrightnessStatus: StateSetter<LEDBrightnessStatus | null>;
    setLedBrightnessSupported: StateSetter<boolean | null>;
    setLedBrightnessBusy: StateSetter<boolean>;
    setCardStatus: StateSetter<CardStatus | null>;
    setCardStatusLastReadAt: StateSetter<number | null>;
    setCardLogControlStatus: StateSetter<CardLogControlStatus | null>;
    setCardLogControlSupported: StateSetter<boolean | null>;
    setCardLogControlBusy: StateSetter<boolean>;
    setCardLogDetailStatus: StateSetter<CardLogDetailStatus | null>;
    setCardLogDetailLastReadAt: StateSetter<number | null>;
    setCardLogSettingsStatus: StateSetter<CardLogSettingsStatus | null>;
    setCardLogSettingsLastReadAt: StateSetter<number | null>;
    setCardLogSettingsBusy: StateSetter<boolean>;
    setRtcTimeStatus: StateSetter<RtcTimeStatus>;
    setDeviceModeStatus: StateSetter<DeviceModeStatus | null>;
    setDeviceModeLastReadAt: StateSetter<number | null>;
    setDeviceModeNotifyActive: StateSetter<boolean>;
    setDeviceModeSupported: StateSetter<boolean | null>;
    setI2cConfigStatus: StateSetter<I2cConfigStatus | null>;
    setI2cConfigSupported: StateSetter<boolean | null>;
    setI2cConfigBusy: StateSetter<boolean>;
    setParseErrorStats: StateSetter<BLEParseErrorStats>;
    setError: StateSetter<string | null>;
    publishTimelineSample: (sample: SensorData) => void;
    publishDisplaySample: (update: SensorDisplayUpdate) => void;
    updateCardStatus: (status: CardStatus | null) => void;
    updateCardLogControlStatus: (status: CardLogControlStatus | null) => void;
    updateStm32FirmwareVersion: (status: Stm32FirmwareVersionStatus | null) => void;
    updateSampleMetadataStatus: (status: SampleMetadataStatus | null) => void;
    updateDeviceHealthStatus: (status: DeviceHealthStatus | null) => void;
    updateCapabilitiesStatus: (status: BLECapabilitiesStatus | null) => void;
    updateLedBrightnessStatus: (status: LEDBrightnessStatus | null) => void;
    updateCardLogDetailStatus: (status: CardLogDetailStatus | null) => void;
    updateCardLogSettingsStatus: (status: CardLogSettingsStatus | null) => void;
    updateI2cConfigStatus: (status: I2cConfigStatus | null) => void;
}
interface UseBLEConnectionLifecycleReturn {
    connectionSessionRef: MutableRefObject<number>;
    connectToDevice: (device: BLEDeviceInfo) => Promise<void>;
    scanAndConnect: () => Promise<void>;
    cancelScan: () => Promise<void>;
    identifyDevice: (device: BLEDeviceInfo) => Promise<void>;
    disconnect: () => Promise<void>;
    setSensorNotificationsPaused: (paused: boolean) => Promise<void>;
    handleDisconnect: () => void;
    handleDeviceModeStatus: (status: DeviceModeStatus | null) => void;
    readRtcTimezoneFromAdapter: (adapter: IBLEAdapter, options?: {
        force?: boolean;
        shouldApply?: () => boolean;
    }) => Promise<number | null>;
    readCardLogControlFromAdapter: (adapter: IBLEAdapter) => Promise<CardLogControlStatus | null>;
}
export const useBLEConnectionLifecycle = ({ adapterRef, connectionState, platformInfo, backgroundSensorDisplayActiveRef, lastSensorDataAtRef, rtcRefreshInFlightRef, setConnectionState, setConnectedDevice, setAvailableDevices, setIdentifyingDeviceId, setSensorData, setSensorFieldReceivedAt, setDataState, setLastSensorDataAt, setDeviceInfo, setStm32FirmwareVersion, setStm32FirmwareVersionLastReadAt, setSampleMetadataStatus, setSampleMetadataLastReadAt, setDeviceHealthStatus, setDeviceHealthLastReadAt, setCapabilitiesStatus, setCapabilitiesLastReadAt, setLedBrightnessStatus, setLedBrightnessSupported, setLedBrightnessBusy, setCardStatus, setCardStatusLastReadAt, setCardLogControlStatus, setCardLogControlSupported, setCardLogControlBusy, setCardLogDetailStatus, setCardLogDetailLastReadAt, setCardLogSettingsStatus, setCardLogSettingsLastReadAt, setCardLogSettingsBusy, setRtcTimeStatus, setDeviceModeStatus, setDeviceModeLastReadAt, setDeviceModeNotifyActive, setDeviceModeSupported, setI2cConfigStatus, setI2cConfigSupported, setI2cConfigBusy, setParseErrorStats, setError, publishTimelineSample, publishDisplaySample, updateCardStatus, updateCardLogControlStatus, updateStm32FirmwareVersion, updateSampleMetadataStatus, updateDeviceHealthStatus, updateCapabilitiesStatus, updateLedBrightnessStatus, updateCardLogDetailStatus, updateCardLogSettingsStatus, updateI2cConfigStatus, }: UseBLEConnectionLifecycleOptions): UseBLEConnectionLifecycleReturn => {
    const connectionSessionRef = useRef(0);
    const rtcRequestSeqRef = useRef(0);
    const sensorNotificationsPausedRef = useRef(false);
    const sensorNotificationTransitionRef = useRef<Promise<void>>(Promise.resolve());
    const { enqueueSensorUiUpdate, cancelPendingSensorUiUpdate, } = useSensorUiFrameCommit({
        lastSensorDataAtRef,
        setDataState,
        setConnectedDevice,
        onSensorDataCommitted: publishDisplaySample,
    });
    const handleDisconnect = useCallback(() => {
        cancelPendingSensorUiUpdate();
        connectionSessionRef.current += 1;
        rtcRequestSeqRef.current += 1;
        rtcRefreshInFlightRef.current = false;
        sensorNotificationsPausedRef.current = false;
        logBLEDebug('Device disconnected');
        setConnectionState('disconnected');
        setConnectedDevice(null);
        setAvailableDevices([]);
        setIdentifyingDeviceId(null);
        setSensorData(null);
        setSensorFieldReceivedAt({});
        lastSensorDataAtRef.current = null;
        setDataState('idle');
        setLastSensorDataAt(null);
        setDeviceInfo(null);
        setStm32FirmwareVersion(null);
        setStm32FirmwareVersionLastReadAt(null);
        setSampleMetadataStatus(null);
        setSampleMetadataLastReadAt(null);
        setDeviceHealthStatus(null);
        setDeviceHealthLastReadAt(null);
        setCapabilitiesStatus(null);
        setCapabilitiesLastReadAt(null);
        setLedBrightnessStatus(null);
        setLedBrightnessSupported(null);
        setLedBrightnessBusy(false);
        setCardStatus(null);
        setCardStatusLastReadAt(null);
        setCardLogControlStatus(null);
        setCardLogControlSupported(null);
        setCardLogControlBusy(false);
        setCardLogDetailStatus(null);
        setCardLogDetailLastReadAt(null);
        setCardLogSettingsStatus(null);
        setCardLogSettingsLastReadAt(null);
        setCardLogSettingsBusy(false);
        setRtcTimeStatus(EMPTY_RTC_TIME_STATUS);
        setDeviceModeNotifyActive(false);
        setI2cConfigStatus(null);
        setI2cConfigSupported(null);
        setI2cConfigBusy(false);
        setParseErrorStats(EMPTY_PARSE_ERROR_STATS);
    }, [
        cancelPendingSensorUiUpdate,
        lastSensorDataAtRef,
        rtcRefreshInFlightRef,
        setAvailableDevices,
        setCapabilitiesLastReadAt,
        setCapabilitiesStatus,
        setConnectedDevice,
        setConnectionState,
        setDataState,
        setDeviceHealthLastReadAt,
        setDeviceHealthStatus,
        setDeviceInfo,
        setDeviceModeNotifyActive,
        setI2cConfigBusy,
        setI2cConfigStatus,
        setI2cConfigSupported,
        setIdentifyingDeviceId,
        setLastSensorDataAt,
        setLedBrightnessBusy,
        setLedBrightnessStatus,
        setLedBrightnessSupported,
        setParseErrorStats,
        setRtcTimeStatus,
        setSampleMetadataLastReadAt,
        setSampleMetadataStatus,
        setCardLogControlBusy,
        setCardLogControlStatus,
        setCardLogControlSupported,
        setCardLogDetailLastReadAt,
        setCardLogDetailStatus,
        setCardLogSettingsBusy,
        setCardLogSettingsLastReadAt,
        setCardLogSettingsStatus,
        setCardStatus,
        setCardStatusLastReadAt,
        setSensorData,
        setSensorFieldReceivedAt,
        setStm32FirmwareVersion,
        setStm32FirmwareVersionLastReadAt
    ]);
    const handleSensorData = useCallback((event: SensorNotificationEvent) => {
        recordPerfEvent('useBLE.handleSensorData');
        const { changedField, latestSnapshot, receivedAt } = event;
        const receivedSample: SensorData = {
            ...latestSnapshot,
            timestamp: receivedAt,
        };
        const documentHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
        const backgroundPipDisplayActive = documentHidden && backgroundSensorDisplayActiveRef.current;
        const displayUpdatesAllowed = !documentHidden || backgroundPipDisplayActive;
        if (changedField === 'windDirection' ||
            changedField === 'windSpeed' ||
            changedField === 'temperature') {
            lastSensorDataAtRef.current = receivedAt;
        }
        if (changedField === 'sensorStatus' && displayUpdatesAllowed) {
            setSensorData((current) => (current !== null &&
                current.nodeId === receivedSample.nodeId &&
                current.sensorStatus === receivedSample.sensorStatus &&
                current.statusProtocolVersion === receivedSample.statusProtocolVersion &&
                current.statusFlags === receivedSample.statusFlags &&
                current.serviceStatus === receivedSample.serviceStatus &&
                current.activeCause === receivedSample.activeCause &&
                current.ntcReadingStatus === receivedSample.ntcReadingStatus
                ? current
                : receivedSample));
        }
        if (changedField === 'windSpeed') {
            publishTimelineSample(receivedSample);
        }
        if (displayUpdatesAllowed) {
            enqueueSensorUiUpdate(receivedSample, changedField, receivedAt, backgroundPipDisplayActive && changedField === 'windSpeed');
        }
    }, [
        backgroundSensorDisplayActiveRef,
        enqueueSensorUiUpdate,
        lastSensorDataAtRef,
        publishTimelineSample,
        setSensorData
    ]);
    const handleSensorStatus = useCallback((status: Pick<SensorData, 'nodeId' | 'sensorStatus' | 'statusProtocolVersion' | 'statusFlags' | 'serviceStatus' | 'activeCause' | 'ntcReadingStatus'>) => {
        synchronizeConnectedNodeId(setConnectedDevice, status.nodeId);
    }, [setConnectedDevice]);
    const handleDeviceModeStatus = useCallback((status: DeviceModeStatus | null) => {
        setDeviceModeStatus((current) => {
            if (current === null || status === null) {
                return current === status ? current : status;
            }
            return areDeviceModeStatusesEqual(current, status) ? current : status;
        });
        setDeviceModeLastReadAt(status ? Date.now() : null);
        if (status) {
            setDeviceModeSupported(true);
        }
    }, [setDeviceModeLastReadAt, setDeviceModeStatus, setDeviceModeSupported]);
    const readRtcTimezoneFromAdapter = useCallback(async (adapter: IBLEAdapter, options: {
        force?: boolean;
        shouldApply?: () => boolean;
    } = {}): Promise<number | null> => {
        if (rtcRefreshInFlightRef.current && !options.force) {
            return null;
        }
        rtcRefreshInFlightRef.current = true;
        const requestSeq = ++rtcRequestSeqRef.current;
        const shouldApply = options.shouldApply ?? (() => true);
        const isLatestApplicableRequest = () => shouldApply() && rtcRequestSeqRef.current === requestSeq;
        const readStartedAt = Date.now();
        try {
            const timezoneStatus = await adapter.getRtcTimezoneStatus();
            const readFinishedAt = Date.now();
            if (!isLatestApplicableRequest())
                return null;
            if (!timezoneStatus) {
                setRtcTimeStatus((current) => ({
                    ...current,
                    supported: false,
                    readError: 'このfirmwareはRTC地域設定に対応していません。通常計測は利用できます',
                    lastReadAt: readFinishedAt,
                }));
                return null;
            }
            const zone = timezoneStatus.zoneConfigured
                ? getTimezoneById(timezoneStatus.zoneId)
                : null;
            const hasDeviceTime = timezoneStatus.rtcReadable && timezoneStatus.utcValid;
            const deviceTime = hasDeviceTime
                ? new Date(timezoneStatus.rtcUnixSeconds * 1000)
                : null;
            const systemTimeAtRead = new Date(Math.floor(Math.round((readStartedAt + readFinishedAt) / 2) / 1000) * 1000);
            const offsetMs = deviceTime
                ? deviceTime.getTime() - systemTimeAtRead.getTime()
                : null;
            const readError = !timezoneStatus.rtcDetected
                ? 'RTCを検出できません'
                : !timezoneStatus.rtcReadable
                    ? 'RTCを読み取れません'
                    : !timezoneStatus.utcValid
                        ? 'RTC時刻は未確定です。時刻と地域を同期してください'
                        : !timezoneStatus.zoneConfigured
                            ? '本体の地域が未設定です'
                            : !timezoneStatus.nvsPersisted
                                ? '本体の地域設定が保存されていません'
                                : !zone
                                    ? '本体の地域IDをこのアプリのTZDBで解決できません。地域を再設定してください'
                                    : null;
            setRtcTimeStatus((current) => ({
                ...current,
                deviceTime,
                deviceEpochSeconds: hasDeviceTime ? timezoneStatus.rtcUnixSeconds : null,
                systemTimeAtRead,
                offsetMs,
                offsetAssessment: 'single',
                lastReadAt: readFinishedAt,
                supported: true,
                readError,
                zoneId: timezoneStatus.zoneConfigured ? timezoneStatus.zoneId : null,
                zoneName: zone?.name ?? null,
                totalUtcOffsetMinutes: zone ? timezoneStatus.totalUtcOffsetMinutes : null,
                standardUtcOffsetMinutes: zone ? timezoneStatus.standardUtcOffsetMinutes : null,
                dstOffsetMinutes: zone ? timezoneStatus.dstOffsetMinutes : null,
                tzdbVersion: timezoneStatus.tzdbVersion,
                rtcDetected: timezoneStatus.rtcDetected,
                rtcReadable: timezoneStatus.rtcReadable,
                utcValid: timezoneStatus.utcValid,
                zoneConfigured: timezoneStatus.zoneConfigured,
                nvsPersisted: timezoneStatus.nvsPersisted,
                dstActive: timezoneStatus.dstActive,
                operationGeneration: timezoneStatus.operationGeneration,
                lastOperation: timezoneStatus.lastOperation,
                lastResult: timezoneStatus.result,
                operationBusy: timezoneStatus.busy,
                deviceError: timezoneStatus.error,
            }));
            return offsetMs;
        }
        catch (rtcErr) {
            if (!isLatestApplicableRequest())
                return null;
            const readFinishedAt = Date.now();
            setRtcTimeStatus((current) => ({
                ...current,
                supported: false,
                readError: normalizeBleUserMessage(rtcErr instanceof Error ? rtcErr.message : '') || 'RTC時刻取得に失敗しました',
                lastReadAt: readFinishedAt,
            }));
            return null;
        }
        finally {
            if (rtcRequestSeqRef.current === requestSeq) {
                rtcRefreshInFlightRef.current = false;
            }
        }
    }, [rtcRefreshInFlightRef, setRtcTimeStatus]);
    const readCardLogControlFromAdapter = useCallback(async (adapter: IBLEAdapter): Promise<CardLogControlStatus | null> => {
        return readCardLogControlSafely(adapter, updateCardLogControlStatus, setCardLogControlSupported);
    }, [setCardLogControlSupported, updateCardLogControlStatus]);
    useConnectedSensorMonitors({
        adapterRef, connectionState, platformInfo, lastSensorDataAtRef,
        setDataState, setParseErrorStats, setConnectedDevice,
    });
    const connectToDevice = useCallback(async (device: BLEDeviceInfo) => {
        const adapter = adapterRef.current;
        if (!adapter) {
            setError('BLEが初期化されていません');
            return;
        }
        const connectionSession = ++connectionSessionRef.current;
        const isCurrentSession = () => connectionSessionRef.current === connectionSession;
        try {
            cancelPendingSensorUiUpdate();
            setError(null);
            setSensorData(null);
            setSensorFieldReceivedAt({});
            lastSensorDataAtRef.current = null;
            setLastSensorDataAt(null);
            setDataState('idle');
            setConnectedDevice(null);
            setDeviceInfo(null);
            setStm32FirmwareVersion(null);
            setStm32FirmwareVersionLastReadAt(null);
            setSampleMetadataStatus(null);
            setSampleMetadataLastReadAt(null);
            setDeviceHealthStatus(null);
            setDeviceHealthLastReadAt(null);
            setCapabilitiesStatus(null);
            setCapabilitiesLastReadAt(null);
            setLedBrightnessStatus(null);
            setLedBrightnessSupported(null);
            setLedBrightnessBusy(false);
            setCardStatus(null);
            setCardStatusLastReadAt(null);
            setCardLogControlStatus(null);
            setCardLogControlSupported(null);
            setCardLogControlBusy(false);
            setCardLogDetailStatus(null);
            setCardLogDetailLastReadAt(null);
            setCardLogSettingsStatus(null);
            setCardLogSettingsLastReadAt(null);
            setCardLogSettingsBusy(false);
            setRtcTimeStatus(EMPTY_RTC_TIME_STATUS);
            setDeviceModeStatus(null);
            setDeviceModeLastReadAt(null);
            setDeviceModeNotifyActive(false);
            setDeviceModeSupported(null);
            setI2cConfigStatus(null);
            setI2cConfigSupported(null);
            setI2cConfigBusy(false);
            setParseErrorStats(EMPTY_PARSE_ERROR_STATS);
            setConnectionState('connecting');
            sensorNotificationsPausedRef.current = false;
            await adapter.connect(device.deviceId, () => {
                if (isCurrentSession())
                    handleDisconnect();
            });
            try {
                const notificationResult = await adapter.startSensorNotifications((event) => {
                    if (isCurrentSession())
                        handleSensorData(event);
                }, (status) => {
                    if (isCurrentSession())
                        handleSensorStatus(status);
                });
                validateNotificationStartResult(notificationResult);
            }
            catch (notifyErr) {
                const error = notifyErr instanceof Error
                    ? notifyErr
                    : new Error('センサー通知開始に失敗しました');
                if (isCurrentSession()) {
                    setError(normalizeBleUserMessage(error.message) || 'センサー通知開始に失敗しました');
                }
                await adapter.disconnect().catch(console.error);
                if (isCurrentSession())
                    handleDisconnect();
                return;
            }
            if (!isCurrentSession())
                return;
            setConnectedDevice({
                deviceId: device.deviceId,
                name: device.name,
                nodeId: device.nodeId,
                rssi: device.rssi,
            });
            setAvailableDevices([]);
            setDataState(lastSensorDataAtRef.current === null ? 'waiting' : 'live');
            setConnectionState('connected');
            startOptionalConnectionInitialization({
                adapter,
                isCurrentSession,
                handleDeviceModeStatus,
                readRtcTimezoneStatus: () => readRtcTimezoneFromAdapter(adapter, { force: true, shouldApply: isCurrentSession }),
                setDeviceInfo,
                setStm32FirmwareVersionLastReadAt,
                setSampleMetadataLastReadAt,
                setDeviceHealthLastReadAt,
                setCapabilitiesLastReadAt,
                setCardStatusLastReadAt,
                setCardLogControlSupported,
                setCardLogDetailLastReadAt,
                setCardLogSettingsLastReadAt,
                setDeviceModeNotifyActive,
                setDeviceModeSupported,
                setI2cConfigSupported,
                updateStm32FirmwareVersion,
                updateSampleMetadataStatus,
                updateDeviceHealthStatus,
                updateCapabilitiesStatus,
                updateLedBrightnessStatus,
                updateCardStatus,
                updateCardLogControlStatus,
                updateCardLogDetailStatus,
                updateCardLogSettingsStatus,
                updateI2cConfigStatus,
            });
            logBLEDebug('Connected to:', device.name || device.deviceId);
        }
        catch (err) {
            if (!isCurrentSession())
                return;
            console.error('接続エラー:', err);
            setError(normalizeBleUserMessage(err instanceof Error ? err.message : '') || '接続に失敗しました');
            setConnectionState('disconnected');
            setDataState('idle');
            setConnectedDevice(null);
        }
    }, [
        adapterRef,
        cancelPendingSensorUiUpdate,
        handleDisconnect,
        handleDeviceModeStatus,
        handleSensorData,
        handleSensorStatus,
        lastSensorDataAtRef,
        readRtcTimezoneFromAdapter,
        setAvailableDevices,
        setCapabilitiesLastReadAt,
        setCapabilitiesStatus,
        setConnectedDevice,
        setConnectionState,
        setDataState,
        setDeviceHealthLastReadAt,
        setDeviceHealthStatus,
        setDeviceInfo,
        setDeviceModeLastReadAt,
        setDeviceModeNotifyActive,
        setDeviceModeStatus,
        setDeviceModeSupported,
        setError,
        setI2cConfigBusy,
        setI2cConfigStatus,
        setI2cConfigSupported,
        setLastSensorDataAt,
        setLedBrightnessBusy,
        setLedBrightnessStatus,
        setLedBrightnessSupported,
        setParseErrorStats,
        setRtcTimeStatus,
        setSampleMetadataLastReadAt,
        setSampleMetadataStatus,
        setCardLogControlBusy,
        setCardLogControlStatus,
        setCardLogControlSupported,
        setCardLogDetailLastReadAt,
        setCardLogDetailStatus,
        setCardLogSettingsBusy,
        setCardLogSettingsLastReadAt,
        setCardLogSettingsStatus,
        setCardStatus,
        setCardStatusLastReadAt,
        setSensorData,
        setSensorFieldReceivedAt,
        setStm32FirmwareVersion,
        setStm32FirmwareVersionLastReadAt,
        updateCapabilitiesStatus,
        updateDeviceHealthStatus,
        updateI2cConfigStatus,
        updateLedBrightnessStatus,
        updateSampleMetadataStatus,
        updateCardLogDetailStatus,
        updateCardLogControlStatus,
        updateCardLogSettingsStatus,
        updateCardStatus,
        updateStm32FirmwareVersion
    ]);
    const scanAndConnect = useCallback(async () => {
        const adapter = adapterRef.current;
        if (!adapter) {
            setError('BLEが初期化されていません');
            return;
        }
        try {
            setError(null);
            const isNativeListScan = typeof adapter.scanDevices === 'function' && platformInfo?.adapterType === 'Capacitor';
            if (!isNativeListScan)
                setAvailableDevices((prev) => (prev.length === 0 ? prev : []));
            setConnectionState('scanning');
            logBLEDebug('🔍 デバイス選択を開始...', platformInfo);
            if (typeof adapter.scanDevices === 'function' && platformInfo?.adapterType === 'Capacitor') {
                const devices = await adapter.scanDevices((device) => {
                    setAvailableDevices((prev) => upsertDeviceInfo(prev, toDeviceInfo(device)));
                });
                const deviceInfos = mergeDeviceInfoList(devices);
                setAvailableDevices((prev) => deviceInfos.reduce((list, device) => upsertDeviceInfo(list, device), prev));
                if (deviceInfos.length === 0) {
                    setError(ULSA_DEVICE_NOT_FOUND_ERROR);
                    setConnectionState('disconnected');
                    return;
                }
                setConnectionState('disconnected');
                return;
            }
            const device = await adapter.scanAndSelect();
            logBLEDebug('デバイス選択結果:', device);
            if (!device) {
                setConnectionState('disconnected');
                return;
            }
            await connectToDevice(toDeviceInfo(device));
        }
        catch (err) {
            if (err instanceof Error && err.name === 'NotFoundError') {
                logBLEDebug('ユーザーがデバイス選択をキャンセルしました');
                setConnectionState('disconnected');
                return;
            }
            console.error('スキャンエラー:', err);
            setError(normalizeBleUserMessage(err instanceof Error ? err.message : '') || 'スキャンに失敗しました');
            setConnectionState('disconnected');
        }
    }, [adapterRef, connectToDevice, platformInfo, setAvailableDevices, setConnectionState, setError]);
    const cancelScan = useCallback(async () => {
        const adapter = adapterRef.current;
        if (platformInfo?.adapterType !== 'Capacitor' || typeof adapter?.stopScan !== 'function')
            return;
        await adapter.stopScan();
    }, [adapterRef, platformInfo?.adapterType]);
    const identifyDevice = useCallback(async (device: BLEDeviceInfo) => {
        const adapter = adapterRef.current;
        const identifySession = connectionSessionRef.current;
        if (!adapter) {
            setError('BLEが初期化されていません');
            return;
        }
        if (connectionState === 'connecting') {
            return;
        }
        try {
            setError(null);
            setIdentifyingDeviceId(device.deviceId);
            await adapter.identifyDevice(device.deviceId);
        }
        catch (err) {
            console.error('LED識別エラー:', err);
            if (connectionSessionRef.current === identifySession) {
                setError(normalizeBleUserMessage(err instanceof Error ? err.message : '') || 'LED識別に失敗しました');
            }
        }
        finally {
            setIdentifyingDeviceId(null);
        }
    }, [adapterRef, connectionSessionRef, connectionState, setError, setIdentifyingDeviceId]);
    const disconnect = useCallback(async () => {
        const adapter = adapterRef.current;
        if (!adapter)
            return;
        try {
            await adapter.disconnect();
            handleDisconnect();
        }
        catch (err) {
            console.error('切断エラー:', err);
            handleDisconnect();
        }
    }, [adapterRef, handleDisconnect]);
    const setSensorNotificationsPaused = useSensorNotificationPauseController({
        adapterRef, connectionState, connectionSessionRef, pausedRef: sensorNotificationsPausedRef,
        transitionRef: sensorNotificationTransitionRef, cancelPendingSensorUiUpdate, lastSensorDataAtRef,
        handleSensorData, handleSensorStatus, setDataState, setError, setLastSensorDataAt,
        setSensorData, setSensorFieldReceivedAt,
    });
    return {
        connectionSessionRef,
        cancelScan,
        connectToDevice,
        disconnect,
        setSensorNotificationsPaused,
        handleDeviceModeStatus,
        handleDisconnect,
        identifyDevice,
        readRtcTimezoneFromAdapter,
        readCardLogControlFromAdapter,
        scanAndConnect,
    };
};
