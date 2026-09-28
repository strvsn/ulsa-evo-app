import type { SensorData } from '../../types/ble';
import type { NotificationStartResult, SensorFieldName, SensorStatusCallback } from './IBLEAdapter';
import { CHARACTERISTIC_UUIDS, SERVICE_UUIDS } from './bleConstants';
import { parseHeadingSpeed, parseSensorStatus, parseSoundSpeed, parseTemperature, parseWindAxisSpeeds, parseWindDirection, parseWindSpeed, } from './bleDataParser';
import { logBLEDebug } from './bleLogger';
type GetCharacteristic = (serviceUuid: string, characteristicUuid: string, warnOnFailure?: boolean) => Promise<BluetoothRemoteGATTCharacteristic | null>;
const OPTIONAL_START_TIMEOUT_MS = 1500;
const withOptionalTimeout = async (task: Promise<unknown>): Promise<void> => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
        await Promise.race([
            task,
            new Promise<void>((resolve) => {
                timeout = setTimeout(resolve, OPTIONAL_START_TIMEOUT_MS);
            })
        ]);
    }
    finally {
        if (timeout !== null)
            clearTimeout(timeout);
    }
};
type StartWebBleSensorNotificationsOptions = {
    getCharacteristic: GetCharacteristic;
    emitParsedSensorData: (update: () => void, changedField: SensorFieldName) => void;
    updateSensorData: (patch: Partial<SensorData>) => void;
    onSensorStatus: SensorStatusCallback;
    addCharacteristicListener: (characteristic: BluetoothRemoteGATTCharacteristic, handler: (event: Event) => void) => void;
    removeCharacteristicListener: (characteristic: BluetoothRemoteGATTCharacteristic, handler: (event: Event) => void) => void;
    setSensorStatusPollInterval: (interval: ReturnType<typeof setInterval>) => void;
    isSessionActive: () => boolean;
    stopSensorNotifications: () => Promise<void>;
};
type SensorNotificationDefinition = {
    label: string;
    serviceUuid: string;
    characteristicUuid: string;
    warnOnFailure?: boolean;
    changedField: SensorFieldName;
    resultGroup: 'required' | 'optional';
    resultKey: keyof NotificationStartResult['required'] | keyof NotificationStartResult['optional'];
    parsePatch: (value: DataView) => Partial<SensorData>;
    engineeringOnly?: boolean;
};
const createInitialNotificationResult = (): NotificationStartResult => ({
    required: {
        windDirection: false,
        windSpeed: false,
        temperature: false,
    },
    optional: {
        soundSpeed: false,
        headingSpeed: false,
        windAxisSpeeds: false,
        sensorStatus: false,
    },
    startedCount: 0,
});
const sensorNotificationDefinitions: SensorNotificationDefinition[] = [
    {
        label: 'WindDirection',
        serviceUuid: SERVICE_UUIDS.ENVIRONMENTAL_SENSING,
        characteristicUuid: CHARACTERISTIC_UUIDS.APPARENT_WIND_DIRECTION,
        changedField: 'windDirection',
        resultGroup: 'required',
        resultKey: 'windDirection',
        parsePatch: (value) => ({ windDirection: parseWindDirection(value) }),
    },
    {
        label: 'WindSpeed',
        serviceUuid: SERVICE_UUIDS.ENVIRONMENTAL_SENSING,
        characteristicUuid: CHARACTERISTIC_UUIDS.APPARENT_WIND_SPEED,
        changedField: 'windSpeed',
        resultGroup: 'required',
        resultKey: 'windSpeed',
        parsePatch: (value) => ({ windSpeed: parseWindSpeed(value) }),
    },
    {
        label: 'Temperature',
        serviceUuid: SERVICE_UUIDS.ENVIRONMENTAL_SENSING,
        characteristicUuid: CHARACTERISTIC_UUIDS.TEMPERATURE,
        changedField: 'temperature',
        resultGroup: 'required',
        resultKey: 'temperature',
        parsePatch: (value) => ({ temperature: parseTemperature(value) }),
    },
    {
        label: 'SoundSpeed',
        serviceUuid: SERVICE_UUIDS.ULSA_WIND,
        characteristicUuid: CHARACTERISTIC_UUIDS.SOUND_SPEED,
        warnOnFailure: false,
        changedField: 'soundSpeed',
        resultGroup: 'optional',
        resultKey: 'soundSpeed',
        parsePatch: (value) => ({ soundSpeed: parseSoundSpeed(value) }),
    },
    {
        label: 'HeadingSpeed',
        serviceUuid: SERVICE_UUIDS.ULSA_WIND,
        characteristicUuid: CHARACTERISTIC_UUIDS.HEADING_SPEED,
        warnOnFailure: false,
        changedField: 'headingSpeed',
        resultGroup: 'optional',
        resultKey: 'headingSpeed',
        parsePatch: (value) => ({ headingSpeed: parseHeadingSpeed(value) }),
    },
    {
        label: 'WindAxisSpeeds',
        serviceUuid: SERVICE_UUIDS.ULSA_WIND,
        characteristicUuid: CHARACTERISTIC_UUIDS.WIND_AXIS_SPEEDS,
        warnOnFailure: false,
        changedField: 'windAxisSpeeds',
        resultGroup: 'optional',
        resultKey: 'windAxisSpeeds',
        parsePatch: (value) => parseWindAxisSpeeds(value),
        engineeringOnly: true,
    }
];
const markNotificationStarted = (result: NotificationStartResult, group: SensorNotificationDefinition['resultGroup'], key: SensorNotificationDefinition['resultKey']): void => {
    if (group === 'required') {
        result.required[key as keyof NotificationStartResult['required']] = true;
    }
    else {
        result.optional[key as keyof NotificationStartResult['optional']] = true;
    }
    result.startedCount++;
};
const registerNotifyCharacteristic = async (definition: SensorNotificationDefinition, result: NotificationStartResult, options: StartWebBleSensorNotificationsOptions): Promise<void> => {
    if (!options.isSessionActive())
        return;
    const characteristic = await options.getCharacteristic(definition.serviceUuid, definition.characteristicUuid, definition.warnOnFailure ?? true);
    logBLEDebug(`${definition.label} (${definition.characteristicUuid}):`, characteristic ? '✅' : '❌なし');
    if (!characteristic) {
        return;
    }
    if (!options.isSessionActive())
        return;
    const handler = (event: Event) => {
        if (!options.isSessionActive())
            return;
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        const value = target.value;
        if (value) {
            options.emitParsedSensorData(() => {
                const patch = definition.parsePatch(value);
                options.updateSensorData(patch);
            }, definition.changedField);
        }
    };
    try {
        options.addCharacteristicListener(characteristic, handler);
        await characteristic.startNotifications();
        if (!options.isSessionActive()) {
            options.removeCharacteristicListener(characteristic, handler);
            return;
        }
        markNotificationStarted(result, definition.resultGroup, definition.resultKey);
    }
    catch (error) {
        options.removeCharacteristicListener(characteristic, handler);
        console.error(`${definition.label}通知開始失敗:`, error);
    }
};
const registerSensorStatus = async (result: NotificationStartResult, options: StartWebBleSensorNotificationsOptions): Promise<void> => {
    if (!options.isSessionActive())
        return;
    const status = await options.getCharacteristic(SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.SENSOR_STATUS, false);
    logBLEDebug(`SensorStatus (${CHARACTERISTIC_UUIDS.SENSOR_STATUS}):`, status ? '✅' : '❌なし');
    if (!status) {
        return;
    }
    if (!options.isSessionActive())
        return;
    if (status.properties.notify) {
        try {
            const applyValue = (value: DataView) => {
                options.emitParsedSensorData(() => {
                    const sensorStatus = parseSensorStatus(value);
                    options.updateSensorData(sensorStatus);
                    options.onSensorStatus(sensorStatus);
                }, 'sensorStatus');
            };
            const handler = (event: Event) => {
                if (!options.isSessionActive())
                    return;
                const target = event.target as BluetoothRemoteGATTCharacteristic;
                const value = target.value;
                if (value)
                    applyValue(value);
            };
            options.addCharacteristicListener(status, handler);
            await status.startNotifications();
            if (!options.isSessionActive())
                return;
            applyValue(await status.readValue());
            if (!options.isSessionActive())
                return;
            result.optional.sensorStatus = true;
            result.startedCount++;
            return;
        }
        catch (error) {
            console.warn('SensorStatus通知開始失敗、Readへ切替:', error);
        }
    }
    try {
        const readSensorStatus = async () => {
            if (!options.isSessionActive())
                return false;
            const value = await status.readValue();
            if (!options.isSessionActive())
                return false;
            options.emitParsedSensorData(() => {
                const sensorStatus = parseSensorStatus(value);
                options.updateSensorData(sensorStatus);
                options.onSensorStatus(sensorStatus);
            }, 'sensorStatus');
            return true;
        };
        if (!await readSensorStatus() || !options.isSessionActive())
            return;
        logBLEDebug('SensorStatus: Notify未使用 → 2秒ポーリング開始');
        const interval = setInterval(async () => {
            if (!options.isSessionActive())
                return;
            try {
                await readSensorStatus();
            }
            catch { /* Optional cleanup may already have completed. */ }
        }, 2000);
        if (!options.isSessionActive()) {
            clearInterval(interval);
            return;
        }
        options.setSensorStatusPollInterval(interval);
        result.optional.sensorStatus = true;
        result.startedCount++;
    }
    catch (error) {
        console.error('SensorStatusポーリング開始失敗:', error);
    }
};
const startOptionalWebBleSensorNotifications = async (result: NotificationStartResult, options: StartWebBleSensorNotificationsOptions): Promise<void> => {
    if (!options.isSessionActive())
        return;
    const tasks: Promise<void>[] = [];
    for (const definition of sensorNotificationDefinitions) {
        if (definition.resultGroup !== 'optional' || !options.isSessionActive())
            continue;
        if (definition.engineeringOnly)
            continue;
        tasks.push(withOptionalTimeout(registerNotifyCharacteristic(definition, result, options)));
    }
    tasks.push(withOptionalTimeout(registerSensorStatus(result, options)));
    await Promise.allSettled(tasks);
};
export const startWebBleSensorNotifications = async (options: StartWebBleSensorNotificationsOptions): Promise<NotificationStartResult> => {
    const result = createInitialNotificationResult();
    logBLEDebug('🔔 通知設定: キャラクタリスティック登録');
    logBLEDebug('使用UUID:', {
        ESS: SERVICE_UUIDS.ENVIRONMENTAL_SENSING,
        ULSA_WIND: SERVICE_UUIDS.ULSA_WIND,
    });
    for (const definition of sensorNotificationDefinitions) {
        if (definition.resultGroup !== 'required' || !options.isSessionActive())
            continue;
        await registerNotifyCharacteristic(definition, result, options);
    }
    if (!Object.values(result.required).some(Boolean)) {
        await options.stopSensorNotifications();
        throw new Error('標準センサー通知を1項目も開始できませんでした');
    }
    logBLEDebug(`標準通知登録完了: ${result.startedCount} キャラクタリスティック`);
    void Promise.resolve()
        .then(() => startOptionalWebBleSensorNotifications(result, options))
        .catch((error) => console.warn('[BLE] 任意センサー通知の開始に失敗:', error));
    return result;
};
