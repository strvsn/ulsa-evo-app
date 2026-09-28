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
import { I2C_CONFIG_POLL_INTERVAL_MS, I2C_CONFIG_POLL_TIMEOUT_MS, LED_BRIGHTNESS_POLL_INTERVAL_MS, LED_BRIGHTNESS_POLL_TIMEOUT_MS, LED_WIND_REACTIVE_POLL_INTERVAL_MS, LED_WIND_REACTIVE_POLL_TIMEOUT_MS, CARD_LOG_CONTROL_POLL_INTERVAL_MS, CARD_LOG_CONTROL_POLL_TIMEOUT_MS, CARD_LOG_SETTINGS_POLL_INTERVAL_MS, CARD_LOG_SETTINGS_POLL_TIMEOUT_MS, clonePayloadToArrayBuffer, pollUntilStatusSettled, } from './webBleAdapterHelpers';
const OTA_CONTROL_POLL_INTERVAL_MS = 150;
const OTA_CONTROL_POLL_TIMEOUT_MS = 5000;
const RESET_CONTROL_POLL_INTERVAL_MS = 120;
const RESET_CONTROL_POLL_TIMEOUT_MS = 3500;
export type GetWebBleCharacteristic = (serviceUuid: string, characteristicUuid: string, warnOnFailure?: boolean) => Promise<BluetoothRemoteGATTCharacteristic | null>;
type ReadStatusOptions<T> = {
    getCharacteristic: GetWebBleCharacteristic;
    serviceUuid: string;
    characteristicUuid: string;
    warnOnFailure?: boolean;
    parse: (value: DataView) => T;
    warning?: string;
};
const readStatus = async <T>({ getCharacteristic, serviceUuid, characteristicUuid, warnOnFailure = false, parse, warning, }: ReadStatusOptions<T>): Promise<T | null> => {
    const characteristic = await getCharacteristic(serviceUuid, characteristicUuid, warnOnFailure);
    if (!characteristic)
        return null;
    try {
        return parse(await characteristic.readValue());
    }
    catch (error) {
        if (warning) {
            console.warn(warning, error);
        }
        return null;
    }
};
const getUlsaWindCharacteristic = (getCharacteristic: GetWebBleCharacteristic, characteristicUuid: string, warnOnFailure = false): Promise<BluetoothRemoteGATTCharacteristic | null> => getCharacteristic(SERVICE_UUIDS.ULSA_WIND, characteristicUuid, warnOnFailure);
export const readWebBleDeviceInfo = async (getCharacteristic: GetWebBleCharacteristic): Promise<DeviceInfo> => {
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
        const characteristic = await getCharacteristic(SERVICE_UUIDS.DEVICE_INFORMATION, field.characteristicUuid, false);
        if (characteristic) {
            try {
                info[field.key] = parseString(await characteristic.readValue());
            }
            catch { /* Optional cleanup may already have completed. */ }
        }
    }
    return info;
};
export const readWebBleStm32FirmwareVersion = (getCharacteristic: GetWebBleCharacteristic): Promise<Stm32FirmwareVersionStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.STM32_FIRMWARE_VERSION,
    parse: parseStm32FirmwareVersionStatus,
});
export const readWebBleSampleMetadataStatus = (getCharacteristic: GetWebBleCharacteristic): Promise<SampleMetadataStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.SAMPLE_METADATA,
    parse: parseSampleMetadataStatus,
    warning: '[BLE] Sample Metadata取得失敗:',
});
export const readWebBleDeviceHealthStatus = (getCharacteristic: GetWebBleCharacteristic): Promise<DeviceHealthStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.DEVICE_HEALTH,
    parse: parseDeviceHealthStatus,
    warning: '[BLE] Device Health取得失敗:',
});
export const readWebBleCapabilitiesStatus = (getCharacteristic: GetWebBleCharacteristic): Promise<BLECapabilitiesStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.CAPABILITIES,
    parse: parseBLECapabilitiesStatus,
    warning: '[BLE] Capabilities取得失敗:',
});
export const readWebBleLedBrightness = (getCharacteristic: GetWebBleCharacteristic): Promise<LEDBrightnessStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.LED_BRIGHTNESS,
    parse: parseLEDBrightnessStatus,
    warning: '[BLE] LED輝度取得失敗:',
});
export const writeWebBleLedBrightness = async (getCharacteristic: GetWebBleCharacteristic, brightness: number): Promise<LEDBrightnessStatus | null> => {
    const characteristic = await getUlsaWindCharacteristic(getCharacteristic, CHARACTERISTIC_UUIDS.LED_BRIGHTNESS);
    if (!characteristic)
        return null;
    const payload = buildLEDBrightnessPayload(brightness);
    const requestedBrightness = payload[0];
    await characteristic.writeValue(clonePayloadToArrayBuffer(payload));
    return pollUntilStatusSettled({
        intervalMs: LED_BRIGHTNESS_POLL_INTERVAL_MS,
        timeoutMs: LED_BRIGHTNESS_POLL_TIMEOUT_MS,
        readStatus: async () => {
            try {
                return parseLEDBrightnessStatus(await characteristic.readValue());
            }
            catch (error) {
                console.warn('[BLE] LED輝度更新後の読取失敗:', error);
                return null;
            }
        },
        isDone: (latest) => latest.brightness === requestedBrightness,
    });
};
export const readWebBleLedWindReactive = (getCharacteristic: GetWebBleCharacteristic): Promise<LEDWindReactiveStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.LED_WIND_REACTIVE,
    parse: parseLEDWindReactiveStatus,
    warning: '[BLE] LED風速連動取得失敗:',
});
export const writeWebBleLedWindReactive = async (getCharacteristic: GetWebBleCharacteristic, config: LEDWindReactiveConfig): Promise<LEDWindReactiveStatus | null> => {
    const characteristic = await getUlsaWindCharacteristic(getCharacteristic, CHARACTERISTIC_UUIDS.LED_WIND_REACTIVE);
    if (!characteristic)
        return null;
    await characteristic.writeValue(clonePayloadToArrayBuffer(buildLEDWindReactiveConfigPayload(config)));
    return pollUntilStatusSettled({
        intervalMs: LED_WIND_REACTIVE_POLL_INTERVAL_MS,
        timeoutMs: LED_WIND_REACTIVE_POLL_TIMEOUT_MS,
        readStatus: async () => {
            try {
                return parseLEDWindReactiveStatus(await characteristic.readValue());
            }
            catch (error) {
                console.warn('[BLE] LED風速連動更新後の読取失敗:', error);
                return null;
            }
        },
        isDone: (latest) => isLEDWindReactiveOperationComplete(latest, config),
    });
};
export const readWebBleOtaControlStatus = (getCharacteristic: GetWebBleCharacteristic): Promise<OtaControlStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.OTA_CONTROL,
    parse: parseOtaControlStatus,
    warning: '[BLE] OTA Control取得失敗:',
});
export const writeWebBleOtaControl = async (getCharacteristic: GetWebBleCharacteristic, op: OtaControlOp): Promise<OtaControlStatus | null> => {
    const characteristic = await getUlsaWindCharacteristic(getCharacteristic, CHARACTERISTIC_UUIDS.OTA_CONTROL);
    if (!characteristic)
        return null;
    await characteristic.writeValue(clonePayloadToArrayBuffer(buildOtaControlRequest(op)));
    if (op === 'activatePortal') {
        await new Promise((resolve) => setTimeout(resolve, OTA_CONTROL_POLL_INTERVAL_MS));
        try {
            return parseOtaControlStatus(await characteristic.readValue());
        }
        catch (error) {
            console.warn('[BLE] OTA Control activate後の読取失敗:', error);
            return null;
        }
    }
    return pollUntilStatusSettled({
        intervalMs: OTA_CONTROL_POLL_INTERVAL_MS,
        timeoutMs: OTA_CONTROL_POLL_TIMEOUT_MS,
        readStatus: async () => {
            try {
                return parseOtaControlStatus(await characteristic.readValue());
            }
            catch (error) {
                console.warn('[BLE] OTA Control更新後の読取失敗:', error);
                return null;
            }
        },
        isDone: (latest) => latest.lastOp === op && latest.result !== 'queued' && latest.result !== 'busy',
    });
};
export const readWebBleStm32UpdateControlStatus = (getCharacteristic: GetWebBleCharacteristic): Promise<Stm32UpdateControlStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.STM32_UPDATE_CONTROL,
    parse: parseStm32UpdateControlStatus,
    warning: '[BLE] STM32 Update Control取得失敗:',
});
export const writeWebBleStm32UpdateControl = async (getCharacteristic: GetWebBleCharacteristic, op: Stm32UpdateControlOp, binding?: Stm32UpdateControlSessionBinding): Promise<Stm32UpdateControlStatus | null> => {
    const characteristic = await getUlsaWindCharacteristic(getCharacteristic, CHARACTERISTIC_UUIDS.STM32_UPDATE_CONTROL);
    if (!characteristic)
        return null;
    await characteristic.writeValue(clonePayloadToArrayBuffer(buildStm32UpdateControlRequest(op, binding)));
    if (op === 'activatePortal') {
        await new Promise((resolve) => setTimeout(resolve, OTA_CONTROL_POLL_INTERVAL_MS));
        try {
            return parseStm32UpdateControlStatus(await characteristic.readValue());
        }
        catch (error) {
            console.warn('[BLE] STM32 Update Control activate後の読取失敗:', error);
            return null;
        }
    }
    return pollUntilStatusSettled({
        intervalMs: OTA_CONTROL_POLL_INTERVAL_MS,
        timeoutMs: OTA_CONTROL_POLL_TIMEOUT_MS,
        readStatus: async () => {
            try {
                return parseStm32UpdateControlStatus(await characteristic.readValue());
            }
            catch (error) {
                console.warn('[BLE] STM32 Update Control更新後の読取失敗:', error);
                return null;
            }
        },
        isDone: (latest) => latest.lastOp === op && latest.result !== 'queued' && latest.result !== 'busy',
    });
};
export const readWebBleDeviceResetStatus = (getCharacteristic: GetWebBleCharacteristic): Promise<DeviceResetStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.RESET_CONTROL,
    parse: parseDeviceResetStatus,
    warning: '[BLE] Reset Control取得失敗:',
});
export const writeWebBleDeviceReset = async (getCharacteristic: GetWebBleCharacteristic, target: DeviceResetTarget): Promise<DeviceResetStatus | null> => {
    const characteristic = await getUlsaWindCharacteristic(getCharacteristic, CHARACTERISTIC_UUIDS.RESET_CONTROL);
    if (!characteristic)
        return null;
    const requestedOp = deviceResetOpForTarget(target);
    await characteristic.writeValue(clonePayloadToArrayBuffer(buildDeviceResetRequest(requestedOp)));
    const readLatest = async (): Promise<DeviceResetStatus | null> => {
        try {
            return parseDeviceResetStatus(await characteristic.readValue());
        }
        catch (error) {
            console.warn('[BLE] Reset Control更新後の読取失敗:', error);
            return target === 'esp32' ? createOptimisticDeviceResetStatus(target) : null;
        }
    };
    return pollUntilStatusSettled({
        intervalMs: RESET_CONTROL_POLL_INTERVAL_MS,
        timeoutMs: RESET_CONTROL_POLL_TIMEOUT_MS,
        readStatus: readLatest,
        isDone: (latest) => latest.lastOp === requestedOp && latest.result !== 'queued' && latest.result !== 'busy',
    });
};
export const readWebBleCardStatus = (getCharacteristic: GetWebBleCharacteristic): Promise<CardStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.CARD_STATUS,
    parse: parseCardStatus,
});
export const readWebBleCardLogControlStatus = (getCharacteristic: GetWebBleCharacteristic): Promise<CardLogControlStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.CARD_LOG_CONTROL,
    parse: parseCardLogControlStatus,
    warning: '[BLE] カードログ制御ステータス取得失敗:',
});
export const readWebBleCardLogDetailStatus = (getCharacteristic: GetWebBleCharacteristic): Promise<CardLogDetailStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.CARD_LOG_DETAIL,
    parse: parseCardLogDetailStatus,
    warning: '[BLE] カードログ詳細取得失敗:',
});
export const readWebBleCardLogSettingsStatus = (getCharacteristic: GetWebBleCharacteristic): Promise<CardLogSettingsStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.CARD_LOG_SETTINGS,
    parse: parseCardLogSettingsStatus,
    warning: '[BLE] カードログ設定取得失敗:',
});
export const writeWebBleCardLogging = async (getCharacteristic: GetWebBleCharacteristic, enabled: boolean): Promise<CardLogControlStatus | null> => {
    const characteristic = await getUlsaWindCharacteristic(getCharacteristic, CHARACTERISTIC_UUIDS.CARD_LOG_CONTROL);
    if (!characteristic)
        return null;
    const requestedOp = enabled ? 'start' : 'stop';
    await characteristic.writeValue(clonePayloadToArrayBuffer(buildCardLogControlRequest(requestedOp)));
    return pollUntilStatusSettled({
        intervalMs: CARD_LOG_CONTROL_POLL_INTERVAL_MS,
        timeoutMs: CARD_LOG_CONTROL_POLL_TIMEOUT_MS,
        readStatus: async () => {
            try {
                return parseCardLogControlStatus(await characteristic.readValue());
            }
            catch (error) {
                console.warn('[BLE] カードログ制御ステータス取得失敗:', error);
                return null;
            }
        },
        isDone: (latest) => latest.lastOp === requestedOp && latest.result !== 'queued' && latest.result !== 'busy',
    });
};
export const writeWebBleCardLogSettings = async (getCharacteristic: GetWebBleCharacteristic, request: CardLogSettingsWriteRequest): Promise<CardLogSettingsStatus | null> => {
    const characteristic = await getUlsaWindCharacteristic(getCharacteristic, CHARACTERISTIC_UUIDS.CARD_LOG_SETTINGS);
    if (!characteristic)
        return null;
    await characteristic.writeValue(clonePayloadToArrayBuffer(buildCardLogSettingsRequest(request)));
    return pollUntilStatusSettled({
        intervalMs: CARD_LOG_SETTINGS_POLL_INTERVAL_MS,
        timeoutMs: CARD_LOG_SETTINGS_POLL_TIMEOUT_MS,
        readStatus: async () => {
            try {
                return parseCardLogSettingsStatus(await characteristic.readValue());
            }
            catch (error) {
                console.warn('[BLE] カードログ設定取得失敗:', error);
                return null;
            }
        },
        isDone: (latest) => latest.lastOp === request.op && latest.result !== 'queued' && latest.result !== 'busy',
    });
};
export const readWebBleDeviceModeStatus = (getCharacteristic: GetWebBleCharacteristic): Promise<DeviceModeStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.DEVICE_MODE,
    warnOnFailure: true,
    parse: parseDeviceModeStatus,
    warning: '[BLE] ESP32モード取得失敗:',
});
export const readWebBleI2cConfigStatus = (getCharacteristic: GetWebBleCharacteristic): Promise<I2cConfigStatus | null> => readStatus({
    getCharacteristic,
    serviceUuid: SERVICE_UUIDS.ULSA_WIND,
    characteristicUuid: CHARACTERISTIC_UUIDS.I2C_CONFIG_CONTROL,
    warnOnFailure: true,
    parse: parseI2cConfigStatus,
    warning: '[BLE] I2C設定ステータス取得失敗:',
});
export const writeWebBleI2cConfig = async (getCharacteristic: GetWebBleCharacteristic, request: I2cConfigWriteRequest): Promise<I2cConfigStatus | null> => {
    const characteristic = await getUlsaWindCharacteristic(getCharacteristic, CHARACTERISTIC_UUIDS.I2C_CONFIG_CONTROL, true);
    if (!characteristic)
        return null;
    let baseline: I2cConfigStatus;
    try {
        baseline = parseI2cConfigStatus(await characteristic.readValue());
    }
    catch (error) {
        console.warn('[BLE] I2C設定write前ステータス取得失敗:', error);
        return null;
    }
    await characteristic.writeValue(clonePayloadToArrayBuffer(buildI2cConfigRequest(request)));
    return pollUntilStatusSettled({
        intervalMs: I2C_CONFIG_POLL_INTERVAL_MS,
        timeoutMs: I2C_CONFIG_POLL_TIMEOUT_MS,
        readStatus: async () => {
            try {
                return parseI2cConfigStatus(await characteristic.readValue());
            }
            catch (error) {
                console.warn('[BLE] I2C設定ステータス取得失敗:', error);
                return null;
            }
        },
        isDone: (latest) => isI2cConfigOperationComplete(latest, request.op, baseline),
    });
};
