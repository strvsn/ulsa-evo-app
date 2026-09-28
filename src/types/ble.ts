import type { RtcTimezoneOperation, RtcTimezoneResult } from './rtcTimezone';
export interface SensorData {
    windDirection: number;
    windSpeed: number;
    windSpeedA: number | null;
    windSpeedB: number | null;
    temperature: number;
    soundSpeed: number;
    headingSpeed: number;
    sensorStatus: number;
    statusProtocolVersion?: number;
    statusFlags?: number;
    serviceStatus?: number;
    activeCause?: number;
    ntcReadingStatus?: number;
    nodeId?: number;
    timestamp: number;
}
export interface DeviceInfo {
    firmwareRevision: string;
    softwareRevision: string;
    manufacturerName: string;
    modelNumber: string;
}
export interface Stm32FirmwareVersionStatus {
    protocolVersion: number;
    flags: number;
    i2cClientPresent: boolean;
    detected: boolean;
    readOk: boolean;
    localError: number;
    regVersion: number;
    firmwareVersionRaw: number;
    firmwareVersion: string | null;
    firmwareVersionScheme?: 'calver' | 'semver';
    firmwareRevision?: number | null;
}
export type SampleSource = 'unknown' | 'i2c' | 'uart' | 'simulation';
export interface SampleMetadataStatus {
    protocolVersion: number;
    flags: number;
    valid: boolean;
    sourceI2c: boolean;
    sourceUart: boolean;
    stale: boolean;
    sequence: number;
    esp32TimestampMs: number;
    sourceCode: number;
    source: SampleSource;
    remoteStatus: number;
    remoteError: number;
    localError: number;
}
export interface DeviceHealthStatus {
    protocolVersion: number;
    flags: number;
    bleConnected: boolean;
    i2cDetected: boolean;
    rtcAvailable: boolean;
    cardAvailable: boolean;
    loggingEnabled: boolean;
    configDirty: boolean;
    rebootRequired: boolean;
    errorActive: boolean;
    esp32ModeCode: number;
    esp32LastError: number;
    stm32RegisterVersion: number;
    stm32Status: number;
    stm32LastError: number;
    localI2cError: number;
    cardState: number;
    cardStopReason: number;
    rtcFlags: number;
    rtcPresent: boolean;
    rtcRunning: boolean;
    rtcTimeValid: boolean;
    rtcVoltageLow: boolean;
    rtcClockStopped: boolean;
}
export interface BLECapabilitiesStatus {
    protocolVersion: number;
    flags0: number;
    flags1: number;
    flags2: number;
    flags3: number;
    interfaceRevision: number;
    maxMeasurementNotifyHz: number;
    diagnosticPollHintSeconds: number;
    currentTime: boolean;
    deviceInfo: boolean;
    cardStatus: boolean;
    cardLogControl: boolean;
    deviceMode: boolean;
    stm32FirmwareVersion: boolean;
    i2cConfigControl: boolean;
    sampleMetadata: boolean;
    deviceHealth: boolean;
    cardLogDetail: boolean;
    cardLogSettings: boolean;
    capabilities: boolean;
    windNotifications: boolean;
    rtcReadWrite: boolean;
    i2cConfigWrite: boolean;
    cardLogWrite: boolean;
    deviceIdentify: boolean;
    ledBrightness: boolean;
    ledWindReactive: boolean;
    otaControl: boolean;
    resetControl: boolean;
    stm32UpdateControl: boolean;
    timezoneConfig: boolean;
}
export interface LEDBrightnessStatus {
    brightness: number;
}
export type LEDWindReactiveTheme = 'tide' | 'cividis' | 'viridis' | 'ember' | 'aurora';
export type LEDWindReactiveOp = 'read' | 'setConfig' | 'unknown';
export type LEDWindReactiveResult = 'ok' | 'queued' | 'busy' | 'invalidLength' | 'invalidOp' | 'invalidValue' | 'failed' | 'unknown';
export interface LEDWindReactiveConfig {
    enabled: boolean;
    theme: LEDWindReactiveTheme;
}
export interface LEDWindReactiveStatus extends LEDWindReactiveConfig {
    protocolVersion: number;
    lastOpCode: number;
    lastOp: LEDWindReactiveOp;
    resultCode: number;
    result: LEDWindReactiveResult;
    flags: number;
    active: boolean;
    persisted: boolean;
}
export type { DeviceResetOp, DeviceResetResult, DeviceResetStatus, DeviceResetTarget, OtaControlOp, OtaControlResult, OtaControlStatus, Stm32UpdateControlOp, Stm32UpdateControlResult, Stm32UpdateControlSessionBinding, Stm32UpdateControlStatus, } from './bleMaintenance';
export type { RtcTimezoneOperation, RtcTimezoneResult, RtcTimezoneStatus, RtcTimezoneSyncExpectation, RtcTimezoneWriteRequest, TimezoneCatalog, TimezoneCatalogZone, } from './rtcTimezone';
export type RtcSyncState = 'idle' | 'settingZone' | 'syncing' | 'synced' | 'failed';
export interface RtcTimeStatus {
    deviceTime: Date | null;
    deviceEpochSeconds: number | null;
    systemTimeAtRead: Date | null;
    offsetMs: number | null;
    offsetAssessment?: import('../services/ble/rtcOffsetEvaluation').RtcOffsetAssessment;
    lastReadAt: number | null;
    supported: boolean | null;
    readError: string | null;
    syncState: RtcSyncState;
    lastSyncAt: number | null;
    lastSyncOffsetMs: number | null;
    syncMessage: string | null;
    zoneId: number | null;
    zoneName: string | null;
    totalUtcOffsetMinutes: number | null;
    standardUtcOffsetMinutes: number | null;
    dstOffsetMinutes: number | null;
    tzdbVersion: string | null;
    rtcDetected: boolean;
    rtcReadable: boolean;
    utcValid: boolean;
    zoneConfigured: boolean;
    nvsPersisted: boolean;
    dstActive: boolean;
    operationGeneration: number | null;
    lastOperation: RtcTimezoneOperation;
    lastResult: RtcTimezoneResult | null;
    operationBusy: boolean;
    deviceError: boolean;
}
export type CardType = 'none' | 'unknown' | 'mmc' | 'card' | 'cardhc';
export interface CardStatus {
    cardState: number;
    usagePercent: number;
    freeSpaceMB: number;
    totalSpaceMB: number;
    usedSpaceMB: number;
    cardTypeCode: number;
    cardType: CardType;
}
export type CardLogControlOp = 'read' | 'start' | 'stop';
export type CardLogControlResult = 'ok' | 'queued' | 'busy' | 'invalidLength' | 'invalidOp' | 'unavailable' | 'failed' | 'wrongMode' | 'unknown';
export interface CardLogControlStatus {
    protocolVersion: number;
    lastOpCode: number;
    lastOp: CardLogControlOp | 'unknown';
    resultCode: number;
    result: CardLogControlResult;
    cardState: number;
    flags: number;
    cardAvailable: boolean;
    loggingEnabled: boolean;
    canLog: boolean;
    stopReasonCode: number;
}
export interface CardLogDetailStatus {
    recordingRequested?: boolean;
    inputPaused?: boolean;
    recovering?: boolean;
    quiescent?: boolean;
    syncedLogCount?: number | null;
    droppedLogCount?: number | null;
    uncertainLogCount?: number | null;
    queueDepth?: number | null;
    protocolVersion: number;
    flags: number;
    cardAvailable: boolean;
    loggingEnabled: boolean;
    canLog: boolean;
    fileOpen: boolean;
    rtcTimestamping: boolean;
    slowWrite: boolean;
    errorStop: boolean;
    cardState: number;
    stopReasonCode: number;
    logRateHz: number;
    logCount: number;
    flushCount: number;
    bufferedBytes: number;
    lastWriteDurationMs: number;
    lastLogAgeSeconds: number | null;
}
export type CardLogSettingsOp = 'read' | 'setIntervalMs' | 'restoreDefault' | 'setAutoStart';
export type CardLogSettingsResult = 'ok' | 'queued' | 'busy' | 'invalidLength' | 'invalidOp' | 'unavailable' | 'failed' | 'outOfRange' | 'sourceIntervalUnknown' | 'intervalNotAligned' | 'invalidValue' | 'unknown';
export interface CardLogSettingsStatus {
    protocolVersion: number;
    lastOpCode: number;
    lastOp: CardLogSettingsOp | 'unknown';
    resultCode: number;
    result: CardLogSettingsResult;
    flags: number;
    persisted: boolean;
    stmIntervalKnown: boolean;
    defaultInterval: boolean;
    autoStartEnabled: boolean;
    currentIntervalMs: number;
    minIntervalMs: number;
    maxIntervalMs: number;
    stm32IntervalMs: number | null;
}
export type CardLogSettingsWriteRequest = {
    op: 'read';
} | {
    op: 'restoreDefault';
} | {
    op: 'setIntervalMs';
    intervalMs: number;
} | {
    op: 'setAutoStart';
    autoStartEnabled: boolean;
};
export type DeviceMode = 'uartMeasure' | 'i2cMeasure' | 'command' | 'uartBridge' | 'wifiPortal' | 'bootloader' | 'stm32Update' | 'unknown';
export type DeviceModePhy = '1m' | 'reserved';
export interface DeviceModeStatus {
    protocolVersion: number;
    modeCode: number;
    mode: DeviceMode;
    flags: number;
    phyCode: number;
    phy: DeviceModePhy;
    bleConnected: boolean;
    uartBridgeEnabled: boolean;
    i2cMeasureActive: boolean;
    commandMode: boolean;
    bootloaderMode: boolean;
    wifiPortalActive: boolean;
    stm32UpdateActive: boolean;
}
export type I2cConfigOp = 'read' | 'setNodeId' | 'setAvgCycle' | 'setWindDirInstallMode' | 'setI2cAddress' | 'save' | 'discard' | 'restoreDefaults' | 'clearError';
export type I2cConfigResult = 'ok' | 'queued' | 'busy' | 'invalidLength' | 'invalidOp' | 'unavailable' | 'i2cFailed' | 'unsupported' | 'unknown';
export interface I2cConfigStatus {
    protocolVersion: number;
    lastOpCode: number;
    lastOp: I2cConfigOp | 'unknown';
    resultCode: number;
    result: I2cConfigResult;
    remoteCommandStatus: number;
    remoteLastError: number;
    configFlags: number;
    nodeId: number;
    avgCycle: number;
    windDirInstallMode: 0 | 1;
    i2cAddress: number;
    i2cSlaveEnabled: boolean;
    measurementIntervalMs: number;
    localI2cError: number;
    remoteRegisterVersion: number;
    currentTargetI2cAddress: number;
    rebootRequired: boolean;
    detected: boolean;
    configWriteSupported: boolean;
    operationSeq?: number;
    remoteCommandResultSeq?: number;
}
export interface I2cConfigWriteRequest {
    op: I2cConfigOp;
    value?: number;
}
export interface AdvertisingData {
    nodeId: number;
    validFlag: number;
    windDirection: number;
    windSpeed: number;
    temperature: number;
    soundSpeed: number;
    headingSpeed: number;
}
