import type { SensorData, CardStatus, Stm32FirmwareVersionStatus, SampleMetadataStatus, SampleSource, DeviceHealthStatus, BLECapabilitiesStatus, CardLogDetailStatus } from '../../types/ble';
import { formatStm32VersionCode, STM32_MIN_REVISION, STM32_VERSION_CODE_MARKER, } from '../ota/stm32FirmwareVersion';
import { logBLEDebug } from './bleLogger';
export class BLEParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BLEParseError';
    }
}
const ensureLength = (dataView: DataView, offset: number, byteLength: number, label: string): void => {
    if (offset < 0 || dataView.byteLength < offset + byteLength) {
        throw new BLEParseError(`${label}: ${byteLength} bytes required at offset ${offset}, got ${dataView.byteLength}`);
    }
};
const ensureRange = (value: number, min: number, max: number, label: string): number => {
    if (!Number.isFinite(value) || value < min || value > max) {
        throw new BLEParseError(`${label}: out of range ${value} (${min}..${max})`);
    }
    return value;
};
export const readUint16LE = (dataView: DataView, offset: number): number => {
    ensureLength(dataView, offset, 2, 'uint16');
    return dataView.getUint16(offset, true);
};
export const readInt16LE = (dataView: DataView, offset: number): number => {
    ensureLength(dataView, offset, 2, 'int16');
    return dataView.getInt16(offset, true);
};
export const readUint32LE = (dataView: DataView, offset: number): number => {
    ensureLength(dataView, offset, 4, 'uint32');
    return dataView.getUint32(offset, true);
};
export const parseWindDirection = (value: DataView): number => {
    const raw = readUint16LE(value, 0);
    return ensureRange(raw * 0.01, 0, 360, 'windDirection');
};
export const parseWindSpeed = (value: DataView): number => {
    const raw = readUint16LE(value, 0);
    return ensureRange(raw * 0.01, 0, 100, 'windSpeed');
};
export const parseWindAxisSpeeds = (value: DataView): Pick<SensorData, 'windSpeedA' | 'windSpeedB'> => {
    const windSpeedA = ensureRange(readInt16LE(value, 0) * 0.01, -100, 100, 'windSpeedA');
    const windSpeedB = ensureRange(readInt16LE(value, 2) * 0.01, -100, 100, 'windSpeedB');
    return { windSpeedA, windSpeedB };
};
export const parseTemperature = (value: DataView): number => {
    const raw = readInt16LE(value, 0);
    return ensureRange(raw * 0.01, -50, 100, 'temperature');
};
export const parseSoundSpeed = (value: DataView): number => {
    const raw = readUint16LE(value, 0);
    return ensureRange(raw * 0.01, 250, 450, 'soundSpeed');
};
export const parseHeadingSpeed = (value: DataView): number => {
    const raw = readInt16LE(value, 0);
    return ensureRange(raw * 0.01, -100, 100, 'headingSpeed');
};
export const parseSensorStatus = (value: DataView): Pick<SensorData, 'nodeId' | 'sensorStatus' | 'statusProtocolVersion' | 'statusFlags' | 'serviceStatus' | 'activeCause' | 'ntcReadingStatus'> => {
    ensureLength(value, 0, 7, 'sensorStatus');
    const protocolVersion = value.getUint8(2);
    if (protocolVersion !== 2 && protocolVersion !== 3) {
        throw new BLEParseError(`sensorStatus: unsupported protocol ${protocolVersion}`);
    }
    const dataValid = value.getUint8(1);
    const statusFlags = value.getUint8(3);
    const activeCause = value.getUint8(5);
    const ntcReadingStatus = value.getUint8(6);
    const flagsDataValid = (statusFlags & 0xc0) === 0xc0;
    const validCauseAccepted = activeCause === 0 ||
        (protocolVersion === 3 && activeCause === 2);
    if (dataValid > 1 || activeCause > 12 ||
        (dataValid === 1) !== flagsDataValid ||
        (dataValid === 1 && !validCauseAccepted) ||
        !((ntcReadingStatus >= 0 && ntcReadingStatus <= 3) || ntcReadingStatus === 0xff)) {
        throw new BLEParseError('sensorStatus: invalid field value');
    }
    return {
        nodeId: value.getUint8(0),
        sensorStatus: dataValid,
        statusProtocolVersion: protocolVersion,
        statusFlags,
        serviceStatus: value.getUint8(4),
        activeCause,
        ntcReadingStatus,
    };
};
const Card_CARD_TYPE_MAP = new Map<number, CardStatus['cardType']>([
    [0, 'none'],
    [1, 'unknown'],
    [2, 'mmc'],
    [3, 'card'],
    [4, 'cardhc']
]);
export const parseCardStatus = (value: DataView): CardStatus => {
    ensureLength(value, 0, 6, 'cardStatus');
    const freeSpaceMB = readUint16LE(value, 2);
    const totalSpaceMB = readUint16LE(value, 4);
    const cardTypeCode = value.byteLength >= 7 ? value.getUint8(6) : 1;
    const status = {
        cardState: value.getUint8(0),
        usagePercent: value.getUint8(1),
        freeSpaceMB,
        totalSpaceMB,
        usedSpaceMB: Math.max(0, totalSpaceMB - freeSpaceMB),
        cardTypeCode,
        cardType: Card_CARD_TYPE_MAP.get(cardTypeCode) ?? 'unknown',
    };
    ensureRange(status.cardState, 0, 4, 'cardStatus.cardState');
    ensureRange(status.usagePercent, 0, 100, 'cardStatus.usagePercent');
    ensureRange(status.cardTypeCode, 0, 255, 'cardStatus.cardTypeCode');
    if (status.totalSpaceMB > 0 && status.freeSpaceMB > status.totalSpaceMB) {
        throw new BLEParseError(`cardStatus.freeSpaceMB: ${status.freeSpaceMB} exceeds totalSpaceMB ${status.totalSpaceMB}`);
    }
    return status;
};
const formatFirmwareDate = (raw: number): string | null => {
    if (!Number.isInteger(raw) || raw <= 0) {
        return null;
    }
    const text = raw.toString().padStart(8, '0');
    if (!/^\d{8}$/.test(text)) {
        return null;
    }
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6));
    const day = Number(text.slice(6, 8));
    const date = new Date(year, month - 1, day);
    if (year < 2000 || year > 2099 ||
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day) {
        return text;
    }
    return text;
};
export const parseStm32FirmwareVersionStatus = (value: DataView): Stm32FirmwareVersionStatus => {
    ensureLength(value, 0, 1, 'stm32FirmwareVersion');
    const protocolVersion = value.getUint8(0);
    if (protocolVersion !== 2) {
        throw new BLEParseError(`stm32FirmwareVersion: protocol 2 is required (received ${protocolVersion})`);
    }
    ensureLength(value, 0, 12, 'stm32FirmwareVersionV2');
    const flags = value.getUint8(1);
    const readOk = (flags & 0x04) !== 0;
    const regVersion = value.getUint8(3);
    const firmwareVersionRaw = value.getUint32(4, true);
    const isSemantic = (firmwareVersionRaw & 0xff000000) === STM32_VERSION_CODE_MARKER;
    const firmwareRevision = value.getUint32(8, true);
    if (readOk) {
        if (!isSemantic) {
            throw new BLEParseError('stm32FirmwareVersionV2: versionCode marker is invalid');
        }
        if (regVersion < 0x0b) {
            throw new BLEParseError('stm32FirmwareVersionV2: REG_VERSION 0x0B is required');
        }
        if (firmwareRevision === null || firmwareRevision < STM32_MIN_REVISION) {
            throw new BLEParseError('stm32FirmwareVersionV2: FWREV must be positive');
        }
    }
    return {
        protocolVersion,
        flags,
        i2cClientPresent: (flags & 0x01) !== 0,
        detected: (flags & 0x02) !== 0,
        readOk,
        localError: value.getUint8(2),
        regVersion,
        firmwareVersionRaw,
        firmwareVersion: isSemantic
            ? formatStm32VersionCode(firmwareVersionRaw)
            : formatFirmwareDate(firmwareVersionRaw),
        firmwareVersionScheme: isSemantic ? 'semver' : 'calver',
        firmwareRevision,
    };
};
const SAMPLE_SOURCE_MAP = new Map<number, SampleSource>([
    [0, 'unknown'],
    [1, 'i2c'],
    [2, 'uart'],
    [3, 'simulation']
]);
export const parseSampleMetadataStatus = (value: DataView): SampleMetadataStatus => {
    ensureLength(value, 0, 12, 'sampleMetadata');
    const flags = value.getUint8(1);
    const sourceCode = value.getUint8(8);
    return {
        protocolVersion: value.getUint8(0),
        flags,
        valid: (flags & 0x01) !== 0,
        sourceI2c: (flags & 0x02) !== 0,
        sourceUart: (flags & 0x04) !== 0,
        stale: (flags & 0x08) !== 0,
        sequence: value.getUint16(2, true),
        esp32TimestampMs: value.getUint32(4, true),
        sourceCode,
        source: SAMPLE_SOURCE_MAP.get(sourceCode) ?? 'unknown',
        remoteStatus: value.getUint8(9),
        remoteError: value.getUint8(10),
        localError: value.getUint8(11),
    };
};
export const parseDeviceHealthStatus = (value: DataView): DeviceHealthStatus => {
    ensureLength(value, 0, 12, 'deviceHealth');
    const flags = value.getUint8(1);
    const rtcFlags = value.getUint8(10);
    return {
        protocolVersion: value.getUint8(0),
        flags,
        bleConnected: (flags & 0x01) !== 0,
        i2cDetected: (flags & 0x02) !== 0,
        rtcAvailable: (flags & 0x04) !== 0,
        cardAvailable: (flags & 0x08) !== 0,
        loggingEnabled: (flags & 0x10) !== 0,
        configDirty: (flags & 0x20) !== 0,
        rebootRequired: (flags & 0x40) !== 0,
        errorActive: (flags & 0x80) !== 0,
        esp32ModeCode: value.getUint8(2),
        esp32LastError: value.getUint8(3),
        stm32RegisterVersion: value.getUint8(4),
        stm32Status: value.getUint8(5),
        stm32LastError: value.getUint8(6),
        localI2cError: value.getUint8(7),
        cardState: value.getUint8(8),
        cardStopReason: value.getUint8(9),
        rtcFlags,
        rtcPresent: (rtcFlags & 0x01) !== 0,
        rtcRunning: (rtcFlags & 0x02) !== 0,
        rtcTimeValid: (rtcFlags & 0x04) !== 0,
        rtcVoltageLow: (rtcFlags & 0x08) !== 0,
        rtcClockStopped: (rtcFlags & 0x10) !== 0,
    };
};
export const parseBLECapabilitiesStatus = (value: DataView): BLECapabilitiesStatus => {
    ensureLength(value, 0, 8, 'bleCapabilities');
    const flags0 = value.getUint8(1);
    const flags1 = value.getUint8(2);
    const flags2 = value.getUint8(6);
    const flags3 = value.getUint8(7);
    return {
        protocolVersion: value.getUint8(0),
        flags0,
        flags1,
        flags2,
        flags3,
        interfaceRevision: value.getUint8(3),
        maxMeasurementNotifyHz: value.getUint8(4),
        diagnosticPollHintSeconds: value.getUint8(5),
        currentTime: (flags0 & 0x01) !== 0,
        deviceInfo: (flags0 & 0x02) !== 0,
        cardStatus: (flags0 & 0x04) !== 0,
        cardLogControl: (flags0 & 0x08) !== 0,
        deviceMode: (flags0 & 0x10) !== 0,
        stm32FirmwareVersion: (flags0 & 0x20) !== 0,
        i2cConfigControl: (flags0 & 0x40) !== 0,
        sampleMetadata: (flags0 & 0x80) !== 0,
        deviceHealth: (flags1 & 0x01) !== 0,
        cardLogDetail: (flags1 & 0x02) !== 0,
        cardLogSettings: (flags1 & 0x80) !== 0,
        capabilities: (flags1 & 0x04) !== 0,
        windNotifications: (flags1 & 0x08) !== 0,
        rtcReadWrite: (flags1 & 0x10) !== 0,
        i2cConfigWrite: (flags1 & 0x20) !== 0,
        cardLogWrite: (flags1 & 0x40) !== 0,
        deviceIdentify: (flags2 & 0x01) !== 0,
        ledBrightness: (flags2 & 0x02) !== 0,
        ledWindReactive: (flags2 & 0x20) !== 0,
        otaControl: (flags2 & 0x04) !== 0,
        resetControl: (flags2 & 0x08) !== 0,
        stm32UpdateControl: (flags2 & 0x10) !== 0,
        timezoneConfig: (flags3 & 0x01) !== 0,
    };
};
export const parseCardLogDetailStatus = (value: DataView): CardLogDetailStatus => {
    ensureLength(value, 0, 20, 'cardLogDetail');
    const flags = value.getUint8(1);
    const lastLogAgeRaw = readUint16LE(value, 18);
    const extended = value.getUint8(0) === 2;
    const workerFlags = extended ? value.getUint8(5) : 0;
    const hasCounters = extended && value.byteLength >= 36;
    return {
        ...(extended ? {
            recordingRequested: (workerFlags & 1) !== 0,
            inputPaused: (workerFlags & 2) !== 0,
            recovering: (workerFlags & 4) !== 0,
            quiescent: extended ? (workerFlags & 8) !== 0 : undefined,
            syncedLogCount: hasCounters ? readUint32LE(value, 20) : null,
            droppedLogCount: hasCounters ? readUint32LE(value, 24) : null,
            uncertainLogCount: hasCounters ? readUint32LE(value, 28) : null,
            queueDepth: hasCounters ? readUint16LE(value, 32) : null,
        } : {}),
        protocolVersion: value.getUint8(0),
        flags,
        cardAvailable: (flags & 0x01) !== 0,
        loggingEnabled: (flags & 0x02) !== 0,
        canLog: (flags & 0x04) !== 0,
        fileOpen: (flags & 0x08) !== 0,
        rtcTimestamping: (flags & 0x10) !== 0,
        slowWrite: (flags & 0x20) !== 0,
        errorStop: (flags & 0x40) !== 0,
        cardState: value.getUint8(2),
        stopReasonCode: value.getUint8(3),
        logRateHz: value.getUint8(4),
        logCount: readUint32LE(value, 6),
        flushCount: readUint32LE(value, 10),
        bufferedBytes: readUint16LE(value, 14),
        lastWriteDurationMs: readUint16LE(value, 16),
        lastLogAgeSeconds: lastLogAgeRaw === 0xffff ? null : lastLogAgeRaw,
    };
};
export const parseString = (value: DataView): string => {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
};
export const parseCurrentTimeData = (value: DataView): Date => {
    ensureLength(value, 0, 10, 'Current Time');
    const year = value.getUint16(0, true);
    const month = value.getUint8(2);
    const day = value.getUint8(3);
    const hour = value.getUint8(4);
    const minute = value.getUint8(5);
    const second = value.getUint8(6);
    if (year < 2000 || year > 2099 ||
        month < 1 || month > 12 ||
        day < 1 || day > 31 ||
        hour > 23 ||
        minute > 59 ||
        second > 59) {
        throw new BLEParseError('Current Time value is out of supported range');
    }
    const date = new Date(year, month - 1, day, hour, minute, second, 0);
    if (date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date.getHours() !== hour ||
        date.getMinutes() !== minute ||
        date.getSeconds() !== second) {
        throw new BLEParseError('Current Time value is not a valid calendar date');
    }
    return date;
};
export const parseNodeIdFromServiceData = (data: DataView): number => {
    ensureLength(data, 0, 1, 'nodeId serviceData');
    const bytes = Array.from({ length: data.byteLength }, (_, i) => {
        void _;
        return data.getUint8(i);
    });
    logBLEDebug(`[BLE] parseNodeIdFromServiceData byteLength=${data.byteLength} bytes=`, bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    if (data.byteLength >= 3 && data.getUint8(0) === 0x1a && data.getUint8(1) === 0x18) {
        const nodeId = data.getUint8(2);
        logBLEDebug(`[BLE] UUIDプレフィックスありと判定 → byte[2] = ${nodeId}`);
        return nodeId;
    }
    const nodeId = data.getUint8(0);
    logBLEDebug(`[BLE] UUID除去済みと判定 → byte[0] = ${nodeId}`);
    return nodeId;
};
export const parseNodeIdFromName = (name: string | null | undefined): number | undefined => {
    if (!name)
        return undefined;
    const trimmed = name.replace(/\0/g, '').trim();
    logBLEDebug(`[BLE] parseNodeIdFromName input='${name}' trimmed='${trimmed}'`);
    const hashMatch = trimmed.match(/#(\d+)\s*$/);
    if (hashMatch) {
        const id = parseInt(hashMatch[1], 10);
        logBLEDebug(`[BLE] NodeID from '#N' pattern: ${id}`);
        return id;
    }
    const numMatch = trimmed.match(/(\d+)\s*$/);
    if (numMatch) {
        const id = parseInt(numMatch[1], 10);
        logBLEDebug(`[BLE] NodeID from numeric suffix: ${id}`);
        return id;
    }
    logBLEDebug('[BLE] NodeID 取得不可 (パターン不一致)');
    return undefined;
};
