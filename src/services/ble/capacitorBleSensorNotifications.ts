import { BleClient } from '@capacitor-community/bluetooth-le';
import type { SensorData } from '../../types/ble';
import type { NotificationStartResult, SensorFieldName, SensorStatusCallback } from './IBLEAdapter';
import { CHARACTERISTIC_UUIDS, SERVICE_UUIDS } from './bleConstants';
import { parseHeadingSpeed, parseSensorStatus, parseSoundSpeed, parseTemperature, parseWindAxisSpeeds, parseWindDirection, parseWindSpeed, } from './bleDataParser';
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
type StartCapacitorSensorNotificationsOptions = {
    deviceId: string;
    emitParsedSensorData: (update: () => void, changedField: SensorFieldName) => void;
    updateSensorData: (patch: Partial<SensorData>) => void;
    onSensorStatus: SensorStatusCallback;
    setSensorStatusPollInterval: (interval: ReturnType<typeof setInterval>) => void;
    isSessionActive: () => boolean;
    stopSensorNotifications: () => Promise<void>;
};
type CapacitorSensorNotificationDefinition = {
    serviceUuid: string;
    characteristicUuid: string;
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
const requiredNotifications: CapacitorSensorNotificationDefinition[] = [
    {
        serviceUuid: SERVICE_UUIDS.ENVIRONMENTAL_SENSING,
        characteristicUuid: CHARACTERISTIC_UUIDS.APPARENT_WIND_DIRECTION,
        changedField: 'windDirection',
        resultGroup: 'required',
        resultKey: 'windDirection',
        parsePatch: (value) => ({ windDirection: parseWindDirection(value) }),
    },
    {
        serviceUuid: SERVICE_UUIDS.ENVIRONMENTAL_SENSING,
        characteristicUuid: CHARACTERISTIC_UUIDS.APPARENT_WIND_SPEED,
        changedField: 'windSpeed',
        resultGroup: 'required',
        resultKey: 'windSpeed',
        parsePatch: (value) => ({ windSpeed: parseWindSpeed(value) }),
    },
    {
        serviceUuid: SERVICE_UUIDS.ENVIRONMENTAL_SENSING,
        characteristicUuid: CHARACTERISTIC_UUIDS.TEMPERATURE,
        changedField: 'temperature',
        resultGroup: 'required',
        resultKey: 'temperature',
        parsePatch: (value) => ({ temperature: parseTemperature(value) }),
    }
];
const optionalNotifications: CapacitorSensorNotificationDefinition[] = [
    {
        serviceUuid: SERVICE_UUIDS.ULSA_WIND,
        characteristicUuid: CHARACTERISTIC_UUIDS.SOUND_SPEED,
        changedField: 'soundSpeed',
        resultGroup: 'optional',
        resultKey: 'soundSpeed',
        parsePatch: (value) => ({ soundSpeed: parseSoundSpeed(value) }),
    },
    {
        serviceUuid: SERVICE_UUIDS.ULSA_WIND,
        characteristicUuid: CHARACTERISTIC_UUIDS.HEADING_SPEED,
        changedField: 'headingSpeed',
        resultGroup: 'optional',
        resultKey: 'headingSpeed',
        parsePatch: (value) => ({ headingSpeed: parseHeadingSpeed(value) }),
    },
    {
        serviceUuid: SERVICE_UUIDS.ULSA_WIND,
        characteristicUuid: CHARACTERISTIC_UUIDS.WIND_AXIS_SPEEDS,
        changedField: 'windAxisSpeeds',
        resultGroup: 'optional',
        resultKey: 'windAxisSpeeds',
        parsePatch: (value) => parseWindAxisSpeeds(value),
        engineeringOnly: true,
    }
];
const markNotificationStarted = (result: NotificationStartResult, group: CapacitorSensorNotificationDefinition['resultGroup'], key: CapacitorSensorNotificationDefinition['resultKey']): void => {
    if (group === 'required') {
        result.required[key as keyof NotificationStartResult['required']] = true;
    }
    else {
        result.optional[key as keyof NotificationStartResult['optional']] = true;
    }
    result.startedCount++;
};
const startCapacitorNotification = async (definition: CapacitorSensorNotificationDefinition, result: NotificationStartResult, options: StartCapacitorSensorNotificationsOptions): Promise<void> => {
    await BleClient.startNotifications(options.deviceId, definition.serviceUuid, definition.characteristicUuid, (value) => {
        if (!options.isSessionActive())
            return;
        options.emitParsedSensorData(() => {
            const patch = definition.parsePatch(value);
            options.updateSensorData(patch);
        }, definition.changedField);
    });
    if (!options.isSessionActive())
        return;
    markNotificationStarted(result, definition.resultGroup, definition.resultKey);
};
const startSensorStatusNotification = async (result: NotificationStartResult, options: StartCapacitorSensorNotificationsOptions): Promise<void> => {
    const applyValue = (value: DataView) => {
        if (!options.isSessionActive())
            return false;
        options.emitParsedSensorData(() => {
            const sensorStatus = parseSensorStatus(value);
            options.updateSensorData(sensorStatus);
            options.onSensorStatus(sensorStatus);
        }, 'sensorStatus');
        return true;
    };
    let notificationStarted = false;
    try {
        await BleClient.startNotifications(options.deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.SENSOR_STATUS, applyValue);
        notificationStarted = true;
        if (!options.isSessionActive())
            return;
    }
    catch { /* Optional cleanup may already have completed. */ }
    const value = await BleClient.read(options.deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.SENSOR_STATUS);
    if (!options.isSessionActive())
        return;
    applyValue(value);
    if (!notificationStarted) {
        const interval = setInterval(async () => {
            if (!options.isSessionActive())
                return;
            try {
                const nextValue = await BleClient.read(options.deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.SENSOR_STATUS);
                applyValue(nextValue);
            }
            catch { /* Optional cleanup may already have completed. */ }
        }, 2000);
        if (!options.isSessionActive()) {
            clearInterval(interval);
            return;
        }
        options.setSensorStatusPollInterval(interval);
    }
    result.optional.sensorStatus = true;
    result.startedCount++;
};
const startOptionalCapacitorSensorNotifications = async (result: NotificationStartResult, options: StartCapacitorSensorNotificationsOptions): Promise<void> => {
    if (!options.isSessionActive())
        return;
    const tasks: Promise<unknown>[] = [];
    tasks.push(...optionalNotifications
        .filter((definition) => !definition.engineeringOnly)
        .map((definition) => withOptionalTimeout(startCapacitorNotification(definition, result, options))));
    tasks.push(withOptionalTimeout(startSensorStatusNotification(result, options)));
    await Promise.allSettled(tasks);
};
export const startCapacitorBleSensorNotifications = async (options: StartCapacitorSensorNotificationsOptions): Promise<NotificationStartResult> => {
    const result = createInitialNotificationResult();
    await Promise.allSettled(requiredNotifications.map((definition) => startCapacitorNotification(definition, result, options)));
    if (!Object.values(result.required).some(Boolean)) {
        await options.stopSensorNotifications();
        throw new Error('標準センサー通知を1項目も開始できませんでした');
    }
    void Promise.resolve()
        .then(() => startOptionalCapacitorSensorNotifications(result, options))
        .catch((error) => console.warn('[BLE] 任意センサー通知の開始に失敗:', error));
    return result;
};
export const stopCapacitorBleSensorNotifications = async (deviceId: string): Promise<void> => {
    const notifications = [
        { service: SERVICE_UUIDS.ENVIRONMENTAL_SENSING, char: CHARACTERISTIC_UUIDS.APPARENT_WIND_DIRECTION },
        { service: SERVICE_UUIDS.ENVIRONMENTAL_SENSING, char: CHARACTERISTIC_UUIDS.APPARENT_WIND_SPEED },
        { service: SERVICE_UUIDS.ENVIRONMENTAL_SENSING, char: CHARACTERISTIC_UUIDS.TEMPERATURE },
        { service: SERVICE_UUIDS.ULSA_WIND, char: CHARACTERISTIC_UUIDS.SOUND_SPEED },
        { service: SERVICE_UUIDS.ULSA_WIND, char: CHARACTERISTIC_UUIDS.HEADING_SPEED },
        {
            service: SERVICE_UUIDS.ULSA_WIND,
            char: CHARACTERISTIC_UUIDS.WIND_AXIS_SPEEDS,
            engineeringOnly: true,
        },
        { service: SERVICE_UUIDS.ULSA_WIND, char: CHARACTERISTIC_UUIDS.SENSOR_STATUS }
    ].filter((notification) => !notification.engineeringOnly);
    for (const { service, char } of notifications) {
        try {
            await BleClient.stopNotifications(deviceId, service, char);
        }
        catch { /* Optional cleanup may already have completed. */ }
    }
};
