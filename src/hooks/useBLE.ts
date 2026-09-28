import { useState, useEffect, useCallback, useRef } from 'react';
import { type IBLEAdapter, type BLEPlatformInfo, type BLEParseErrorStats, } from '../services/ble';
import type { SensorData, DeviceInfo, CardStatus, CardLogControlStatus, CardLogDetailStatus, CardLogSettingsStatus, CardLogSettingsWriteRequest, DeviceModeStatus, I2cConfigStatus, I2cConfigWriteRequest, RtcTimeStatus, Stm32FirmwareVersionStatus, SampleMetadataStatus, DeviceHealthStatus, BLECapabilitiesStatus, LEDBrightnessStatus } from '../types/ble';
import { DEVICE_HEALTH_REFRESH_MS, DEVICE_MODE_REFRESH_MS, EMPTY_PARSE_ERROR_STATS, EMPTY_RTC_TIME_STATUS, CARD_LOG_DETAIL_REFRESH_MS, CARD_STATUS_REFRESH_MS, } from './ble/constants';
import type { BLEConnectionState, BLEDataState, BLEDeviceInfo, DisplaySampleListener, SensorDisplayUpdate, SensorFieldReceivedAt, TimelineSampleListener, UseBLEOptions, UseBLEReturn } from './ble/types';
import { useBLEConnectionLifecycle } from './ble/useBLEConnectionLifecycle';
import { useBLEDeviceResetControl } from './ble/useBLEDeviceResetControl';
import { useBLEInitialization } from './ble/useBLEInitialization';
import { useBLELedBrightnessControl } from './ble/useBLELedBrightnessControl';
import { useBLELedWindReactiveControl } from './ble/useBLELedWindReactiveControl';
import { useBLEOtaControl } from './ble/useBLEOtaControl';
import { useBLERtcControl } from './ble/useBLERtcControl';
import { useBLEStatusUpdaters } from './ble/useBLEStatusUpdaters';
import { useBLEStm32UpdateControl } from './ble/useBLEStm32UpdateControl';
import { useBLEInstalledDemoVerification } from './ble/useBLEInstalledDemoVerification';
import { useBLECardLogRuntimeSync } from './ble/useBLECardLogRuntimeSync';
import { useBLEFirmwareInfoRefresh } from './ble/useBLEFirmwareInfoRefresh';
export type { BLEPlatformInfo } from '../services/ble';
export type { BLEConnectionState, BLEDataState, BLEDeviceInfo, UseBLEOptions, UseBLEReturn } from './ble/types';
export const useBLE = (options: UseBLEOptions = {}): UseBLEReturn => {
    const diagnosticsActive = options.diagnosticsActive === true;
    const backgroundSensorDisplayActiveRef = useRef(options.backgroundSensorDisplayActive === true);
    backgroundSensorDisplayActiveRef.current = options.backgroundSensorDisplayActive === true;
    const [connectionState, setConnectionState] = useState<BLEConnectionState>('disconnected');
    const [connectedDevice, setConnectedDevice] = useState<BLEDeviceInfo | null>(null);
    const [availableDevices, setAvailableDevices] = useState<BLEDeviceInfo[]>([]);
    const [identifyingDeviceId, setIdentifyingDeviceId] = useState<string | null>(null);
    const [sensorData, setSensorData] = useState<SensorData | null>(null);
    const [sensorFieldReceivedAt, setSensorFieldReceivedAt] = useState<SensorFieldReceivedAt>({});
    const [dataState, setDataState] = useState<BLEDataState>('idle');
    const [lastSensorDataAt, setLastSensorDataAt] = useState<number | null>(null);
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
    const [stm32FirmwareVersion, setStm32FirmwareVersion] = useState<Stm32FirmwareVersionStatus | null>(null);
    const [stm32FirmwareVersionLastReadAt, setStm32FirmwareVersionLastReadAt] = useState<number | null>(null);
    const [sampleMetadataStatus, setSampleMetadataStatus] = useState<SampleMetadataStatus | null>(null);
    const [sampleMetadataLastReadAt, setSampleMetadataLastReadAt] = useState<number | null>(null);
    const [deviceHealthStatus, setDeviceHealthStatus] = useState<DeviceHealthStatus | null>(null);
    const [deviceHealthLastReadAt, setDeviceHealthLastReadAt] = useState<number | null>(null);
    const [capabilitiesStatus, setCapabilitiesStatus] = useState<BLECapabilitiesStatus | null>(null);
    const [capabilitiesLastReadAt, setCapabilitiesLastReadAt] = useState<number | null>(null);
    const [ledBrightnessStatus, setLedBrightnessStatus] = useState<LEDBrightnessStatus | null>(null);
    const [ledBrightnessSupported, setLedBrightnessSupported] = useState<boolean | null>(null);
    const [ledBrightnessBusy, setLedBrightnessBusy] = useState<boolean>(false);
    const [cardStatus, setCardStatus] = useState<CardStatus | null>(null);
    const [cardStatusLastReadAt, setCardStatusLastReadAt] = useState<number | null>(null);
    const [cardLogControlStatus, setCardLogControlStatus] = useState<CardLogControlStatus | null>(null);
    const [cardLogControlSupported, setCardLogControlSupported] = useState<boolean | null>(null);
    const [cardLogControlBusy, setCardLogControlBusy] = useState<boolean>(false);
    const [cardLogDetailStatus, setCardLogDetailStatus] = useState<CardLogDetailStatus | null>(null);
    const [cardLogDetailLastReadAt, setCardLogDetailLastReadAt] = useState<number | null>(null);
    const [cardLogSettingsStatus, setCardLogSettingsStatus] = useState<CardLogSettingsStatus | null>(null);
    const [cardLogSettingsLastReadAt, setCardLogSettingsLastReadAt] = useState<number | null>(null);
    const [cardLogSettingsBusy, setCardLogSettingsBusy] = useState<boolean>(false);
    const [rtcTimeStatus, setRtcTimeStatus] = useState<RtcTimeStatus>(EMPTY_RTC_TIME_STATUS);
    const [deviceModeStatus, setDeviceModeStatus] = useState<DeviceModeStatus | null>(null);
    const [deviceModeLastReadAt, setDeviceModeLastReadAt] = useState<number | null>(null);
    const [deviceModeNotifyActive, setDeviceModeNotifyActive] = useState<boolean>(false);
    const [deviceModeSupported, setDeviceModeSupported] = useState<boolean | null>(null);
    const [i2cConfigStatus, setI2cConfigStatus] = useState<I2cConfigStatus | null>(null);
    const [i2cConfigSupported, setI2cConfigSupported] = useState<boolean | null>(null);
    const [i2cConfigBusy, setI2cConfigBusy] = useState<boolean>(false);
    const [parseErrorStats, setParseErrorStats] = useState<BLEParseErrorStats>(EMPTY_PARSE_ERROR_STATS);
    const [error, setError] = useState<string | null>(null);
    const [isSupported, setIsSupported] = useState<boolean>(false);
    const [platformInfo, setPlatformInfo] = useState<BLEPlatformInfo | null>(null);
    const adapterRef = useRef<IBLEAdapter | null>(null);
    const latestDisplaySampleRef = useRef<SensorDisplayUpdate | null>(null);
    const displaySampleListenersRef = useRef(new Set<DisplaySampleListener>());
    const subscribeDisplaySamples = useCallback((listener: DisplaySampleListener) => {
        displaySampleListenersRef.current.add(listener);
        if (latestDisplaySampleRef.current)
            listener(latestDisplaySampleRef.current);
        return () => displaySampleListenersRef.current.delete(listener);
    }, []);
    const publishDisplaySample = useCallback((update: SensorDisplayUpdate) => {
        latestDisplaySampleRef.current = update;
        displaySampleListenersRef.current.forEach((listener) => listener(update));
    }, []);
    const timelineSampleListenersRef = useRef(new Set<TimelineSampleListener>());
    const subscribeTimelineSamples = useCallback((listener: TimelineSampleListener) => {
        timelineSampleListenersRef.current.add(listener);
        return () => timelineSampleListenersRef.current.delete(listener);
    }, []);
    const publishTimelineSample = useCallback((sample: SensorData) => {
        timelineSampleListenersRef.current.forEach((listener) => {
            try {
                listener(sample);
            }
            catch (listenerError) {
                console.error('timeline sample listener failed:', listenerError);
            }
        });
    }, []);
    const isInitializedRef = useRef<boolean>(false);
    const lastSensorDataAtRef = useRef<number | null>(null);
    const deviceModeRefreshInFlightRef = useRef<boolean>(false);
    const rtcRefreshInFlightRef = useRef<boolean>(false);
    const cardStatusRefreshInFlightRef = useRef<boolean>(false);
    const cardLogControlOperationInFlightRef = useRef<boolean>(false);
    const cardLogSettingsOperationInFlightRef = useRef<boolean>(false);
    const sampleMetadataRefreshInFlightRef = useRef<boolean>(false);
    const deviceHealthRefreshInFlightRef = useRef<boolean>(false);
    const capabilitiesRefreshInFlightRef = useRef<boolean>(false);
    const i2cConfigOperationInFlightRef = useRef<boolean>(false);
    const { updateCapabilitiesStatus, updateDeviceHealthStatus, updateI2cConfigStatus, updateLedBrightnessStatus, updateSampleMetadataStatus, updateCardLogControlStatus, updateCardLogDetailStatus, updateCardLogSettingsStatus, updateCardStatus, updateStm32FirmwareVersion, } = useBLEStatusUpdaters({
        setCapabilitiesStatus,
        setDeviceHealthStatus,
        setI2cConfigStatus,
        setLedBrightnessStatus,
        setLedBrightnessSupported,
        setSampleMetadataStatus,
        setCardLogControlStatus,
        setCardLogDetailStatus,
        setCardLogSettingsStatus,
        setCardStatus,
        setStm32FirmwareVersion,
    });
    const { refreshLedBrightness, setLedBrightness } = useBLELedBrightnessControl({
        adapterRef,
        connectionState,
        updateLedBrightnessStatus,
        setLedBrightnessBusy,
        setError,
    });
    const { ledWindReactiveStatus, ledWindReactiveSupported, ledWindReactiveBusy, refreshLedWindReactive, setLedWindReactive, } = useBLELedWindReactiveControl({ adapterRef, connectionState, setError });
    useBLEInitialization({
        adapterRef,
        isInitializedRef,
        setError,
        setIsSupported,
        setPlatformInfo,
    });
    const { otaControlBusy, otaControlStatus, refreshOtaControlStatus, writeOtaControl } = useBLEOtaControl({ adapterRef, connectionState, setError });
    const { stm32UpdateControlBusy, stm32UpdateControlStatus, refreshStm32UpdateControlStatus, writeStm32UpdateControl } = useBLEStm32UpdateControl({ adapterRef, connectionState, setError });
    const { deviceResetStatus, deviceResetSupported, deviceResetBusy, refreshDeviceResetStatus, resetDevice, } = useBLEDeviceResetControl({
        adapterRef,
        connectionState,
        setError,
        updateDeviceHealthStatus,
        updateStm32FirmwareVersion,
        setDeviceHealthLastReadAt,
        setStm32FirmwareVersionLastReadAt,
    });
    const clearError = useCallback(() => {
        setError(null);
    }, []);
    const { connectionSessionRef, cancelScan, connectToDevice, disconnect, handleDeviceModeStatus, identifyDevice, readRtcTimezoneFromAdapter, readCardLogControlFromAdapter, scanAndConnect, setSensorNotificationsPaused, } = useBLEConnectionLifecycle({
        adapterRef,
        connectionState,
        platformInfo,
        backgroundSensorDisplayActiveRef,
        lastSensorDataAtRef,
        rtcRefreshInFlightRef,
        setConnectionState,
        setConnectedDevice,
        setAvailableDevices,
        setIdentifyingDeviceId,
        setSensorData,
        setSensorFieldReceivedAt,
        setDataState,
        setLastSensorDataAt,
        setDeviceInfo,
        setStm32FirmwareVersion,
        setStm32FirmwareVersionLastReadAt,
        setSampleMetadataStatus,
        setSampleMetadataLastReadAt,
        setDeviceHealthStatus,
        setDeviceHealthLastReadAt,
        setCapabilitiesStatus,
        setCapabilitiesLastReadAt,
        setLedBrightnessStatus,
        setLedBrightnessSupported,
        setLedBrightnessBusy,
        setCardStatus,
        setCardStatusLastReadAt,
        setCardLogControlStatus,
        setCardLogControlSupported,
        setCardLogControlBusy,
        setCardLogDetailStatus,
        setCardLogDetailLastReadAt,
        setCardLogSettingsStatus,
        setCardLogSettingsLastReadAt,
        setCardLogSettingsBusy,
        setRtcTimeStatus,
        setDeviceModeStatus,
        setDeviceModeLastReadAt,
        setDeviceModeNotifyActive,
        setDeviceModeSupported,
        setI2cConfigStatus,
        setI2cConfigSupported,
        setI2cConfigBusy,
        setParseErrorStats,
        setError,
        publishTimelineSample,
        publishDisplaySample,
        updateCardStatus,
        updateCardLogControlStatus,
        updateStm32FirmwareVersion,
        updateSampleMetadataStatus,
        updateDeviceHealthStatus,
        updateCapabilitiesStatus,
        updateLedBrightnessStatus,
        updateCardLogDetailStatus,
        updateCardLogSettingsStatus,
        updateI2cConfigStatus,
    });
    const verifyInstalledDemo = useBLEInstalledDemoVerification({
        adapterRef,
        platformInfo,
        connectToDevice,
        setDeviceInfo,
    });
    const { refreshStm32FirmwareVersion, refreshFirmwareVersions, firmwareInfoBusy, firmwareInfoError } = useBLEFirmwareInfoRefresh({
        adapterRef, connectionState, connectionSessionRef, setDeviceInfo,
        updateStm32FirmwareVersion, setStm32FirmwareVersionLastReadAt,
    });
    const refreshSampleMetadataStatus = useCallback(async () => {
        const adapter = adapterRef.current;
        if (!adapter || connectionState !== 'connected' || sampleMetadataRefreshInFlightRef.current) {
            return;
        }
        sampleMetadataRefreshInFlightRef.current = true;
        try {
            const status = await adapter.getSampleMetadataStatus();
            updateSampleMetadataStatus(status);
            setSampleMetadataLastReadAt(Date.now());
        }
        catch (err) {
            console.error('Sample Metadata取得エラー:', err);
            updateSampleMetadataStatus(null);
            setSampleMetadataLastReadAt(Date.now());
        }
        finally {
            sampleMetadataRefreshInFlightRef.current = false;
        }
    }, [connectionState, updateSampleMetadataStatus]);
    const refreshDeviceHealthStatus = useCallback(async () => {
        const adapter = adapterRef.current;
        if (!adapter || connectionState !== 'connected' || deviceHealthRefreshInFlightRef.current) {
            return;
        }
        deviceHealthRefreshInFlightRef.current = true;
        try {
            const status = await adapter.getDeviceHealthStatus();
            updateDeviceHealthStatus(status);
            setDeviceHealthLastReadAt(Date.now());
        }
        catch (err) {
            console.error('Device Health取得エラー:', err);
            updateDeviceHealthStatus(null);
            setDeviceHealthLastReadAt(Date.now());
        }
        finally {
            deviceHealthRefreshInFlightRef.current = false;
        }
    }, [connectionState, updateDeviceHealthStatus]);
    const { syncTime, setRtcTimezone, refreshRtcTime } = useBLERtcControl({
        adapterRef,
        connectionState,
        deviceKey: connectedDevice?.deviceId ?? null,
        diagnosticsActive,
        readRtcTimezoneFromAdapter,
        refreshDeviceHealthStatus,
        setError,
        setRtcTimeStatus,
    });
    const refreshCapabilitiesStatus = useCallback(async () => {
        const adapter = adapterRef.current;
        if (!adapter || connectionState !== 'connected' || capabilitiesRefreshInFlightRef.current) {
            return;
        }
        capabilitiesRefreshInFlightRef.current = true;
        try {
            const status = await adapter.getCapabilitiesStatus();
            updateCapabilitiesStatus(status);
            setCapabilitiesLastReadAt(Date.now());
        }
        catch (err) {
            console.error('Capabilities取得エラー:', err);
            updateCapabilitiesStatus(null);
            setCapabilitiesLastReadAt(Date.now());
        }
        finally {
            capabilitiesRefreshInFlightRef.current = false;
        }
    }, [connectionState, updateCapabilitiesStatus]);
    const { refreshCardLogDetailStatus, refreshCardLogSettingsStatus } = useBLECardLogRuntimeSync({
        adapterRef,
        connectionState,
        readCardLogControlFromAdapter,
        updateCardLogDetailStatus,
        setCardLogDetailLastReadAt,
        updateCardLogSettingsStatus,
        setCardLogSettingsLastReadAt,
    });
    useEffect(() => {
        if (connectionState !== 'connected' || !diagnosticsActive) {
            return;
        }
        void refreshSampleMetadataStatus();
        void refreshDeviceHealthStatus();
        void refreshCardLogDetailStatus();
        void refreshCardLogSettingsStatus();
        const interval = setInterval(() => {
            void refreshSampleMetadataStatus();
            void refreshDeviceHealthStatus();
            void refreshCardLogDetailStatus();
            void refreshCardLogSettingsStatus();
        }, Math.max(DEVICE_HEALTH_REFRESH_MS, CARD_LOG_DETAIL_REFRESH_MS));
        return () => clearInterval(interval);
    }, [connectionState, diagnosticsActive, refreshDeviceHealthStatus, refreshSampleMetadataStatus, refreshCardLogDetailStatus, refreshCardLogSettingsStatus]);
    const refreshCardStatus = useCallback(async () => {
        const adapter = adapterRef.current;
        if (!adapter || connectionState !== 'connected' || cardStatusRefreshInFlightRef.current) {
            return;
        }
        cardStatusRefreshInFlightRef.current = true;
        try {
            const card = await adapter.getCardStatus();
            updateCardStatus(card);
            setCardStatusLastReadAt(Date.now());
            await readCardLogControlFromAdapter(adapter);
            const detail = await adapter.getCardLogDetailStatus();
            updateCardLogDetailStatus(detail);
            setCardLogDetailLastReadAt(Date.now());
            const settings = await adapter.getCardLogSettingsStatus();
            updateCardLogSettingsStatus(settings);
            setCardLogSettingsLastReadAt(Date.now());
        }
        catch (err) {
            console.error('カードステータス取得エラー:', err);
            updateCardStatus(null);
            setCardStatusLastReadAt(Date.now());
            await readCardLogControlFromAdapter(adapter);
            try {
                const detail = await adapter.getCardLogDetailStatus();
                updateCardLogDetailStatus(detail);
                setCardLogDetailLastReadAt(Date.now());
                const settings = await adapter.getCardLogSettingsStatus();
                updateCardLogSettingsStatus(settings);
                setCardLogSettingsLastReadAt(Date.now());
            }
            catch {
                updateCardLogDetailStatus(null);
                setCardLogDetailLastReadAt(Date.now());
                updateCardLogSettingsStatus(null);
                setCardLogSettingsLastReadAt(Date.now());
            }
        }
        finally {
            cardStatusRefreshInFlightRef.current = false;
        }
    }, [connectionState, readCardLogControlFromAdapter, updateCardLogDetailStatus, updateCardLogSettingsStatus, updateCardStatus]);
    useEffect(() => {
        const adapter = adapterRef.current;
        if (!adapter || connectionState !== 'connected') {
            return;
        }
        const interval = setInterval(() => {
            void refreshCardStatus();
        }, CARD_STATUS_REFRESH_MS);
        return () => clearInterval(interval);
    }, [connectionState, refreshCardStatus]);
    const refreshDeviceModeStatus = useCallback(async () => {
        const adapter = adapterRef.current;
        if (!adapter || connectionState !== 'connected' || deviceModeRefreshInFlightRef.current) {
            return;
        }
        deviceModeRefreshInFlightRef.current = true;
        try {
            const modeStatus = await adapter.getDeviceModeStatus();
            if (modeStatus) {
                handleDeviceModeStatus(modeStatus);
            }
            else if (!deviceModeStatus && !deviceModeNotifyActive) {
                setDeviceModeSupported(false);
            }
        }
        catch (err) {
            console.error('ESP32モード取得エラー:', err);
            if (!deviceModeStatus && !deviceModeNotifyActive) {
                setDeviceModeSupported(false);
            }
        }
        finally {
            deviceModeRefreshInFlightRef.current = false;
        }
    }, [connectionState, deviceModeNotifyActive, deviceModeStatus, handleDeviceModeStatus]);
    useEffect(() => {
        if (connectionState !== 'connected' || deviceModeNotifyActive) {
            return;
        }
        const interval = setInterval(() => {
            void refreshDeviceModeStatus();
        }, DEVICE_MODE_REFRESH_MS);
        return () => clearInterval(interval);
    }, [connectionState, deviceModeNotifyActive, refreshDeviceModeStatus]);
    const setCardLogging = useCallback(async (enabled: boolean) => {
        const adapter = adapterRef.current;
        if (!adapter || connectionState !== 'connected') {
            setError('デバイスが接続されていません');
            return;
        }
        if (cardLogControlOperationInFlightRef.current) {
            return;
        }
        cardLogControlOperationInFlightRef.current = true;
        try {
            setError(null);
            setCardLogControlBusy(true);
            const status = await adapter.setCardLogging(enabled);
            updateCardLogControlStatus(status);
            setCardLogControlSupported(status !== null);
            const operationFailure = !status
                ? 'カードログ制御ステータスを取得できませんでした。ESP32 firmwareのカードログ Control Characteristicを確認してください'
                : status.result === 'wrongMode'
                    ? 'カードログを開始するには本体をI2C計測モードに戻してください。'
                    : status.result !== 'ok' ? `カードログ操作が完了しませんでした: ${status.result}` : null;
            const card = await adapter.getCardStatus();
            updateCardStatus(card);
            setCardStatusLastReadAt(Date.now());
            await readCardLogControlFromAdapter(adapter);
            const detail = await adapter.getCardLogDetailStatus();
            updateCardLogDetailStatus(detail);
            setCardLogDetailLastReadAt(Date.now());
            const settings = await adapter.getCardLogSettingsStatus();
            updateCardLogSettingsStatus(settings);
            setCardLogSettingsLastReadAt(Date.now());
            if (operationFailure)
                throw new Error(operationFailure);
        }
        catch (err) {
            console.error('カードログ操作エラー:', err);
            setError(err instanceof Error ? err.message : 'カードログ操作に失敗しました');
            throw err;
        }
        finally {
            setCardLogControlBusy(false);
            cardLogControlOperationInFlightRef.current = false;
        }
    }, [connectionState, readCardLogControlFromAdapter, updateCardLogControlStatus, updateCardLogDetailStatus, updateCardLogSettingsStatus, updateCardStatus]);
    const writeCardLogSettings = useCallback(async (request: CardLogSettingsWriteRequest) => {
        const adapter = adapterRef.current;
        if (!adapter || connectionState !== 'connected') {
            setError('デバイスが接続されていません');
            return;
        }
        if (cardLogSettingsOperationInFlightRef.current) {
            return;
        }
        cardLogSettingsOperationInFlightRef.current = true;
        try {
            setError(null);
            setCardLogSettingsBusy(true);
            const status = await adapter.writeCardLogSettings(request);
            updateCardLogSettingsStatus(status);
            setCardLogSettingsLastReadAt(Date.now());
            if (!status) {
                setError('カードログ設定ステータスを取得できませんでした。ESP32 firmwareのカードログ Settings Characteristicを確認してください');
                return;
            }
            if (status.result !== 'ok') {
                setError(`カードログ設定が完了しませんでした: ${status.result}`);
            }
            const detail = await adapter.getCardLogDetailStatus();
            updateCardLogDetailStatus(detail);
            setCardLogDetailLastReadAt(Date.now());
        }
        catch (err) {
            console.error('カードログ設定エラー:', err);
            setError(err instanceof Error ? err.message : 'カードログ設定に失敗しました');
        }
        finally {
            setCardLogSettingsBusy(false);
            cardLogSettingsOperationInFlightRef.current = false;
        }
    }, [connectionState, updateCardLogDetailStatus, updateCardLogSettingsStatus]);
    const refreshI2cConfigStatus = useCallback(async () => {
        const adapter = adapterRef.current;
        if (!adapter || connectionState !== 'connected' || i2cConfigOperationInFlightRef.current) {
            return;
        }
        i2cConfigOperationInFlightRef.current = true;
        try {
            setI2cConfigBusy(true);
            const status = await adapter.writeI2cConfig({ op: 'read' });
            updateI2cConfigStatus(status);
            setI2cConfigSupported(status === null ? null : status.configWriteSupported);
        }
        catch (err) {
            console.error('I2C設定ステータス取得エラー:', err);
            updateI2cConfigStatus(null);
            setI2cConfigSupported(null);
        }
        finally {
            setI2cConfigBusy(false);
            i2cConfigOperationInFlightRef.current = false;
        }
    }, [connectionState, updateI2cConfigStatus]);
    const writeI2cConfig = useCallback(async (request: I2cConfigWriteRequest): Promise<boolean> => {
        const adapter = adapterRef.current;
        if (!adapter || connectionState !== 'connected') {
            setError('デバイスが接続されていません');
            return false;
        }
        if (i2cConfigOperationInFlightRef.current) {
            return false;
        }
        i2cConfigOperationInFlightRef.current = true;
        try {
            setError(null);
            setI2cConfigBusy(true);
            const status = await adapter.writeI2cConfig(request);
            updateI2cConfigStatus(status);
            setI2cConfigSupported(status === null ? null : status.configWriteSupported);
            if (!status) {
                setError('I2C設定ステータスを取得できませんでした。ESP32 firmware、BLE Characteristic、STM32 I2C検出状態を確認してください');
                return false;
            }
            if (status.result !== 'ok') {
                setError(`I2C設定操作が完了しませんでした: ${status.result}`);
                return false;
            }
            return true;
        }
        catch (err) {
            console.error('I2C設定操作エラー:', err);
            setError(err instanceof Error ? err.message : 'I2C設定操作に失敗しました');
            return false;
        }
        finally {
            setI2cConfigBusy(false);
            i2cConfigOperationInFlightRef.current = false;
        }
    }, [connectionState, updateI2cConfigStatus]);
    return {
        connectionState,
        connectedDevice,
        availableDevices,
        identifyingDeviceId,
        sensorData,
        subscribeDisplaySamples,
        subscribeTimelineSamples,
        sensorFieldReceivedAt,
        dataState,
        lastSensorDataAt,
        deviceInfo,
        firmwareInfoBusy,
        firmwareInfoError,
        stm32FirmwareVersion,
        stm32FirmwareVersionLastReadAt,
        sampleMetadataStatus,
        sampleMetadataLastReadAt,
        deviceHealthStatus,
        deviceHealthLastReadAt,
        capabilitiesStatus,
        capabilitiesLastReadAt,
        ledBrightnessStatus,
        ledBrightnessSupported,
        ledBrightnessBusy,
        ledWindReactiveStatus,
        ledWindReactiveSupported,
        ledWindReactiveBusy,
        deviceResetStatus,
        deviceResetSupported,
        deviceResetBusy,
        otaControlStatus,
        otaControlBusy,
        stm32UpdateControlStatus,
        stm32UpdateControlBusy,
        cardStatus,
        cardStatusLastReadAt,
        cardLogControlStatus,
        cardLogControlSupported,
        cardLogControlBusy,
        cardLogDetailStatus,
        cardLogDetailLastReadAt,
        cardLogSettingsStatus,
        cardLogSettingsLastReadAt,
        cardLogSettingsBusy,
        rtcTimeStatus,
        deviceModeStatus,
        deviceModeLastReadAt,
        deviceModeNotifyActive,
        deviceModeSupported,
        i2cConfigStatus,
        i2cConfigSupported,
        i2cConfigBusy,
        parseErrorStats,
        error,
        isSupported,
        platformInfo,
        cancelScan,
        scanAndConnect,
        connectToDevice,
        verifyInstalledDemo,
        identifyDevice,
        disconnect,
        setSensorNotificationsPaused,
        syncTime,
        setRtcTimezone,
        refreshRtcTime,
        refreshStm32FirmwareVersion,
        refreshFirmwareVersions,
        refreshSampleMetadataStatus,
        refreshDeviceHealthStatus,
        refreshCapabilitiesStatus,
        refreshLedBrightness,
        refreshLedWindReactive,
        refreshDeviceResetStatus,
        refreshOtaControlStatus,
        refreshStm32UpdateControlStatus,
        refreshCardStatus,
        setCardLogging,
        setLedBrightness,
        setLedWindReactive,
        resetDevice,
        writeOtaControl,
        writeStm32UpdateControl,
        writeCardLogSettings,
        refreshCardLogDetailStatus,
        refreshCardLogSettingsStatus,
        refreshDeviceModeStatus,
        refreshI2cConfigStatus,
        writeI2cConfig,
        clearError,
    };
};
export default useBLE;
