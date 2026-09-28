import type { SensorData, DeviceInfo, CardStatus, CardLogControlStatus, CardLogDetailStatus, CardLogSettingsStatus, CardLogSettingsWriteRequest, DeviceModeStatus, DeviceResetStatus, DeviceResetTarget, I2cConfigStatus, I2cConfigWriteRequest, Stm32FirmwareVersionStatus, SampleMetadataStatus, DeviceHealthStatus, BLECapabilitiesStatus, LEDBrightnessStatus, LEDWindReactiveConfig, LEDWindReactiveStatus, OtaControlOp, OtaControlStatus, Stm32UpdateControlOp, Stm32UpdateControlSessionBinding, Stm32UpdateControlStatus, RtcTimezoneStatus, RtcTimezoneWriteRequest } from '../../types/ble';
export type BLEConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';
export interface BLEPlatformInfo {
    platform: 'web' | 'ios' | 'android' | 'unknown';
    adapterType: 'WebBluetooth' | 'Capacitor' | 'none';
    isSupported: boolean;
    browserName?: string | null;
    secureContext?: boolean;
    webBluetoothAvailable?: boolean;
    message?: string;
}
export interface BLEDevice {
    deviceId: string;
    name: string | null;
    rssi?: number;
    nodeId?: number;
}
export interface NotificationStartResult {
    required: {
        windDirection: boolean;
        windSpeed: boolean;
        temperature: boolean;
    };
    optional: {
        soundSpeed: boolean;
        headingSpeed: boolean;
        windAxisSpeeds: boolean;
        sensorStatus: boolean;
    };
    startedCount: number;
}
export type StandardSensorField = 'windDirection' | 'windSpeed' | 'temperature';
export type SensorFieldName = StandardSensorField | 'soundSpeed' | 'headingSpeed' | 'windAxisSpeeds' | 'sensorStatus';
export interface SensorNotificationEvent {
    changedField: SensorFieldName;
    latestSnapshot: SensorData;
    receivedAt: number;
}
export interface BLEParseErrorStats {
    count: number;
    lastError: string | null;
}
export type SensorStatusCallback = (status: Pick<SensorData, 'nodeId' | 'sensorStatus' | 'statusProtocolVersion' | 'statusFlags' | 'serviceStatus' | 'activeCause' | 'ntcReadingStatus'>) => void;
export interface IBLEAdapter {
    initialize(): Promise<void>;
    scanAndSelect(): Promise<BLEDevice | null>;
    scanDevices?(onDeviceFound?: (device: BLEDevice) => void): Promise<BLEDevice[]>;
    stopScan?(): Promise<void>;
    connect(deviceId: string, onDisconnect?: () => void): Promise<void>;
    identifyDevice(deviceId: string): Promise<void>;
    disconnect(): Promise<void>;
    getConnectionState(): BLEConnectionState;
    readConnectedRssi?(): Promise<number | null>;
    startSensorNotifications(callback: (event: SensorNotificationEvent) => void, onSensorStatus?: SensorStatusCallback): Promise<NotificationStartResult>;
    stopSensorNotifications(): Promise<void>;
    getParseErrorStats(): BLEParseErrorStats;
    getDeviceInfo(): Promise<DeviceInfo>;
    getStm32FirmwareVersion(): Promise<Stm32FirmwareVersionStatus | null>;
    getSampleMetadataStatus(): Promise<SampleMetadataStatus | null>;
    getDeviceHealthStatus(): Promise<DeviceHealthStatus | null>;
    getCapabilitiesStatus(): Promise<BLECapabilitiesStatus | null>;
    getLedBrightness(): Promise<LEDBrightnessStatus | null>;
    setLedBrightness(brightness: number): Promise<LEDBrightnessStatus | null>;
    getLedWindReactive(): Promise<LEDWindReactiveStatus | null>;
    setLedWindReactive(config: LEDWindReactiveConfig): Promise<LEDWindReactiveStatus | null>;
    getOtaControlStatus(): Promise<OtaControlStatus | null>;
    writeOtaControl(op: OtaControlOp): Promise<OtaControlStatus | null>;
    getStm32UpdateControlStatus(): Promise<Stm32UpdateControlStatus | null>;
    writeStm32UpdateControl(op: Stm32UpdateControlOp, binding?: Stm32UpdateControlSessionBinding): Promise<Stm32UpdateControlStatus | null>;
    getDeviceResetStatus(): Promise<DeviceResetStatus | null>;
    resetDevice(target: DeviceResetTarget): Promise<DeviceResetStatus | null>;
    getCardStatus(): Promise<CardStatus | null>;
    getCardLogControlStatus(): Promise<CardLogControlStatus | null>;
    getCardLogDetailStatus(): Promise<CardLogDetailStatus | null>;
    startCardLogDetailNotifications?(callback: (status: CardLogDetailStatus) => void): Promise<boolean>;
    stopCardLogDetailNotifications?(): Promise<void>;
    getCardLogSettingsStatus(): Promise<CardLogSettingsStatus | null>;
    setCardLogging(enabled: boolean): Promise<CardLogControlStatus | null>;
    writeCardLogSettings(request: CardLogSettingsWriteRequest): Promise<CardLogSettingsStatus | null>;
    getDeviceModeStatus(): Promise<DeviceModeStatus | null>;
    startDeviceModeNotifications(callback: (status: DeviceModeStatus) => void): Promise<boolean>;
    stopDeviceModeNotifications(): Promise<void>;
    getI2cConfigStatus(): Promise<I2cConfigStatus | null>;
    writeI2cConfig(request: I2cConfigWriteRequest): Promise<I2cConfigStatus | null>;
    getRtcTimezoneStatus(): Promise<RtcTimezoneStatus | null>;
    writeRtcTimezone(request: RtcTimezoneWriteRequest): Promise<RtcTimezoneStatus | null>;
    isSupported(): boolean;
    isEnabled(): Promise<boolean>;
}
