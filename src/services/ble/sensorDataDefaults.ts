import type { DeviceInfo, SensorData } from '../../types/ble';
export const createEmptySensorData = (): SensorData => ({
    windDirection: Number.NaN,
    windSpeed: Number.NaN,
    windSpeedA: null,
    windSpeedB: null,
    temperature: Number.NaN,
    soundSpeed: Number.NaN,
    headingSpeed: Number.NaN,
    sensorStatus: 0,
    timestamp: Date.now(),
});
export const createEmptyDeviceInfo = (): DeviceInfo => ({
    firmwareRevision: '',
    softwareRevision: '',
    manufacturerName: '',
    modelNumber: '',
});
