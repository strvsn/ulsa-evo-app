import type { SensorData, DeviceInfo, CardStatus, CardLogControlStatus, CardLogDetailStatus, CardLogSettingsStatus, CardLogSettingsWriteRequest, DeviceModeStatus, DeviceResetStatus, DeviceResetTarget, I2cConfigStatus, I2cConfigWriteRequest, Stm32FirmwareVersionStatus, SampleMetadataStatus, DeviceHealthStatus, BLECapabilitiesStatus, LEDBrightnessStatus, LEDWindReactiveConfig, LEDWindReactiveStatus, OtaControlOp, OtaControlStatus, Stm32UpdateControlOp, Stm32UpdateControlSessionBinding, Stm32UpdateControlStatus, RtcTimezoneStatus, RtcTimezoneWriteRequest } from '../../types/ble';
import type { IBLEAdapter, BLEConnectionState, BLEDevice, BLEParseErrorStats, NotificationStartResult, SensorFieldName, SensorNotificationEvent, SensorStatusCallback, } from './IBLEAdapter';
import { SERVICE_UUIDS, CHARACTERISTIC_UUIDS } from './bleConstants';
import { isBleDebugEnabled, logBLEDebug } from './bleLogger';
import { isChromeBrowser } from './platformDetector';
import { createEmptySensorData } from './sensorDataDefaults';
import { parseDeviceModeStatus } from './deviceModeStatus';
import { startWebBleCardLogDetailNotification, type WebBleCardLogDetailNotification, } from './webBleCardLogNotifications';
import { diagnoseWebBleServices, resolveWebBluetoothNodeId, } from './webBleAdapterHelpers';
import { createWebBleDeviceRequestOptions } from './webBleDiscovery';
import { readWebBleCapabilitiesStatus, readWebBleDeviceHealthStatus, readWebBleDeviceInfo, readWebBleDeviceModeStatus, readWebBleDeviceResetStatus, readWebBleI2cConfigStatus, readWebBleLedBrightness, readWebBleLedWindReactive, readWebBleOtaControlStatus, readWebBleSampleMetadataStatus, readWebBleCardLogControlStatus, readWebBleCardLogDetailStatus, readWebBleCardLogSettingsStatus, readWebBleCardStatus, readWebBleStm32FirmwareVersion, readWebBleStm32UpdateControlStatus, writeWebBleI2cConfig, writeWebBleLedBrightness, writeWebBleLedWindReactive, writeWebBleOtaControl, writeWebBleStm32UpdateControl, writeWebBleDeviceReset, writeWebBleCardLogging, writeWebBleCardLogSettings, type GetWebBleCharacteristic, } from './webBleFeatureAccessors';
import { startWebBleSensorNotifications } from './webBleSensorNotifications';
import { readWebBleRtcTimezoneStatus, writeWebBleRtcTimezone, } from './webBleRtcTimezoneAccessors';
import { recordPerfEvent } from '../../utils/renderPerfDiagnostics';
export class WebBLEAdapter implements IBLEAdapter {
    private connectionState: BLEConnectionState = 'disconnected';
    private device: BluetoothDevice | null = null;
    private server: BluetoothRemoteGATTServer | null = null;
    private sensorData: SensorData = createEmptySensorData();
    private notificationCallback: ((event: SensorNotificationEvent) => void) | null = null;
    private sensorStatusCallback: SensorStatusCallback | null = null;
    private disconnectCallback: (() => void) | null = null;
    private characteristics: Map<string, BluetoothRemoteGATTCharacteristic> = new Map();
    private characteristicListeners: Array<{
        characteristic: BluetoothRemoteGATTCharacteristic;
        handler: (event: Event) => void;
    }> = [];
    private deviceModeNotification: {
        characteristic: BluetoothRemoteGATTCharacteristic;
        handler: (event: Event) => void;
    } | null = null;
    private cardLogDetailNotification: WebBleCardLogDetailNotification | null = null;
    private disconnectHandler: (() => void) | null = null;
    private sensorStatusPollInterval: ReturnType<typeof setInterval> | null = null;
    private sensorNotificationSession = 0;
    private parseErrorCount = 0;
    private lastParseError: string | null = null;
    async initialize(): Promise<void> {
    }
    async scanAndSelect(): Promise<BLEDevice | null> {
        logBLEDebug('🔵 WebBLEAdapter: scanAndSelect開始');
        const requestOptions = createWebBleDeviceRequestOptions();
        logBLEDebug('📋 フィルター設定:', requestOptions);
        try {
            logBLEDebug('📱 navigator.bluetooth.requestDevice() 呼び出し中...');
            this.device = await navigator.bluetooth.requestDevice(requestOptions);
            logBLEDebug('デバイスが選択されました:', this.device);
            if (!this.device) {
                return null;
            }
            const nodeId = await resolveWebBluetoothNodeId(this.device);
            return {
                deviceId: this.device.id,
                name: this.device.name ?? null,
                nodeId,
            };
        }
        catch (error) {
            if ((error as Error).name === 'NotFoundError') {
                logBLEDebug('NotFoundError: ユーザーがキャンセルしました');
                return null;
            }
            console.error('WebBLEAdapter エラー:', error);
            throw error;
        }
    }
    async connect(deviceId: string, onDisconnect?: () => void): Promise<void> {
        if (!this.device || this.device.id !== deviceId) {
            throw new Error('Device not found. Please scan first.');
        }
        this.disconnectCallback = onDisconnect ?? null;
        if (this.disconnectHandler) {
            this.device.removeEventListener('gattserverdisconnected', this.disconnectHandler);
        }
        this.disconnectHandler = () => {
            this.connectionState = 'disconnected';
            this.clearLocalNotificationState();
            this.server = null;
            this.characteristics.clear();
            this.disconnectCallback?.();
        };
        this.device.addEventListener('gattserverdisconnected', this.disconnectHandler);
        this.connectionState = 'connecting';
        try {
            this.server = await this.device.gatt?.connect() ?? null;
            if (!this.server) {
                throw new Error('Failed to connect to GATT server');
            }
            this.connectionState = 'connected';
            if (!isChromeBrowser()) {
                logBLEDebug('[BLE] 非Chromeブラウザ: サービスキャッシュをスキップ、安定化待機中...');
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        catch (error) {
            this.connectionState = 'disconnected';
            throw error;
        }
    }
    async identifyDevice(deviceId: string): Promise<void> {
        if (!this.device || this.device.id !== deviceId || !this.server) {
            throw new Error('デバイス識別には有効なWeb BLE接続が必要です');
        }
        const identify = await this.getCharacteristic(SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.DEVICE_IDENTIFY);
        if (!identify) {
            throw new Error('Device Identify characteristic is not available');
        }
        await identify.writeValue(new Uint8Array([0x01]));
    }
    async disconnect(): Promise<void> {
        this.connectionState = 'disconnecting';
        try {
            await this.stopCardLogDetailNotifications();
            await this.stopDeviceModeNotifications();
            await this.stopSensorNotifications();
            if (this.disconnectHandler && this.device) {
                this.device.removeEventListener('gattserverdisconnected', this.disconnectHandler);
                this.disconnectHandler = null;
            }
            this.server?.disconnect();
        }
        finally {
            this.connectionState = 'disconnected';
            this.server = null;
            this.characteristics.clear();
            this.characteristicListeners = [];
            this.deviceModeNotification = null;
            this.cardLogDetailNotification = null;
        }
    }
    getConnectionState(): BLEConnectionState {
        return this.connectionState;
    }
    getParseErrorStats(): BLEParseErrorStats {
        return {
            count: this.parseErrorCount,
            lastError: this.lastParseError,
        };
    }
    private resetParseErrorStats(): void {
        this.parseErrorCount = 0;
        this.lastParseError = null;
    }
    private resetSensorDataState(): void {
        this.sensorData = createEmptySensorData();
    }
    private clearSensorStatusPolling(): void {
        if (this.sensorStatusPollInterval !== null) {
            clearInterval(this.sensorStatusPollInterval);
            this.sensorStatusPollInterval = null;
        }
    }
    private invalidateSensorNotificationSession(): void {
        this.sensorNotificationSession++;
    }
    private detachCharacteristicListeners(): Array<{
        characteristic: BluetoothRemoteGATTCharacteristic;
        handler: (event: Event) => void;
    }> {
        const listeners = this.characteristicListeners;
        for (const { characteristic, handler } of listeners) {
            try {
                characteristic.removeEventListener('characteristicvaluechanged', handler);
            }
            catch { /* Optional cleanup may already have completed. */ }
        }
        this.characteristicListeners = [];
        return listeners;
    }
    private clearLocalNotificationState(): void {
        this.invalidateSensorNotificationSession();
        this.notificationCallback = null;
        this.sensorStatusCallback = null;
        this.clearSensorStatusPolling();
        this.detachCharacteristicListeners();
        this.detachCardLogDetailNotification();
        this.detachDeviceModeNotification();
        this.resetSensorDataState();
    }
    private detachDeviceModeNotification(): BluetoothRemoteGATTCharacteristic | null {
        const notification = this.deviceModeNotification;
        if (!notification) {
            return null;
        }
        try {
            notification.characteristic.removeEventListener('characteristicvaluechanged', notification.handler);
        }
        catch { /* Optional cleanup may already have completed. */ }
        this.deviceModeNotification = null;
        return notification.characteristic;
    }
    private detachCardLogDetailNotification(): BluetoothRemoteGATTCharacteristic | null {
        const notification = this.cardLogDetailNotification;
        if (!notification)
            return null;
        try {
            notification.characteristic.removeEventListener('characteristicvaluechanged', notification.handler);
        }
        catch { /* Optional cleanup may already have completed. */ }
        this.cardLogDetailNotification = null;
        return notification.characteristic;
    }
    private emitParsedSensorData(update: () => void, changedField: SensorFieldName): void {
        try {
            recordPerfEvent('WebBLEAdapter.sensorFieldUpdate');
            update();
            const receivedAt = Date.now();
            this.sensorData.timestamp = receivedAt;
            recordPerfEvent('WebBLEAdapter.emitSensorField');
            this.notificationCallback?.({
                changedField,
                latestSnapshot: { ...this.sensorData },
                receivedAt,
            });
        }
        catch (error) {
            this.parseErrorCount++;
            this.lastParseError = error instanceof Error ? error.message : String(error);
            console.warn('[BLE] センサーデータ解析エラー。sampleを破棄します:', error);
        }
    }
    private async getCharacteristic(serviceUuid: string, characteristicUuid: string, warnOnFailure = true): Promise<BluetoothRemoteGATTCharacteristic | null> {
        const key = `${serviceUuid}:${characteristicUuid}`;
        if (this.characteristics.has(key)) {
            return this.characteristics.get(key)!;
        }
        if (!this.server)
            return null;
        try {
            const service = await this.server.getPrimaryService(serviceUuid);
            const characteristic = await service.getCharacteristic(characteristicUuid);
            this.characteristics.set(key, characteristic);
            return characteristic;
        }
        catch (e) {
            if (warnOnFailure) {
                console.warn(`⚠️ getCharacteristic失敗 [service=${serviceUuid}, char=${characteristicUuid}]:`, (e as Error).message);
            }
            return null;
        }
    }
    private getCharacteristicAccess(): GetWebBleCharacteristic {
        return (serviceUuid, characteristicUuid, warnOnFailure) => this.getCharacteristic(serviceUuid, characteristicUuid, warnOnFailure);
    }
    async diagnoseServices(): Promise<void> {
        await diagnoseWebBleServices(this.server);
    }
    async startSensorNotifications(callback: (event: SensorNotificationEvent) => void, onSensorStatus?: SensorStatusCallback): Promise<NotificationStartResult> {
        if (!this.server) {
            throw new Error('デバイスが接続されていません');
        }
        if (isBleDebugEnabled())
            await this.diagnoseServices();
        await this.stopSensorNotifications();
        this.resetParseErrorStats();
        this.resetSensorDataState();
        const sensorNotificationSession = ++this.sensorNotificationSession;
        this.notificationCallback = callback;
        this.sensorStatusCallback = onSensorStatus ?? null;
        return startWebBleSensorNotifications({
            getCharacteristic: (serviceUuid, characteristicUuid, warnOnFailure) => this.getCharacteristic(serviceUuid, characteristicUuid, warnOnFailure),
            emitParsedSensorData: (update, requiredField) => this.emitParsedSensorData(update, requiredField),
            updateSensorData: (patch) => {
                this.sensorData = { ...this.sensorData, ...patch };
            },
            onSensorStatus: (status) => this.sensorStatusCallback?.(status),
            addCharacteristicListener: (characteristic, handler) => {
                characteristic.addEventListener('characteristicvaluechanged', handler);
                this.characteristicListeners.push({ characteristic, handler });
            },
            removeCharacteristicListener: (characteristic, handler) => {
                characteristic.removeEventListener('characteristicvaluechanged', handler);
                this.characteristicListeners = this.characteristicListeners.filter((listener) => (listener.characteristic !== characteristic || listener.handler !== handler));
            },
            setSensorStatusPollInterval: (interval) => {
                if (this.sensorNotificationSession !== sensorNotificationSession
                    || this.connectionState !== 'connected'
                    || this.server === null
                    || this.notificationCallback === null) {
                    clearInterval(interval);
                    return;
                }
                this.clearSensorStatusPolling();
                this.sensorStatusPollInterval = interval;
            },
            isSessionActive: () => (this.sensorNotificationSession === sensorNotificationSession
                && this.connectionState === 'connected'
                && this.server !== null
                && this.notificationCallback !== null),
            stopSensorNotifications: () => this.stopSensorNotifications(),
        });
    }
    async stopSensorNotifications(): Promise<void> {
        this.invalidateSensorNotificationSession();
        this.notificationCallback = null;
        this.sensorStatusCallback = null;
        this.clearSensorStatusPolling();
        for (const { characteristic } of this.detachCharacteristicListeners()) {
            try {
                await characteristic.stopNotifications();
            }
            catch { /* Optional cleanup may already have completed. */ }
        }
    }
    async getDeviceInfo(): Promise<DeviceInfo> {
        return readWebBleDeviceInfo(this.getCharacteristicAccess());
    }
    async getStm32FirmwareVersion(): Promise<Stm32FirmwareVersionStatus | null> {
        return readWebBleStm32FirmwareVersion(this.getCharacteristicAccess());
    }
    async getSampleMetadataStatus(): Promise<SampleMetadataStatus | null> {
        return readWebBleSampleMetadataStatus(this.getCharacteristicAccess());
    }
    async getDeviceHealthStatus(): Promise<DeviceHealthStatus | null> {
        return readWebBleDeviceHealthStatus(this.getCharacteristicAccess());
    }
    async getCapabilitiesStatus(): Promise<BLECapabilitiesStatus | null> {
        return readWebBleCapabilitiesStatus(this.getCharacteristicAccess());
    }
    async getLedBrightness(): Promise<LEDBrightnessStatus | null> {
        return readWebBleLedBrightness(this.getCharacteristicAccess());
    }
    async setLedBrightness(brightness: number): Promise<LEDBrightnessStatus | null> {
        return writeWebBleLedBrightness(this.getCharacteristicAccess(), brightness);
    }
    async getLedWindReactive(): Promise<LEDWindReactiveStatus | null> {
        return readWebBleLedWindReactive(this.getCharacteristicAccess());
    }
    async setLedWindReactive(config: LEDWindReactiveConfig): Promise<LEDWindReactiveStatus | null> {
        return writeWebBleLedWindReactive(this.getCharacteristicAccess(), config);
    }
    async getOtaControlStatus(): Promise<OtaControlStatus | null> {
        return readWebBleOtaControlStatus(this.getCharacteristicAccess());
    }
    async writeOtaControl(op: OtaControlOp): Promise<OtaControlStatus | null> {
        return writeWebBleOtaControl(this.getCharacteristicAccess(), op);
    }
    async getStm32UpdateControlStatus(): Promise<Stm32UpdateControlStatus | null> {
        return readWebBleStm32UpdateControlStatus(this.getCharacteristicAccess());
    }
    async writeStm32UpdateControl(op: Stm32UpdateControlOp, binding?: Stm32UpdateControlSessionBinding): Promise<Stm32UpdateControlStatus | null> {
        return writeWebBleStm32UpdateControl(this.getCharacteristicAccess(), op, binding);
    }
    async getDeviceResetStatus(): Promise<DeviceResetStatus | null> {
        return readWebBleDeviceResetStatus(this.getCharacteristicAccess());
    }
    async resetDevice(target: DeviceResetTarget): Promise<DeviceResetStatus | null> {
        return writeWebBleDeviceReset(this.getCharacteristicAccess(), target);
    }
    async getCardStatus(): Promise<CardStatus | null> {
        return readWebBleCardStatus(this.getCharacteristicAccess());
    }
    async getCardLogControlStatus(): Promise<CardLogControlStatus | null> {
        return readWebBleCardLogControlStatus(this.getCharacteristicAccess());
    }
    async getCardLogDetailStatus(): Promise<CardLogDetailStatus | null> {
        return readWebBleCardLogDetailStatus(this.getCharacteristicAccess());
    }
    async startCardLogDetailNotifications(callback: (status: CardLogDetailStatus) => void): Promise<boolean> {
        if (!this.server)
            return false;
        await this.stopCardLogDetailNotifications();
        const characteristic = await this.getCharacteristic(SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.CARD_LOG_DETAIL, false);
        if (!characteristic)
            return false;
        this.cardLogDetailNotification = await startWebBleCardLogDetailNotification(characteristic, callback);
        if (!this.cardLogDetailNotification)
            return false;
        if (this.connectionState !== 'connected' || !this.server) {
            await this.stopCardLogDetailNotifications();
            return false;
        }
        return true;
    }
    async stopCardLogDetailNotifications(): Promise<void> {
        const characteristic = this.detachCardLogDetailNotification();
        if (!characteristic)
            return;
        try {
            await characteristic.stopNotifications();
        }
        catch { /* Optional cleanup may already have completed. */ }
    }
    async getCardLogSettingsStatus(): Promise<CardLogSettingsStatus | null> {
        return readWebBleCardLogSettingsStatus(this.getCharacteristicAccess());
    }
    async setCardLogging(enabled: boolean): Promise<CardLogControlStatus | null> {
        return writeWebBleCardLogging(this.getCharacteristicAccess(), enabled);
    }
    async writeCardLogSettings(request: CardLogSettingsWriteRequest): Promise<CardLogSettingsStatus | null> {
        return writeWebBleCardLogSettings(this.getCharacteristicAccess(), request);
    }
    async getDeviceModeStatus(): Promise<DeviceModeStatus | null> {
        return readWebBleDeviceModeStatus(this.getCharacteristicAccess());
    }
    async startDeviceModeNotifications(callback: (status: DeviceModeStatus) => void): Promise<boolean> {
        if (!this.server) {
            return false;
        }
        await this.stopDeviceModeNotifications();
        const deviceMode = await this.getCharacteristic(SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.DEVICE_MODE);
        if (!deviceMode || !deviceMode.properties.notify) {
            return false;
        }
        const handler = (event: Event) => {
            const target = event.target as BluetoothRemoteGATTCharacteristic;
            const value = target.value;
            if (!value)
                return;
            try {
                callback(parseDeviceModeStatus(value));
            }
            catch (error) {
                console.warn('[BLE] ESP32モードNotify解析失敗:', error);
            }
        };
        try {
            deviceMode.addEventListener('characteristicvaluechanged', handler);
            this.deviceModeNotification = { characteristic: deviceMode, handler };
            await deviceMode.startNotifications();
            return true;
        }
        catch (error) {
            this.detachDeviceModeNotification();
            console.warn('[BLE] ESP32モードNotify開始失敗:', error);
            return false;
        }
    }
    async stopDeviceModeNotifications(): Promise<void> {
        const characteristic = this.detachDeviceModeNotification();
        if (!characteristic) {
            return;
        }
        try {
            await characteristic.stopNotifications();
        }
        catch { /* Optional cleanup may already have completed. */ }
    }
    async getI2cConfigStatus(): Promise<I2cConfigStatus | null> {
        return readWebBleI2cConfigStatus(this.getCharacteristicAccess());
    }
    async writeI2cConfig(request: I2cConfigWriteRequest): Promise<I2cConfigStatus | null> {
        return writeWebBleI2cConfig(this.getCharacteristicAccess(), request);
    }
    async getRtcTimezoneStatus(): Promise<RtcTimezoneStatus | null> {
        return readWebBleRtcTimezoneStatus(this.getCharacteristicAccess());
    }
    async writeRtcTimezone(request: RtcTimezoneWriteRequest): Promise<RtcTimezoneStatus | null> {
        return writeWebBleRtcTimezone(this.getCharacteristicAccess(), request);
    }
    isSupported(): boolean {
        return 'bluetooth' in navigator;
    }
    async isEnabled(): Promise<boolean> {
        if (!this.isSupported())
            return false;
        try {
            const available = await navigator.bluetooth.getAvailability();
            return available;
        }
        catch {
            return true;
        }
    }
}
