import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le';
import type { BLECapabilitiesStatus, DeviceHealthStatus, DeviceInfo, DeviceModeStatus, DeviceResetStatus, DeviceResetTarget, I2cConfigStatus, I2cConfigWriteRequest, LEDBrightnessStatus, LEDWindReactiveConfig, LEDWindReactiveStatus, OtaControlOp, OtaControlStatus, CardLogControlStatus, CardLogDetailStatus, CardLogSettingsStatus, CardLogSettingsWriteRequest, CardStatus, SampleMetadataStatus, Stm32UpdateControlOp, Stm32UpdateControlSessionBinding, Stm32UpdateControlStatus, Stm32FirmwareVersionStatus, } from '../../types/ble';
import { CHARACTERISTIC_UUIDS, SERVICE_UUIDS } from './bleConstants';
import { parseBLECapabilitiesStatus, parseDeviceHealthStatus, parseSampleMetadataStatus, parseCardLogDetailStatus, parseCardStatus, parseStm32FirmwareVersionStatus, parseString, } from './bleDataParser';
import { createEmptyDeviceInfo } from './sensorDataDefaults';
import { parseDeviceModeStatus } from './deviceModeStatus';
import { buildI2cConfigRequest, isI2cConfigOperationComplete, parseI2cConfigStatus } from './i2cConfigControl';
import { buildDeviceResetRequest, createOptimisticDeviceResetStatus, deviceResetOpForTarget, parseDeviceResetStatus, } from './deviceResetControl';
import { buildLEDBrightnessPayload, parseLEDBrightnessStatus } from './ledBrightness';
import { buildLEDWindReactiveConfigPayload, isLEDWindReactiveOperationComplete, parseLEDWindReactiveStatus, } from './ledWindReactive';
import { buildOtaControlRequest, parseOtaControlStatus } from './otaControl';
import { buildStm32UpdateControlRequest, parseStm32UpdateControlStatus, } from './stm32UpdateControl';
import { buildCardLogControlRequest, parseCardLogControlStatus } from './cardLogControl';
import { buildCardLogSettingsRequest, parseCardLogSettingsStatus } from './cardLogSettings';
const I2C_CONFIG_POLL_INTERVAL_MS = 200;
const I2C_CONFIG_POLL_TIMEOUT_MS = 6000;
const CARD_LOG_CONTROL_POLL_INTERVAL_MS = 200;
const CARD_LOG_CONTROL_POLL_TIMEOUT_MS = 4000;
const CARD_LOG_SETTINGS_POLL_INTERVAL_MS = 200;
const CARD_LOG_SETTINGS_POLL_TIMEOUT_MS = 4000;
const LED_BRIGHTNESS_POLL_INTERVAL_MS = 80;
const LED_BRIGHTNESS_POLL_TIMEOUT_MS = 1500;
const LED_WIND_REACTIVE_POLL_INTERVAL_MS = 80;
const LED_WIND_REACTIVE_POLL_TIMEOUT_MS = 1500;
const OTA_CONTROL_POLL_INTERVAL_MS = 150;
const OTA_CONTROL_POLL_TIMEOUT_MS = 5000;
const RESET_CONTROL_POLL_INTERVAL_MS = 120;
const RESET_CONTROL_POLL_TIMEOUT_MS = 3500;
type ReadStatusOptions<T> = {
    deviceId: string;
    serviceUuid: string;
    characteristicUuid: string;
    parse: (value: DataView) => T;
    warning?: string;
};
const payloadToDataView = (payload: Uint8Array): DataView => numbersToDataView(Array.from(payload));
const readCapacitorStatus = async <T>({ deviceId, serviceUuid, characteristicUuid, parse, warning, }: ReadStatusOptions<T>): Promise<T | null> => {
    try {
        return parse(await BleClient.read(deviceId, serviceUuid, characteristicUuid));
    }
    catch (error) {
        if (warning) {
            console.warn(warning, error);
        }
        return null;
    }
};
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
export const readCapacitorBleDeviceInfo = async (deviceId: string): Promise<DeviceInfo> => {
    const info = createEmptyDeviceInfo();
    const fields = [
        {
            key: 'firmwareRevision',
            characteristicUuid: CHARACTERISTIC_UUIDS.FIRMWARE_REVISION,
        },
        {
            key: 'softwareRevision',
            characteristicUuid: CHARACTERISTIC_UUIDS.SOFTWARE_REVISION,
        },
        {
            key: 'manufacturerName',
            characteristicUuid: CHARACTERISTIC_UUIDS.MANUFACTURER_NAME,
        },
        {
            key: 'modelNumber',
            characteristicUuid: CHARACTERISTIC_UUIDS.MODEL_NUMBER,
        }
    ] as const;
    for (const field of fields) {
        try {
            info[field.key] = parseString(await BleClient.read(deviceId, SERVICE_UUIDS.DEVICE_INFORMATION, field.characteristicUuid));
        }
        catch { /* Optional cleanup may already have completed. */ }
    }
    return info;
};
export const readCapacitorBleStm32FirmwareVersion = (deviceId: string): Promise<Stm32FirmwareVersionStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.STM32_FIRMWARE_VERSION,
    parse: parseStm32FirmwareVersionStatus,
});
export const readCapacitorBleSampleMetadataStatus = (deviceId: string): Promise<SampleMetadataStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.SAMPLE_METADATA,
    parse: parseSampleMetadataStatus,
    warning: '[BLE] Sample Metadata取得失敗:',
});
export const readCapacitorBleDeviceHealthStatus = (deviceId: string): Promise<DeviceHealthStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.DEVICE_HEALTH,
    parse: parseDeviceHealthStatus,
    warning: '[BLE] Device Health取得失敗:',
});
export const readCapacitorBleCapabilitiesStatus = (deviceId: string): Promise<BLECapabilitiesStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.CAPABILITIES,
    parse: parseBLECapabilitiesStatus,
    warning: '[BLE] Capabilities取得失敗:',
});
export const readCapacitorBleLedBrightness = (deviceId: string): Promise<LEDBrightnessStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.LED_BRIGHTNESS,
    parse: parseLEDBrightnessStatus,
    warning: '[BLE] LED輝度取得失敗:',
});
export const writeCapacitorBleLedBrightness = async (deviceId: string, brightness: number): Promise<LEDBrightnessStatus | null> => {
    const payload = buildLEDBrightnessPayload(brightness);
    const requestedBrightness = payload[0];
    try {
        await BleClient.write(deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.LED_BRIGHTNESS, payloadToDataView(payload));
    }
    catch (error) {
        console.warn('[BLE] LED輝度write不可:', error);
        return null;
    }
    const deadline = Date.now() + LED_BRIGHTNESS_POLL_TIMEOUT_MS;
    let latest: LEDBrightnessStatus | null = null;
    do {
        await wait(LED_BRIGHTNESS_POLL_INTERVAL_MS);
        latest = await readCapacitorBleLedBrightness(deviceId);
        if (latest && latest.brightness === requestedBrightness) {
            return latest;
        }
    } while (Date.now() < deadline);
    return latest;
};
export const readCapacitorBleLedWindReactive = (deviceId: string): Promise<LEDWindReactiveStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.LED_WIND_REACTIVE,
    parse: parseLEDWindReactiveStatus,
    warning: '[BLE] LED風速連動取得失敗:',
});
export const writeCapacitorBleLedWindReactive = async (deviceId: string, config: LEDWindReactiveConfig): Promise<LEDWindReactiveStatus | null> => {
    try {
        await BleClient.write(deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.LED_WIND_REACTIVE, payloadToDataView(buildLEDWindReactiveConfigPayload(config)));
    }
    catch (error) {
        console.warn('[BLE] LED風速連動write不可:', error);
        return null;
    }
    const deadline = Date.now() + LED_WIND_REACTIVE_POLL_TIMEOUT_MS;
    let latest: LEDWindReactiveStatus | null = null;
    do {
        await wait(LED_WIND_REACTIVE_POLL_INTERVAL_MS);
        latest = await readCapacitorBleLedWindReactive(deviceId);
        if (latest && isLEDWindReactiveOperationComplete(latest, config)) {
            return latest;
        }
    } while (Date.now() < deadline);
    return latest;
};
export const readCapacitorBleOtaControlStatus = (deviceId: string): Promise<OtaControlStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.OTA_CONTROL,
    parse: parseOtaControlStatus,
    warning: '[BLE] OTA Control取得失敗:',
});
export const writeCapacitorBleOtaControl = async (deviceId: string, op: OtaControlOp): Promise<OtaControlStatus | null> => {
    try {
        await BleClient.write(deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.OTA_CONTROL, payloadToDataView(buildOtaControlRequest(op)));
    }
    catch (error) {
        console.warn('[BLE] OTA Control write不可:', error);
        return null;
    }
    if (op === 'activatePortal') {
        await wait(OTA_CONTROL_POLL_INTERVAL_MS);
        return readCapacitorBleOtaControlStatus(deviceId);
    }
    const deadline = Date.now() + OTA_CONTROL_POLL_TIMEOUT_MS;
    let latest: OtaControlStatus | null = null;
    do {
        await wait(OTA_CONTROL_POLL_INTERVAL_MS);
        latest = await readCapacitorBleOtaControlStatus(deviceId);
        if (latest && latest.lastOp === op && latest.result !== 'queued' && latest.result !== 'busy') {
            return latest;
        }
    } while (Date.now() < deadline);
    return latest;
};
export const readCapacitorBleStm32UpdateControlStatus = (deviceId: string): Promise<Stm32UpdateControlStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.STM32_UPDATE_CONTROL,
    parse: parseStm32UpdateControlStatus,
    warning: '[BLE] STM32 Update Control取得失敗:',
});
export const writeCapacitorBleStm32UpdateControl = async (deviceId: string, op: Stm32UpdateControlOp, binding?: Stm32UpdateControlSessionBinding): Promise<Stm32UpdateControlStatus | null> => {
    try {
        await BleClient.write(deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.STM32_UPDATE_CONTROL, payloadToDataView(buildStm32UpdateControlRequest(op, binding)));
    }
    catch (error) {
        console.warn('[BLE] STM32 Update Control write不可:', error);
        return null;
    }
    if (op === 'activatePortal') {
        await wait(OTA_CONTROL_POLL_INTERVAL_MS);
        return readCapacitorBleStm32UpdateControlStatus(deviceId);
    }
    const deadline = Date.now() + OTA_CONTROL_POLL_TIMEOUT_MS;
    let latest: Stm32UpdateControlStatus | null = null;
    do {
        await wait(OTA_CONTROL_POLL_INTERVAL_MS);
        latest = await readCapacitorBleStm32UpdateControlStatus(deviceId);
        if (latest && latest.lastOp === op && latest.result !== 'queued' && latest.result !== 'busy') {
            return latest;
        }
    } while (Date.now() < deadline);
    return latest;
};
export const readCapacitorBleDeviceResetStatus = (deviceId: string): Promise<DeviceResetStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.RESET_CONTROL,
    parse: parseDeviceResetStatus,
    warning: '[BLE] Reset Control取得失敗:',
});
export const writeCapacitorBleDeviceReset = async (deviceId: string, target: DeviceResetTarget): Promise<DeviceResetStatus | null> => {
    const requestedOp = deviceResetOpForTarget(target);
    try {
        await BleClient.write(deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.RESET_CONTROL, payloadToDataView(buildDeviceResetRequest(requestedOp)));
    }
    catch (error) {
        console.warn('[BLE] Reset Control write不可:', error);
        return null;
    }
    const deadline = Date.now() + RESET_CONTROL_POLL_TIMEOUT_MS;
    let latest: DeviceResetStatus | null = null;
    do {
        await wait(RESET_CONTROL_POLL_INTERVAL_MS);
        latest = await readCapacitorBleDeviceResetStatus(deviceId);
        if (!latest && target === 'esp32') {
            return createOptimisticDeviceResetStatus(target);
        }
        if (latest && latest.lastOp === requestedOp && latest.result !== 'queued' && latest.result !== 'busy') {
            return latest;
        }
    } while (Date.now() < deadline);
    return latest;
};
export const readCapacitorBleCardStatus = (deviceId: string): Promise<CardStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.CARD_STATUS,
    parse: parseCardStatus,
});
export const readCapacitorBleCardLogControlStatus = (deviceId: string): Promise<CardLogControlStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.CARD_LOG_CONTROL,
    parse: parseCardLogControlStatus,
    warning: '[BLE] カードログ制御ステータス取得失敗:',
});
export const readCapacitorBleCardLogDetailStatus = (deviceId: string): Promise<CardLogDetailStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.CARD_LOG_DETAIL,
    parse: parseCardLogDetailStatus,
    warning: '[BLE] カードログ詳細取得失敗:',
});
export const readCapacitorBleCardLogSettingsStatus = (deviceId: string): Promise<CardLogSettingsStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.CARD_LOG_SETTINGS,
    parse: parseCardLogSettingsStatus,
    warning: '[BLE] カードログ設定取得失敗:',
});
export const writeCapacitorBleCardLogging = async (deviceId: string, enabled: boolean): Promise<CardLogControlStatus | null> => {
    const requestedOp = enabled ? 'start' : 'stop';
    try {
        await BleClient.write(deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.CARD_LOG_CONTROL, payloadToDataView(buildCardLogControlRequest(requestedOp)));
    }
    catch (error) {
        console.warn('[BLE] カードログ制御write不可:', error);
        return null;
    }
    const deadline = Date.now() + CARD_LOG_CONTROL_POLL_TIMEOUT_MS;
    let latest: CardLogControlStatus | null = null;
    do {
        await wait(CARD_LOG_CONTROL_POLL_INTERVAL_MS);
        latest = await readCapacitorBleCardLogControlStatus(deviceId);
        if (!latest)
            return null;
        if (latest.lastOp === requestedOp && latest.result !== 'queued' && latest.result !== 'busy') {
            return latest;
        }
    } while (Date.now() < deadline);
    return latest;
};
export const writeCapacitorBleCardLogSettings = async (deviceId: string, request: CardLogSettingsWriteRequest): Promise<CardLogSettingsStatus | null> => {
    try {
        await BleClient.write(deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.CARD_LOG_SETTINGS, payloadToDataView(buildCardLogSettingsRequest(request)));
    }
    catch (error) {
        console.warn('[BLE] カードログ設定write不可:', error);
        return null;
    }
    const deadline = Date.now() + CARD_LOG_SETTINGS_POLL_TIMEOUT_MS;
    let latest: CardLogSettingsStatus | null = null;
    do {
        await wait(CARD_LOG_SETTINGS_POLL_INTERVAL_MS);
        latest = await readCapacitorBleCardLogSettingsStatus(deviceId);
        if (latest && latest.lastOp === request.op && latest.result !== 'queued' && latest.result !== 'busy') {
            return latest;
        }
    } while (Date.now() < deadline);
    return latest;
};
export const readCapacitorBleDeviceModeStatus = (deviceId: string): Promise<DeviceModeStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.DEVICE_MODE,
    parse: parseDeviceModeStatus,
    warning: '[BLE] ESP32モード取得失敗:',
});
export const readCapacitorBleI2cConfigStatus = (deviceId: string): Promise<I2cConfigStatus | null> => readCapacitorStatus({
    deviceId,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.I2C_CONFIG_CONTROL,
    parse: parseI2cConfigStatus,
    warning: '[BLE] I2C設定ステータス取得失敗:',
});
export const writeCapacitorBleI2cConfig = async (deviceId: string, request: I2cConfigWriteRequest): Promise<I2cConfigStatus | null> => {
    const baseline = await readCapacitorBleI2cConfigStatus(deviceId);
    if (!baseline)
        return null;
    try {
        await BleClient.write(deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.I2C_CONFIG_CONTROL, payloadToDataView(buildI2cConfigRequest(request)));
    }
    catch (error) {
        console.warn('[BLE] I2C設定write不可:', error);
        return null;
    }
    const deadline = Date.now() + I2C_CONFIG_POLL_TIMEOUT_MS;
    let latest: I2cConfigStatus | null = null;
    do {
        await wait(I2C_CONFIG_POLL_INTERVAL_MS);
        latest = await readCapacitorBleI2cConfigStatus(deviceId);
        if (!latest)
            return null;
        if (isI2cConfigOperationComplete(latest, request.op, baseline)) {
            return latest;
        }
    } while (Date.now() < deadline);
    return latest;
};
