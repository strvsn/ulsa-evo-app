import type { BLEParseErrorStats } from '../../services/ble';
import type { BLECapabilitiesStatus, DeviceHealthStatus, DeviceModeStatus, DeviceResetStatus, I2cConfigStatus, LEDBrightnessStatus, SampleMetadataStatus, CardLogControlStatus, CardLogDetailStatus, CardLogSettingsStatus, CardStatus, Stm32FirmwareVersionStatus, } from '../../types/ble';
export const areParseErrorStatsEqual = (a: BLEParseErrorStats, b: BLEParseErrorStats): boolean => a.count === b.count && a.lastError === b.lastError;
export const areDeviceModeStatusesEqual = (a: DeviceModeStatus, b: DeviceModeStatus): boolean => a.protocolVersion === b.protocolVersion &&
    a.modeCode === b.modeCode &&
    a.mode === b.mode &&
    a.flags === b.flags &&
    a.phyCode === b.phyCode &&
    a.phy === b.phy &&
    a.bleConnected === b.bleConnected &&
    a.uartBridgeEnabled === b.uartBridgeEnabled &&
    a.i2cMeasureActive === b.i2cMeasureActive &&
    a.commandMode === b.commandMode &&
    a.bootloaderMode === b.bootloaderMode &&
    a.wifiPortalActive === b.wifiPortalActive &&
    a.stm32UpdateActive === b.stm32UpdateActive;
export const areCardStatusesEqual = (a: CardStatus, b: CardStatus): boolean => a.cardState === b.cardState &&
    a.usagePercent === b.usagePercent &&
    a.freeSpaceMB === b.freeSpaceMB &&
    a.totalSpaceMB === b.totalSpaceMB &&
    a.usedSpaceMB === b.usedSpaceMB &&
    a.cardTypeCode === b.cardTypeCode &&
    a.cardType === b.cardType;
export const areCardLogControlStatusesEqual = (a: CardLogControlStatus, b: CardLogControlStatus): boolean => a.protocolVersion === b.protocolVersion &&
    a.lastOpCode === b.lastOpCode &&
    a.lastOp === b.lastOp &&
    a.resultCode === b.resultCode &&
    a.result === b.result &&
    a.cardState === b.cardState &&
    a.flags === b.flags &&
    a.cardAvailable === b.cardAvailable &&
    a.loggingEnabled === b.loggingEnabled &&
    a.canLog === b.canLog &&
    a.stopReasonCode === b.stopReasonCode;
export const areStm32FirmwareVersionStatusesEqual = (a: Stm32FirmwareVersionStatus, b: Stm32FirmwareVersionStatus): boolean => a.protocolVersion === b.protocolVersion &&
    a.flags === b.flags &&
    a.i2cClientPresent === b.i2cClientPresent &&
    a.detected === b.detected &&
    a.readOk === b.readOk &&
    a.localError === b.localError &&
    a.regVersion === b.regVersion &&
    a.firmwareVersionRaw === b.firmwareVersionRaw &&
    a.firmwareVersion === b.firmwareVersion;
export const areSampleMetadataStatusesEqual = (a: SampleMetadataStatus, b: SampleMetadataStatus): boolean => a.protocolVersion === b.protocolVersion &&
    a.flags === b.flags &&
    a.valid === b.valid &&
    a.sourceI2c === b.sourceI2c &&
    a.sourceUart === b.sourceUart &&
    a.stale === b.stale &&
    a.sequence === b.sequence &&
    a.esp32TimestampMs === b.esp32TimestampMs &&
    a.sourceCode === b.sourceCode &&
    a.source === b.source &&
    a.remoteStatus === b.remoteStatus &&
    a.remoteError === b.remoteError &&
    a.localError === b.localError;
export const areDeviceHealthStatusesEqual = (a: DeviceHealthStatus, b: DeviceHealthStatus): boolean => a.protocolVersion === b.protocolVersion &&
    a.flags === b.flags &&
    a.bleConnected === b.bleConnected &&
    a.i2cDetected === b.i2cDetected &&
    a.rtcAvailable === b.rtcAvailable &&
    a.cardAvailable === b.cardAvailable &&
    a.loggingEnabled === b.loggingEnabled &&
    a.configDirty === b.configDirty &&
    a.rebootRequired === b.rebootRequired &&
    a.errorActive === b.errorActive &&
    a.esp32ModeCode === b.esp32ModeCode &&
    a.esp32LastError === b.esp32LastError &&
    a.stm32RegisterVersion === b.stm32RegisterVersion &&
    a.stm32Status === b.stm32Status &&
    a.stm32LastError === b.stm32LastError &&
    a.localI2cError === b.localI2cError &&
    a.cardState === b.cardState &&
    a.cardStopReason === b.cardStopReason &&
    a.rtcFlags === b.rtcFlags &&
    a.rtcPresent === b.rtcPresent &&
    a.rtcRunning === b.rtcRunning &&
    a.rtcTimeValid === b.rtcTimeValid &&
    a.rtcVoltageLow === b.rtcVoltageLow &&
    a.rtcClockStopped === b.rtcClockStopped;
export const areCapabilitiesStatusesEqual = (a: BLECapabilitiesStatus, b: BLECapabilitiesStatus): boolean => a.protocolVersion === b.protocolVersion &&
    a.flags0 === b.flags0 &&
    a.flags1 === b.flags1 &&
    a.flags2 === b.flags2 &&
    a.flags3 === b.flags3 &&
    a.interfaceRevision === b.interfaceRevision &&
    a.maxMeasurementNotifyHz === b.maxMeasurementNotifyHz &&
    a.diagnosticPollHintSeconds === b.diagnosticPollHintSeconds &&
    a.currentTime === b.currentTime &&
    a.deviceInfo === b.deviceInfo &&
    a.cardStatus === b.cardStatus &&
    a.cardLogControl === b.cardLogControl &&
    a.deviceMode === b.deviceMode &&
    a.stm32FirmwareVersion === b.stm32FirmwareVersion &&
    a.i2cConfigControl === b.i2cConfigControl &&
    a.sampleMetadata === b.sampleMetadata &&
    a.deviceHealth === b.deviceHealth &&
    a.cardLogDetail === b.cardLogDetail &&
    a.cardLogSettings === b.cardLogSettings &&
    a.capabilities === b.capabilities &&
    a.windNotifications === b.windNotifications &&
    a.rtcReadWrite === b.rtcReadWrite &&
    a.i2cConfigWrite === b.i2cConfigWrite &&
    a.cardLogWrite === b.cardLogWrite &&
    a.deviceIdentify === b.deviceIdentify &&
    a.ledBrightness === b.ledBrightness &&
    a.otaControl === b.otaControl &&
    a.resetControl === b.resetControl &&
    a.stm32UpdateControl === b.stm32UpdateControl &&
    a.timezoneConfig === b.timezoneConfig;
export const areLEDBrightnessStatusesEqual = (a: LEDBrightnessStatus, b: LEDBrightnessStatus): boolean => a.brightness === b.brightness;
export const areDeviceResetStatusesEqual = (a: DeviceResetStatus, b: DeviceResetStatus): boolean => a.protocolVersion === b.protocolVersion &&
    a.lastOpCode === b.lastOpCode &&
    a.lastOp === b.lastOp &&
    a.resultCode === b.resultCode &&
    a.result === b.result &&
    a.flags === b.flags &&
    a.esp32ResetPending === b.esp32ResetPending &&
    a.stm32ResetPending === b.stm32ResetPending &&
    a.esp32Rebooting === b.esp32Rebooting &&
    a.stm32Resetting === b.stm32Resetting &&
    a.targetCode === b.targetCode &&
    a.target === b.target;
export const areCardLogDetailStatusesEqual = (a: CardLogDetailStatus, b: CardLogDetailStatus): boolean => a.recordingRequested === b.recordingRequested &&
    a.inputPaused === b.inputPaused &&
    a.recovering === b.recovering &&
    a.quiescent === b.quiescent &&
    a.syncedLogCount === b.syncedLogCount &&
    a.droppedLogCount === b.droppedLogCount &&
    a.uncertainLogCount === b.uncertainLogCount &&
    a.queueDepth === b.queueDepth &&
    a.protocolVersion === b.protocolVersion &&
    a.flags === b.flags &&
    a.cardAvailable === b.cardAvailable &&
    a.loggingEnabled === b.loggingEnabled &&
    a.canLog === b.canLog &&
    a.fileOpen === b.fileOpen &&
    a.rtcTimestamping === b.rtcTimestamping &&
    a.slowWrite === b.slowWrite &&
    a.errorStop === b.errorStop &&
    a.cardState === b.cardState &&
    a.stopReasonCode === b.stopReasonCode &&
    a.logRateHz === b.logRateHz &&
    a.logCount === b.logCount &&
    a.flushCount === b.flushCount &&
    a.bufferedBytes === b.bufferedBytes &&
    a.lastWriteDurationMs === b.lastWriteDurationMs &&
    a.lastLogAgeSeconds === b.lastLogAgeSeconds;
export const areCardLogSettingsStatusesEqual = (a: CardLogSettingsStatus, b: CardLogSettingsStatus): boolean => a.protocolVersion === b.protocolVersion &&
    a.lastOpCode === b.lastOpCode &&
    a.lastOp === b.lastOp &&
    a.resultCode === b.resultCode &&
    a.result === b.result &&
    a.flags === b.flags &&
    a.persisted === b.persisted &&
    a.stmIntervalKnown === b.stmIntervalKnown &&
    a.defaultInterval === b.defaultInterval &&
    a.autoStartEnabled === b.autoStartEnabled &&
    a.currentIntervalMs === b.currentIntervalMs &&
    a.minIntervalMs === b.minIntervalMs &&
    a.maxIntervalMs === b.maxIntervalMs &&
    a.stm32IntervalMs === b.stm32IntervalMs;
export const areI2cConfigStatusesEqual = (a: I2cConfigStatus, b: I2cConfigStatus): boolean => a.protocolVersion === b.protocolVersion &&
    a.lastOpCode === b.lastOpCode &&
    a.lastOp === b.lastOp &&
    a.resultCode === b.resultCode &&
    a.result === b.result &&
    a.remoteCommandStatus === b.remoteCommandStatus &&
    a.remoteLastError === b.remoteLastError &&
    a.configFlags === b.configFlags &&
    a.nodeId === b.nodeId &&
    a.avgCycle === b.avgCycle &&
    a.windDirInstallMode === b.windDirInstallMode &&
    a.i2cAddress === b.i2cAddress &&
    a.i2cSlaveEnabled === b.i2cSlaveEnabled &&
    a.measurementIntervalMs === b.measurementIntervalMs &&
    a.localI2cError === b.localI2cError &&
    a.remoteRegisterVersion === b.remoteRegisterVersion &&
    a.currentTargetI2cAddress === b.currentTargetI2cAddress &&
    a.rebootRequired === b.rebootRequired &&
    a.detected === b.detected &&
    a.configWriteSupported === b.configWriteSupported;
