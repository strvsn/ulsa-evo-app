import { BleClient } from '@capacitor-community/bluetooth-le';
import type { SensorData, DeviceInfo, CardStatus, CardLogControlStatus, CardLogDetailStatus, CardLogSettingsStatus, CardLogSettingsWriteRequest, DeviceModeStatus, DeviceResetStatus, DeviceResetTarget, I2cConfigStatus, I2cConfigWriteRequest, Stm32FirmwareVersionStatus, SampleMetadataStatus, DeviceHealthStatus, BLECapabilitiesStatus, LEDBrightnessStatus, LEDWindReactiveConfig, LEDWindReactiveStatus, OtaControlOp, OtaControlStatus, Stm32UpdateControlOp, Stm32UpdateControlSessionBinding, Stm32UpdateControlStatus, RtcTimezoneStatus, RtcTimezoneWriteRequest } from '../../types/ble';
import type { IBLEAdapter, BLEConnectionState, BLEDevice as AppBLEDevice, BLEParseErrorStats, NotificationStartResult, SensorFieldName, SensorNotificationEvent, SensorStatusCallback, } from './IBLEAdapter';
import { SERVICE_UUIDS, CHARACTERISTIC_UUIDS } from './bleConstants';
import { createEmptySensorData } from './sensorDataDefaults';
import { parseDeviceModeStatus } from './deviceModeStatus';
import { parseCardLogDetailStatus } from './bleDataParser';
import { logBLEDebug } from './bleLogger';
import { readCapacitorBleCapabilitiesStatus, readCapacitorBleDeviceHealthStatus, readCapacitorBleDeviceInfo, readCapacitorBleDeviceModeStatus, readCapacitorBleDeviceResetStatus, readCapacitorBleI2cConfigStatus, readCapacitorBleLedBrightness, readCapacitorBleLedWindReactive, readCapacitorBleOtaControlStatus, readCapacitorBleSampleMetadataStatus, readCapacitorBleCardLogControlStatus, readCapacitorBleCardLogDetailStatus, readCapacitorBleCardLogSettingsStatus, readCapacitorBleCardStatus, readCapacitorBleStm32FirmwareVersion, readCapacitorBleStm32UpdateControlStatus, writeCapacitorBleI2cConfig, writeCapacitorBleLedBrightness, writeCapacitorBleLedWindReactive, writeCapacitorBleOtaControl, writeCapacitorBleStm32UpdateControl, writeCapacitorBleDeviceReset, writeCapacitorBleCardLogging, writeCapacitorBleCardLogSettings, } from './capacitorBleFeatureAccessors';
import { startCapacitorBleSensorNotifications, stopCapacitorBleSensorNotifications, } from './capacitorBleSensorNotifications';
import { recordPerfEvent } from '../../utils/renderPerfDiagnostics';
import { CapacitorBleScanner } from './capacitorBleScanner';
import { normalizeCapacitorBleScanResult } from './capacitorBleScanResults';
import { CapacitorBleDeviceIdentify } from './capacitorBleDeviceIdentify';
import { readCapacitorBleRtcTimezoneStatus, writeCapacitorBleRtcTimezone, } from './capacitorBleRtcTimezoneAccessors';
export { CAPACITOR_BLE_SCAN_DURATION_MS, CAPACITOR_BLE_SCAN_START_TIMEOUT_MS, } from './capacitorBleScanner';
export class CapacitorBLEAdapter implements IBLEAdapter {
    private connectionState: BLEConnectionState = 'disconnected';
    private connectedDeviceId: string | null = null;
    private sensorData: SensorData = createEmptySensorData();
    private notificationCallback: ((event: SensorNotificationEvent) => void) | null = null;
    private sensorStatusCallback: SensorStatusCallback | null = null;
    private disconnectCallback: (() => void) | null = null;
    private sensorStatusPollInterval: ReturnType<typeof setInterval> | null = null;
    private sensorNotificationSession = 0;
    private deviceModeNotificationActive = false;
    private cardLogDetailNotificationActive = false;
    private parseErrorCount = 0;
    private lastParseError: string | null = null;
    private scanner = new CapacitorBleScanner();
    private deviceIdentify = new CapacitorBleDeviceIdentify(() => this.connectedDeviceId);
    async initialize(): Promise<void> {
        await BleClient.initialize();
    }
    async stopScan(): Promise<void> {
        await this.scanner.stop();
    }
    async scanDevices(onDeviceFound?: (device: AppBLEDevice) => void): Promise<AppBLEDevice[]> {
        const devices: AppBLEDevice[] = [];
        const upsertDevice = (device: AppBLEDevice) => {
            const index = devices.findIndex((d) => d.deviceId === device.deviceId);
            if (index >= 0) {
                devices[index] = { ...devices[index], ...device };
                onDeviceFound?.(devices[index]);
                return;
            }
            devices.push(device);
            onDeviceFound?.(device);
        };
        await this.scanner.scan([SERVICE_UUIDS.ENVIRONMENTAL_SENSING], (result) => {
            const device = normalizeCapacitorBleScanResult(result);
            if (device)
                upsertDevice(device);
        });
        return devices.sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
    }
    async scanAndSelect(): Promise<AppBLEDevice | null> {
        const devices = await this.scanDevices();
        if (devices.length === 1) {
            return devices[0];
        }
        if (devices.length > 1) {
            logBLEDebug('[BLE] 複数デバイス検出: scanAndSelectでは自動選択しません', devices);
        }
        return null;
    }
    async connect(deviceId: string, onDisconnect?: () => void): Promise<void> {
        this.connectionState = 'connecting';
        this.disconnectCallback = onDisconnect ?? null;
        try {
            await this.deviceIdentify.waitForIdle();
            await BleClient.connect(deviceId, (disconnectedId) => {
                if (disconnectedId === deviceId) {
                    this.connectionState = 'disconnected';
                    this.connectedDeviceId = null;
                    this.clearLocalNotificationState();
                    this.deviceModeNotificationActive = false;
                    this.disconnectCallback?.();
                }
            });
            this.connectionState = 'connected';
            this.connectedDeviceId = deviceId;
        }
        catch (error) {
            this.connectionState = 'disconnected';
            this.connectedDeviceId = null;
            throw error;
        }
    }
    async identifyDevice(deviceId: string): Promise<void> {
        return this.deviceIdentify.identify(deviceId);
    }
    async disconnect(): Promise<void> {
        if (!this.connectedDeviceId)
            return;
        const deviceId = this.connectedDeviceId;
        this.connectionState = 'disconnecting';
        try {
            await this.stopCardLogDetailNotifications();
            await this.stopDeviceModeNotifications();
            await this.stopSensorNotifications();
            await BleClient.disconnect(deviceId);
        }
        finally {
            this.connectionState = 'disconnected';
            this.connectedDeviceId = null;
            this.deviceModeNotificationActive = false;
            this.cardLogDetailNotificationActive = false;
        }
    }
    getConnectionState(): BLEConnectionState {
        return this.connectionState;
    }
    async readConnectedRssi(): Promise<number | null> {
        if (this.connectionState !== 'connected' || !this.connectedDeviceId) {
            return null;
        }
        const rssi = await BleClient.readRssi(this.connectedDeviceId);
        return Number.isFinite(rssi) ? rssi : null;
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
    private clearLocalNotificationState(): void {
        this.invalidateSensorNotificationSession();
        this.notificationCallback = null;
        this.sensorStatusCallback = null;
        this.clearSensorStatusPolling();
        this.resetSensorDataState();
        this.deviceModeNotificationActive = false;
        this.cardLogDetailNotificationActive = false;
    }
    private emitParsedSensorData(update: () => void, changedField: SensorFieldName): void {
        try {
            recordPerfEvent('CapacitorBLEAdapter.sensorFieldUpdate');
            update();
            const receivedAt = Date.now();
            this.sensorData.timestamp = receivedAt;
            recordPerfEvent('CapacitorBLEAdapter.emitSensorField');
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
    async startSensorNotifications(callback: (event: SensorNotificationEvent) => void, onSensorStatus?: SensorStatusCallback): Promise<NotificationStartResult> {
        if (!this.connectedDeviceId) {
            throw new Error('デバイスが接続されていません');
        }
        const deviceId = this.connectedDeviceId;
        const sensorNotificationSession = ++this.sensorNotificationSession;
        this.notificationCallback = callback;
        this.sensorStatusCallback = onSensorStatus ?? null;
        this.resetParseErrorStats();
        this.resetSensorDataState();
        return startCapacitorBleSensorNotifications({
            deviceId,
            emitParsedSensorData: (update, requiredField) => this.emitParsedSensorData(update, requiredField),
            updateSensorData: (patch) => {
                this.sensorData = { ...this.sensorData, ...patch };
            },
            onSensorStatus: (status) => this.sensorStatusCallback?.(status),
            setSensorStatusPollInterval: (interval) => {
                if (this.sensorNotificationSession !== sensorNotificationSession
                    || this.connectedDeviceId !== deviceId
                    || this.notificationCallback === null) {
                    clearInterval(interval);
                    return;
                }
                this.clearSensorStatusPolling();
                this.sensorStatusPollInterval = interval;
            },
            isSessionActive: () => (this.sensorNotificationSession === sensorNotificationSession
                && this.connectedDeviceId === deviceId
                && this.notificationCallback !== null),
            stopSensorNotifications: () => this.stopSensorNotifications(),
        });
    }
    async stopSensorNotifications(): Promise<void> {
        this.invalidateSensorNotificationSession();
        this.notificationCallback = null;
        this.sensorStatusCallback = null;
        this.clearSensorStatusPolling();
        if (!this.connectedDeviceId)
            return;
        const deviceId = this.connectedDeviceId;
        await stopCapacitorBleSensorNotifications(deviceId);
    }
    async getDeviceInfo(): Promise<DeviceInfo> {
        if (!this.connectedDeviceId) {
            throw new Error('デバイスが接続されていません');
        }
        return readCapacitorBleDeviceInfo(this.connectedDeviceId);
    }
    async getStm32FirmwareVersion(): Promise<Stm32FirmwareVersionStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleStm32FirmwareVersion(this.connectedDeviceId);
    }
    async getSampleMetadataStatus(): Promise<SampleMetadataStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleSampleMetadataStatus(this.connectedDeviceId);
    }
    async getDeviceHealthStatus(): Promise<DeviceHealthStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleDeviceHealthStatus(this.connectedDeviceId);
    }
    async getCapabilitiesStatus(): Promise<BLECapabilitiesStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleCapabilitiesStatus(this.connectedDeviceId);
    }
    async getLedBrightness(): Promise<LEDBrightnessStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleLedBrightness(this.connectedDeviceId);
    }
    async setLedBrightness(brightness: number): Promise<LEDBrightnessStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return writeCapacitorBleLedBrightness(this.connectedDeviceId, brightness);
    }
    async getLedWindReactive(): Promise<LEDWindReactiveStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleLedWindReactive(this.connectedDeviceId);
    }
    async setLedWindReactive(config: LEDWindReactiveConfig): Promise<LEDWindReactiveStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return writeCapacitorBleLedWindReactive(this.connectedDeviceId, config);
    }
    async getOtaControlStatus(): Promise<OtaControlStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleOtaControlStatus(this.connectedDeviceId);
    }
    async writeOtaControl(op: OtaControlOp): Promise<OtaControlStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return writeCapacitorBleOtaControl(this.connectedDeviceId, op);
    }
    async getStm32UpdateControlStatus(): Promise<Stm32UpdateControlStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleStm32UpdateControlStatus(this.connectedDeviceId);
    }
    async writeStm32UpdateControl(op: Stm32UpdateControlOp, binding?: Stm32UpdateControlSessionBinding): Promise<Stm32UpdateControlStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return writeCapacitorBleStm32UpdateControl(this.connectedDeviceId, op, binding);
    }
    async getDeviceResetStatus(): Promise<DeviceResetStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleDeviceResetStatus(this.connectedDeviceId);
    }
    async resetDevice(target: DeviceResetTarget): Promise<DeviceResetStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return writeCapacitorBleDeviceReset(this.connectedDeviceId, target);
    }
    async getCardStatus(): Promise<CardStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleCardStatus(this.connectedDeviceId);
    }
    async getCardLogControlStatus(): Promise<CardLogControlStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleCardLogControlStatus(this.connectedDeviceId);
    }
    async getCardLogDetailStatus(): Promise<CardLogDetailStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleCardLogDetailStatus(this.connectedDeviceId);
    }
    async startCardLogDetailNotifications(callback: (status: CardLogDetailStatus) => void): Promise<boolean> {
        if (!this.connectedDeviceId)
            return false;
        await this.stopCardLogDetailNotifications();
        const deviceId = this.connectedDeviceId;
        try {
            await BleClient.startNotifications(deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.CARD_LOG_DETAIL, (value) => {
                if (!this.cardLogDetailNotificationActive || this.connectedDeviceId !== deviceId)
                    return;
                try {
                    callback(parseCardLogDetailStatus(value));
                }
                catch (error) {
                    console.warn('[BLE] カードログ詳細Notify解析失敗:', error);
                }
            });
            if (this.connectedDeviceId !== deviceId || this.connectionState !== 'connected') {
                await BleClient.stopNotifications(deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.CARD_LOG_DETAIL).catch(() => undefined);
                return false;
            }
            this.cardLogDetailNotificationActive = true;
            return true;
        }
        catch (error) {
            this.cardLogDetailNotificationActive = false;
            console.warn('[BLE] カードログ詳細Notify開始失敗:', error);
            return false;
        }
    }
    async stopCardLogDetailNotifications(): Promise<void> {
        const deviceId = this.connectedDeviceId;
        const wasActive = this.cardLogDetailNotificationActive;
        this.cardLogDetailNotificationActive = false;
        if (!deviceId || !wasActive)
            return;
        try {
            await BleClient.stopNotifications(deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.CARD_LOG_DETAIL);
        }
        catch { /* Optional cleanup may already have completed. */ }
    }
    async getCardLogSettingsStatus(): Promise<CardLogSettingsStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleCardLogSettingsStatus(this.connectedDeviceId);
    }
    async setCardLogging(enabled: boolean): Promise<CardLogControlStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return writeCapacitorBleCardLogging(this.connectedDeviceId, enabled);
    }
    async writeCardLogSettings(request: CardLogSettingsWriteRequest): Promise<CardLogSettingsStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return writeCapacitorBleCardLogSettings(this.connectedDeviceId, request);
    }
    async getDeviceModeStatus(): Promise<DeviceModeStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleDeviceModeStatus(this.connectedDeviceId);
    }
    async startDeviceModeNotifications(callback: (status: DeviceModeStatus) => void): Promise<boolean> {
        if (!this.connectedDeviceId) {
            return false;
        }
        await this.stopDeviceModeNotifications();
        const deviceId = this.connectedDeviceId;
        try {
            await BleClient.startNotifications(deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.DEVICE_MODE, (value) => {
                try {
                    callback(parseDeviceModeStatus(value));
                }
                catch (error) {
                    console.warn('[BLE] ESP32モードNotify解析失敗:', error);
                }
            });
            this.deviceModeNotificationActive = true;
            return true;
        }
        catch (error) {
            this.deviceModeNotificationActive = false;
            console.warn('[BLE] ESP32モードNotify開始失敗:', error);
            return false;
        }
    }
    async stopDeviceModeNotifications(): Promise<void> {
        if (!this.connectedDeviceId || !this.deviceModeNotificationActive) {
            this.deviceModeNotificationActive = false;
            return;
        }
        try {
            await BleClient.stopNotifications(this.connectedDeviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.DEVICE_MODE);
        }
        catch { /* Optional cleanup may already have completed. */ }
        finally {
            this.deviceModeNotificationActive = false;
        }
    }
    async getI2cConfigStatus(): Promise<I2cConfigStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return readCapacitorBleI2cConfigStatus(this.connectedDeviceId);
    }
    async writeI2cConfig(request: I2cConfigWriteRequest): Promise<I2cConfigStatus | null> {
        if (!this.connectedDeviceId) {
            return null;
        }
        return writeCapacitorBleI2cConfig(this.connectedDeviceId, request);
    }
    async getRtcTimezoneStatus(): Promise<RtcTimezoneStatus | null> {
        if (!this.connectedDeviceId)
            return null;
        return readCapacitorBleRtcTimezoneStatus(this.connectedDeviceId);
    }
    async writeRtcTimezone(request: RtcTimezoneWriteRequest): Promise<RtcTimezoneStatus | null> {
        if (!this.connectedDeviceId)
            return null;
        return writeCapacitorBleRtcTimezone(this.connectedDeviceId, request);
    }
    isSupported(): boolean {
        return true;
    }
    async isEnabled(): Promise<boolean> {
        try {
            return await BleClient.isEnabled();
        }
        catch {
            return false;
        }
    }
}
