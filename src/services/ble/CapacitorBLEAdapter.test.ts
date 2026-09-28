import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPACITOR_BLE_SCAN_START_TIMEOUT_MS, CapacitorBLEAdapter, } from './CapacitorBLEAdapter';
import { CHARACTERISTIC_UUIDS, SERVICE_UUIDS } from './bleConstants';
type ScanCallback = (result: {
    device?: {
        deviceId: string;
        name?: string | null;
    };
    localName?: string | null;
    rssi?: number;
    serviceData?: Record<string, DataView>;
}) => void;
type NotificationCallback = (value: DataView) => void;
type DisconnectCallback = (deviceId: string) => void;
let capacitorDisconnectCallback: DisconnectCallback | null = null;
const bleClientMock = vi.hoisted(() => ({
    initialize: vi.fn(),
    requestLEScan: vi.fn(),
    stopLEScan: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    readRssi: vi.fn(),
    startNotifications: vi.fn(),
    stopNotifications: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
    writeWithoutResponse: vi.fn(),
    isEnabled: vi.fn(),
}));
vi.mock('@capacitor-community/bluetooth-le', () => ({
    BleClient: bleClientMock,
    numbersToDataView: (numbers: number[]) => new DataView(Uint8Array.from(numbers).buffer),
}));
const dataViewFromBytes = (...bytes: number[]): DataView => new DataView(Uint8Array.from(bytes).buffer);
const createRtcTimezoneStatus = (generation: number, lastOperation = 0, unixSeconds = 1787030400): DataView => {
    const view = new DataView(new ArrayBuffer(28));
    view.setUint8(0, 1);
    view.setUint8(1, 0x1f);
    view.setUint8(2, lastOperation);
    view.setUint8(3, 0);
    view.setUint32(4, 367396520, true);
    view.setBigInt64(8, BigInt(unixSeconds), true);
    view.setInt16(16, 540, true);
    view.setInt16(18, 540, true);
    view.setUint16(22, generation, true);
    view.setUint16(24, 2025, true);
    view.setUint8(26, 'b'.charCodeAt(0));
    return view;
};
const createI2cConfigStatus = (lastOp: number, result: number): DataView => dataViewFromBytes(1, lastOp, result, 0, 0, 0, 7, 16, 0, 0x42, 1, 100, 0, 6, 0x42, 0x06);
const createCardLogControlStatus = (lastOp: number, result: number, flags = 0x03): DataView => dataViewFromBytes(1, lastOp, result, 3, flags, 0);
const createCardLogDetailStatus = (loggingEnabled: boolean): DataView => {
    const value = new DataView(new ArrayBuffer(20));
    value.setUint8(0, 2);
    value.setUint8(1, loggingEnabled ? 0x07 : 0x05);
    value.setUint8(2, loggingEnabled ? 4 : 3);
    value.setUint8(5, loggingEnabled ? 0x01 : 0x08);
    return value;
};
const uint16LE = (value: number): DataView => {
    const buffer = new ArrayBuffer(2);
    const view = new DataView(buffer);
    view.setUint16(0, value, true);
    return view;
};
const int16LE = (value: number): DataView => {
    const buffer = new ArrayBuffer(2);
    const view = new DataView(buffer);
    view.setInt16(0, value, true);
    return view;
};
const flushBackgroundBleTasks = async (): Promise<void> => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
};
const mockRequiredNotificationsOnly = (allowedOptional: string[] = []) => {
    const callbacks = new Map<string, NotificationCallback>();
    bleClientMock.startNotifications.mockImplementation(async (_deviceId: string, serviceUuid: string, characteristicUuid: string, callback: NotificationCallback) => {
        void _deviceId;
        if (serviceUuid !== SERVICE_UUIDS.ENVIRONMENTAL_SENSING &&
            !allowedOptional.includes(characteristicUuid)) {
            throw new Error('optional service not found');
        }
        callbacks.set(characteristicUuid, callback);
    });
    return callbacks;
};
describe('CapacitorBLEAdapter', () => {
    it('reads extended card counters through the shared v2 parser', async () => {
        const value = new DataView(new ArrayBuffer(36));
        value.setUint8(0, 2);
        value.setUint8(5, 5);
        value.setUint32(20, 1234, true);
        value.setUint32(24, 9, true);
        bleClientMock.read.mockResolvedValue(value);
        const adapter = new CapacitorBLEAdapter();
        await adapter.connect('device-a');
        expect(await adapter.getCardLogDetailStatus()).toMatchObject({
            syncedLogCount: 1234, droppedLogCount: 9, recovering: true,
        });
        await adapter.disconnect();
    });
    beforeEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
        vi.unstubAllEnvs();
        capacitorDisconnectCallback = null;
        bleClientMock.initialize.mockResolvedValue(undefined);
        bleClientMock.stopLEScan.mockResolvedValue(undefined);
        bleClientMock.connect.mockImplementation(async (_deviceId: string, onDisconnect?: DisconnectCallback) => {
            void _deviceId;
            capacitorDisconnectCallback = onDisconnect ?? null;
        });
        bleClientMock.disconnect.mockResolvedValue(undefined);
        bleClientMock.readRssi.mockResolvedValue(-64);
        bleClientMock.stopNotifications.mockResolvedValue(undefined);
        bleClientMock.read.mockRejectedValue(new Error('optional service not found'));
        bleClientMock.write.mockResolvedValue(undefined);
        bleClientMock.writeWithoutResponse.mockResolvedValue(undefined);
        bleClientMock.isEnabled.mockResolvedValue(true);
    });
    it('does not auto-select the first device when multiple Capacitor scan results exist', async () => {
        vi.useFakeTimers();
        bleClientMock.requestLEScan.mockImplementation(async (_options: unknown, callback: ScanCallback) => {
            void _options;
            callback({ device: { deviceId: 'device-a', name: 'ULSA EVO #1' }, localName: 'ULSA EVO #1', rssi: -70 });
            callback({ device: { deviceId: 'device-b', name: 'ULSA EVO #2' }, localName: 'ULSA EVO #2', rssi: -45 });
        });
        const adapter = new CapacitorBLEAdapter();
        const scanPromise = adapter.scanAndSelect();
        await vi.advanceTimersByTimeAsync(5000);
        await expect(scanPromise).resolves.toBeNull();
        expect(bleClientMock.stopLEScan).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });
    it('times out and releases the native scanner when iOS does not acknowledge scan startup', async () => {
        vi.useFakeTimers();
        bleClientMock.requestLEScan.mockImplementation(() => new Promise<void>(() => undefined));
        const adapter = new CapacitorBLEAdapter();
        const scanPromise = adapter.scanDevices();
        const rejection = expect(scanPromise).rejects.toThrow('BLE検索を開始できませんでした');
        await vi.advanceTimersByTimeAsync(CAPACITOR_BLE_SCAN_START_TIMEOUT_MS);
        await rejection;
        expect(bleClientMock.stopLEScan).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });
    it('stops an active native scan immediately and keeps devices already discovered', async () => {
        vi.useFakeTimers();
        bleClientMock.requestLEScan.mockImplementation(async (_options: unknown, callback: ScanCallback) => {
            void _options;
            callback({ device: { deviceId: 'device-a', name: 'ULSA EVO #101' }, localName: 'ULSA EVO #101', rssi: -55 });
        });
        const adapter = new CapacitorBLEAdapter();
        const scanPromise = adapter.scanDevices();
        await vi.advanceTimersByTimeAsync(0);
        await adapter.stopScan();
        await expect(scanPromise).resolves.toEqual([
            expect.objectContaining({ deviceId: 'device-a', nodeId: 101, rssi: -55 })
        ]);
        expect(bleClientMock.stopLEScan).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });
    it('reads the connected device RSSI through the native Capacitor API', async () => {
        const adapter = new CapacitorBLEAdapter();
        await expect(adapter.readConnectedRssi()).resolves.toBeNull();
        await adapter.connect('device-a');
        await expect(adapter.readConnectedRssi()).resolves.toBe(-64);
        expect(bleClientMock.readRssi).toHaveBeenCalledWith('device-a');
        await adapter.disconnect();
    });
    it('auto-selects a single Capacitor scan result', async () => {
        vi.useFakeTimers();
        bleClientMock.requestLEScan.mockImplementation(async (_options: unknown, callback: ScanCallback) => {
            void _options;
            callback({ device: { deviceId: 'device-a', name: 'ULSA EVO #1' }, localName: 'ULSA EVO #1', rssi: -60 });
        });
        const adapter = new CapacitorBLEAdapter();
        const scanPromise = adapter.scanAndSelect();
        await vi.advanceTimersByTimeAsync(5000);
        await expect(scanPromise).resolves.toMatchObject({
            deviceId: 'device-a',
            name: 'ULSA EVO #1',
            nodeId: 1,
            rssi: -60,
        });
        expect(bleClientMock.requestLEScan).toHaveBeenCalledWith({ services: [SERVICE_UUIDS.ENVIRONMENTAL_SENSING] }, expect.any(Function));
        vi.useRealTimers();
    });
    it('uses advertised Node ID instead of an iOS-cached ULSA EVO name', async () => {
        vi.useFakeTimers();
        bleClientMock.requestLEScan.mockImplementation(async (_options: unknown, callback: ScanCallback) => {
            void _options;
            callback({
                device: { deviceId: 'device-a', name: 'ULSA EVO #0' },
                localName: 'ULSA EVO #0',
                rssi: -60,
                serviceData: { '181a': dataViewFromBytes(123, 0) },
            });
        });
        const adapter = new CapacitorBLEAdapter();
        const scanPromise = adapter.scanAndSelect();
        await vi.advanceTimersByTimeAsync(5000);
        await expect(scanPromise).resolves.toMatchObject({
            deviceId: 'device-a',
            name: 'ULSA EVO #123',
            nodeId: 123,
            rssi: -60,
        });
        vi.useRealTimers();
    });
    it('writes the Device Identify command through a temporary connection', async () => {
        vi.useFakeTimers();
        try {
            const adapter = new CapacitorBLEAdapter();
            const identifyPromise = adapter.identifyDevice('device-a');
            await vi.advanceTimersByTimeAsync(200);
            await identifyPromise;
            expect(bleClientMock.stopLEScan).toHaveBeenCalled();
            expect(bleClientMock.connect).toHaveBeenCalledWith('device-a');
            expect(bleClientMock.write).toHaveBeenCalledWith('device-a', SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.DEVICE_IDENTIFY, dataViewFromBytes(0x01));
            expect(bleClientMock.writeWithoutResponse).not.toHaveBeenCalled();
            expect(bleClientMock.disconnect).toHaveBeenCalledWith('device-a');
            expect(adapter.getConnectionState()).toBe('disconnected');
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('waits for the temporary identify disconnect before connecting during the LED blink', async () => {
        vi.useFakeTimers();
        try {
            let finishTemporaryDisconnect: (() => void) | undefined;
            bleClientMock.disconnect.mockImplementationOnce(() => new Promise<void>((resolve) => {
                finishTemporaryDisconnect = resolve;
            }));
            const adapter = new CapacitorBLEAdapter();
            const identifyPromise = adapter.identifyDevice('device-a');
            await vi.advanceTimersByTimeAsync(200);
            expect(bleClientMock.disconnect).toHaveBeenCalledWith('device-a');
            const connectPromise = adapter.connect('device-a');
            expect(bleClientMock.connect).toHaveBeenCalledTimes(1);
            finishTemporaryDisconnect?.();
            await identifyPromise;
            await connectPromise;
            expect(bleClientMock.connect).toHaveBeenCalledTimes(2);
            expect(adapter.getConnectionState()).toBe('connected');
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('can connect after an identify write fails', async () => {
        bleClientMock.write.mockRejectedValueOnce(new Error('write failed'));
        bleClientMock.writeWithoutResponse.mockRejectedValueOnce(new Error('fallback failed'));
        const adapter = new CapacitorBLEAdapter();
        const identifyPromise = adapter.identifyDevice('device-a');
        const connectPromise = adapter.connect('device-a');
        await expect(identifyPromise).rejects.toThrow('LED識別に失敗しました');
        await expect(connectPromise).resolves.toBeUndefined();
        expect(bleClientMock.connect).toHaveBeenCalledTimes(2);
        expect(adapter.getConnectionState()).toBe('connected');
    });
    it('identifies the connected device without disconnecting the main connection', async () => {
        const adapter = new CapacitorBLEAdapter();
        await adapter.connect('device-a');
        await adapter.identifyDevice('device-a');
        expect(bleClientMock.write).toHaveBeenCalledWith('device-a', SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.DEVICE_IDENTIFY, dataViewFromBytes(0x01));
        expect(bleClientMock.disconnect).not.toHaveBeenCalledWith('device-a');
        expect(adapter.getConnectionState()).toBe('connected');
    });
    it('falls back to write without response when Device Identify acknowledged write is unavailable', async () => {
        vi.useFakeTimers();
        try {
            bleClientMock.write.mockRejectedValue(new Error('acknowledged write not supported'));
            const adapter = new CapacitorBLEAdapter();
            const identifyPromise = adapter.identifyDevice('device-a');
            await vi.advanceTimersByTimeAsync(200);
            await identifyPromise;
            expect(bleClientMock.write).toHaveBeenCalled();
            expect(bleClientMock.writeWithoutResponse).toHaveBeenCalledWith('device-a', SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.DEVICE_IDENTIFY, dataViewFromBytes(0x01));
            expect(bleClientMock.disconnect).toHaveBeenCalledWith('device-a');
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('emits each Capacitor standard field independently', async () => {
        const callbacks = mockRequiredNotificationsOnly();
        const adapter = new CapacitorBLEAdapter();
        const onData = vi.fn();
        await adapter.connect('device-a');
        const result = await adapter.startSensorNotifications(onData);
        expect(result.required).toEqual({ windDirection: true, windSpeed: true, temperature: true });
        expect(result.optional.sensorStatus).toBe(false);
        callbacks.get(CHARACTERISTIC_UUIDS.TEMPERATURE)?.(int16LE(2450));
        expect(onData).toHaveBeenCalledTimes(1);
        const firstEvent = onData.mock.calls[0][0];
        expect(firstEvent.changedField).toBe('temperature');
        expect(Number.isNaN(firstEvent.latestSnapshot.windDirection)).toBe(true);
        expect(Number.isNaN(firstEvent.latestSnapshot.windSpeed)).toBe(true);
        expect(firstEvent.latestSnapshot.temperature).toBe(24.5);
        callbacks.get(CHARACTERISTIC_UUIDS.APPARENT_WIND_DIRECTION)?.(uint16LE(4200));
        callbacks.get(CHARACTERISTIC_UUIDS.APPARENT_WIND_SPEED)?.(uint16LE(123));
        callbacks.get(CHARACTERISTIC_UUIDS.TEMPERATURE)?.(int16LE(2460));
        expect(onData).toHaveBeenCalledTimes(4);
        expect(onData).toHaveBeenLastCalledWith(expect.objectContaining({
            changedField: 'temperature',
            latestSnapshot: expect.objectContaining({ windDirection: 42, windSpeed: 1.23, temperature: 24.6 }),
        }));
        await adapter.disconnect();
    });
    it.each([
        {
            characteristicUuid: CHARACTERISTIC_UUIDS.APPARENT_WIND_DIRECTION,
            changedField: 'windDirection',
            value: uint16LE(4200),
            expectedValue: 42,
        },
        {
            characteristicUuid: CHARACTERISTIC_UUIDS.APPARENT_WIND_SPEED,
            changedField: 'windSpeed',
            value: uint16LE(123),
            expectedValue: 1.23,
        },
        {
            characteristicUuid: CHARACTERISTIC_UUIDS.TEMPERATURE,
            changedField: 'temperature',
            value: int16LE(2450),
            expectedValue: 24.5,
        }
    ])('keeps Capacitor measurement live when only $changedField is available', async ({ characteristicUuid, changedField, value, expectedValue, }) => {
        let notificationCallback: NotificationCallback | null = null;
        bleClientMock.startNotifications.mockImplementation(async (_deviceId: string, serviceUuid: string, requestedCharacteristicUuid: string, callback: NotificationCallback) => {
            void _deviceId;
            if (serviceUuid !== SERVICE_UUIDS.ENVIRONMENTAL_SENSING ||
                requestedCharacteristicUuid !== characteristicUuid) {
                throw new Error('characteristic not found');
            }
            notificationCallback = callback;
        });
        const adapter = new CapacitorBLEAdapter();
        const onData = vi.fn();
        await adapter.connect('device-a');
        const result = await adapter.startSensorNotifications(onData);
        expect(Object.values(result.required).filter(Boolean)).toHaveLength(1);
        expect(notificationCallback).not.toBeNull();
        notificationCallback!(value);
        expect(onData).toHaveBeenCalledOnce();
        expect(onData.mock.calls[0][0]).toEqual(expect.objectContaining({
            changedField,
            latestSnapshot: expect.objectContaining({ [changedField]: expectedValue }),
        }));
        await adapter.disconnect();
    });
    it('fails Capacitor measurement startup only when all standard characteristics are unavailable', async () => {
        bleClientMock.startNotifications.mockRejectedValue(new Error('characteristic not found'));
        const adapter = new CapacitorBLEAdapter();
        await adapter.connect('device-a');
        await expect(adapter.startSensorNotifications(vi.fn())).rejects.toThrow('標準センサー通知');
        expect(adapter.getConnectionState()).toBe('connected');
        await adapter.disconnect();
    });
    it('emits product Capacitor field events with the latest cached standard snapshot', async () => {
        const callbacks = mockRequiredNotificationsOnly([CHARACTERISTIC_UUIDS.SOUND_SPEED]);
        const adapter = new CapacitorBLEAdapter();
        const onData = vi.fn();
        await adapter.connect('device-a');
        await adapter.startSensorNotifications(onData);
        await flushBackgroundBleTasks();
        const updates: Array<[
            string,
            DataView
        ]> = [
            [CHARACTERISTIC_UUIDS.APPARENT_WIND_DIRECTION, uint16LE(4200)],
            [CHARACTERISTIC_UUIDS.APPARENT_WIND_SPEED, uint16LE(123)],
            [CHARACTERISTIC_UUIDS.TEMPERATURE, int16LE(2450)],
            [CHARACTERISTIC_UUIDS.APPARENT_WIND_SPEED, uint16LE(300)],
            [CHARACTERISTIC_UUIDS.APPARENT_WIND_DIRECTION, uint16LE(4300)],
            [CHARACTERISTIC_UUIDS.SOUND_SPEED, uint16LE(34420)],
            [CHARACTERISTIC_UUIDS.TEMPERATURE, int16LE(2460)]
        ];
        updates.forEach(([uuid, value]) => callbacks.get(uuid)!(value));
        expect(onData).toHaveBeenCalledTimes(updates.length);
        expect(callbacks.has(CHARACTERISTIC_UUIDS.WIND_AXIS_SPEEDS)).toBe(false);
        expect(onData).toHaveBeenLastCalledWith(expect.objectContaining({
            changedField: 'temperature', latestSnapshot: expect.objectContaining({
                windDirection: 43, windSpeed: 3, temperature: 24.6, soundSpeed: 344.2,
                windSpeedA: null, windSpeedB: null,
            }),
        }));
        await adapter.disconnect();
    });
    it('marks sensorStatus optional only when the characteristic can be read', async () => {
        const callbacks = mockRequiredNotificationsOnly([CHARACTERISTIC_UUIDS.SENSOR_STATUS]);
        bleClientMock.read.mockResolvedValue(dataViewFromBytes(7, 1, 2, 0xc0, 0x06, 0, 0));
        const adapter = new CapacitorBLEAdapter();
        const onData = vi.fn();
        const onSensorStatus = vi.fn();
        await adapter.connect('device-a');
        const result = await adapter.startSensorNotifications(onData, onSensorStatus);
        await flushBackgroundBleTasks();
        expect(result.optional.sensorStatus).toBe(true);
        expect(result.startedCount).toBe(4);
        expect(onData).toHaveBeenCalledTimes(1);
        expect(onData.mock.calls[0][0]).toEqual(expect.objectContaining({ changedField: 'sensorStatus' }));
        expect(onSensorStatus).toHaveBeenCalledWith({
            nodeId: 7, sensorStatus: 1, statusProtocolVersion: 2,
            statusFlags: 0xc0, serviceStatus: 0x06, activeCause: 0,
            ntcReadingStatus: 0,
        });
        callbacks.get(CHARACTERISTIC_UUIDS.APPARENT_WIND_DIRECTION)?.(uint16LE(4200));
        callbacks.get(CHARACTERISTIC_UUIDS.APPARENT_WIND_SPEED)?.(uint16LE(123));
        callbacks.get(CHARACTERISTIC_UUIDS.TEMPERATURE)?.(int16LE(2450));
        expect(onData).toHaveBeenCalledTimes(4);
        expect(onData).toHaveBeenLastCalledWith(expect.objectContaining({
            changedField: 'temperature',
            latestSnapshot: expect.objectContaining({
                windDirection: 42,
                windSpeed: 1.23,
                temperature: 24.5,
                sensorStatus: 1,
                nodeId: 7,
            }),
        }));
        await adapter.disconnect();
    });
    it('falls back to reading sensorStatus when native Notify startup fails', async () => {
        mockRequiredNotificationsOnly();
        bleClientMock.read.mockResolvedValue(dataViewFromBytes(8, 0, 2, 0x90, 0x02, 4, 1));
        const adapter = new CapacitorBLEAdapter();
        const onSensorStatus = vi.fn();
        await adapter.connect('device-a');
        const result = await adapter.startSensorNotifications(vi.fn(), onSensorStatus);
        await flushBackgroundBleTasks();
        expect(result.required).toEqual({ windDirection: true, windSpeed: true, temperature: true });
        expect(result.optional.sensorStatus).toBe(true);
        expect(onSensorStatus).toHaveBeenCalledWith(expect.objectContaining({
            nodeId: 8,
            sensorStatus: 0,
            activeCause: 4,
        }));
        await adapter.disconnect();
    });
    it('clears notification callbacks when the Capacitor device disconnects externally', async () => {
        const callbacks = mockRequiredNotificationsOnly();
        const adapter = new CapacitorBLEAdapter();
        const onDisconnect = vi.fn();
        const onData = vi.fn();
        await adapter.connect('device-a', onDisconnect);
        await adapter.startSensorNotifications(onData);
        callbacks.get(CHARACTERISTIC_UUIDS.APPARENT_WIND_DIRECTION)?.(uint16LE(4200));
        callbacks.get(CHARACTERISTIC_UUIDS.APPARENT_WIND_SPEED)?.(uint16LE(123));
        callbacks.get(CHARACTERISTIC_UUIDS.TEMPERATURE)?.(int16LE(2450));
        expect(onData).toHaveBeenCalledTimes(3);
        capacitorDisconnectCallback?.('device-a');
        expect(onDisconnect).toHaveBeenCalledOnce();
        expect(adapter.getConnectionState()).toBe('disconnected');
        callbacks.get(CHARACTERISTIC_UUIDS.APPARENT_WIND_DIRECTION)?.(uint16LE(4300));
        callbacks.get(CHARACTERISTIC_UUIDS.APPARENT_WIND_SPEED)?.(uint16LE(150));
        callbacks.get(CHARACTERISTIC_UUIDS.TEMPERATURE)?.(int16LE(2500));
        expect(onData).toHaveBeenCalledTimes(3);
    });
    it('returns null when the Capacitor I2C config characteristic is unavailable', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        bleClientMock.write.mockRejectedValue(new Error('characteristic not found'));
        const adapter = new CapacitorBLEAdapter();
        await adapter.connect('device-a');
        await expect(adapter.getDeviceModeStatus()).resolves.toBeNull();
        await expect(adapter.getCardLogControlStatus()).resolves.toBeNull();
        await expect(adapter.setCardLogging(false)).resolves.toBeNull();
        await expect(adapter.getI2cConfigStatus()).resolves.toBeNull();
        await expect(adapter.writeI2cConfig({ op: 'save' })).resolves.toBeNull();
        await adapter.disconnect();
        consoleWarn.mockRestore();
    });
    it('reads Capacitor device mode status', async () => {
        bleClientMock.read.mockImplementation(async (_deviceId: string, _serviceUuid: string, characteristicUuid: string) => {
            void _deviceId;
            void _serviceUuid;
            if (characteristicUuid === CHARACTERISTIC_UUIDS.DEVICE_MODE) {
                return dataViewFromBytes(1, 1, 0x05, 0);
            }
            throw new Error('optional characteristic not found');
        });
        const adapter = new CapacitorBLEAdapter();
        await adapter.connect('device-a');
        await expect(adapter.getDeviceModeStatus()).resolves.toMatchObject({
            mode: 'i2cMeasure',
            phy: '1m',
            i2cMeasureActive: true,
        });
        await adapter.disconnect();
    });
    it('subscribes to Capacitor device mode notifications', async () => {
        const callbacks = new Map<string, NotificationCallback>();
        bleClientMock.startNotifications.mockImplementation(async (_deviceId: string, serviceUuid: string, characteristicUuid: string, callback: NotificationCallback) => {
            void _deviceId;
            if (serviceUuid !== SERVICE_UUIDS.ULSA_WIND || characteristicUuid !== CHARACTERISTIC_UUIDS.DEVICE_MODE) {
                throw new Error('unexpected notification');
            }
            callbacks.set(characteristicUuid, callback);
        });
        const adapter = new CapacitorBLEAdapter();
        const onStatus = vi.fn();
        await adapter.connect('device-a');
        await expect(adapter.startDeviceModeNotifications(onStatus)).resolves.toBe(true);
        callbacks.get(CHARACTERISTIC_UUIDS.DEVICE_MODE)?.(dataViewFromBytes(1, 3, 0x03, 1));
        expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'uartBridge',
            phy: 'reserved',
            uartBridgeEnabled: true,
        }));
        await adapter.stopDeviceModeNotifications();
        expect(bleClientMock.stopNotifications).toHaveBeenCalledWith('device-a', SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.DEVICE_MODE);
        await adapter.disconnect();
    });
    it('subscribes to card log detail without changing standard sensor notification ownership', async () => {
        const callbacks = new Map<string, NotificationCallback>();
        bleClientMock.startNotifications.mockImplementation(async (_deviceId: string, serviceUuid: string, characteristicUuid: string, callback: NotificationCallback) => {
            void _deviceId;
            if (serviceUuid !== SERVICE_UUIDS.ULSA_WIND || characteristicUuid !== CHARACTERISTIC_UUIDS.CARD_LOG_DETAIL) {
                throw new Error('unexpected notification');
            }
            callbacks.set(characteristicUuid, callback);
        });
        const adapter = new CapacitorBLEAdapter();
        const onStatus = vi.fn();
        await adapter.connect('device-a');
        await expect(adapter.startCardLogDetailNotifications(onStatus)).resolves.toBe(true);
        callbacks.get(CHARACTERISTIC_UUIDS.CARD_LOG_DETAIL)?.(createCardLogDetailStatus(true));
        expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({
            loggingEnabled: true,
            recordingRequested: true,
            cardState: 4,
        }));
        await adapter.stopCardLogDetailNotifications();
        callbacks.get(CHARACTERISTIC_UUIDS.CARD_LOG_DETAIL)?.(createCardLogDetailStatus(false));
        expect(onStatus).toHaveBeenCalledTimes(1);
        expect(bleClientMock.stopNotifications).toHaveBeenCalledWith('device-a', SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.CARD_LOG_DETAIL);
        await adapter.disconnect();
    });
    it('writes Capacitor I2C config commands and returns the parsed final status', async () => {
        vi.useFakeTimers();
        bleClientMock.read.mockResolvedValue(createI2cConfigStatus(0x20, 0x00));
        const adapter = new CapacitorBLEAdapter();
        await adapter.connect('device-a');
        const writePromise = adapter.writeI2cConfig({ op: 'save' });
        await vi.advanceTimersByTimeAsync(200);
        const status = await writePromise;
        expect(bleClientMock.write).toHaveBeenCalledWith('device-a', SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.I2C_CONFIG_CONTROL, expect.any(DataView));
        const payload = bleClientMock.write.mock.calls[0][3] as DataView;
        expect(Array.from({ length: payload.byteLength }, (_, index) => {
            void _;
            return payload.getUint8(index);
        })).toEqual([0x20]);
        expect(status).toMatchObject({
            lastOp: 'save',
            result: 'ok',
            nodeId: 7,
            avgCycle: 16,
            i2cAddress: 0x42,
            detected: true,
            configWriteSupported: true,
        });
        await adapter.disconnect();
        vi.useRealTimers();
    });
    it('writes Capacitor カードログ control commands and returns the parsed final status', async () => {
        vi.useFakeTimers();
        bleClientMock.read.mockImplementation(async (_deviceId: string, _serviceUuid: string, characteristicUuid: string) => {
            void _deviceId;
            void _serviceUuid;
            if (characteristicUuid === CHARACTERISTIC_UUIDS.CARD_LOG_CONTROL) {
                return createCardLogControlStatus(0x02, 0x00, 0x01);
            }
            throw new Error('optional characteristic not found');
        });
        const adapter = new CapacitorBLEAdapter();
        await adapter.connect('device-a');
        await expect(adapter.getCardLogControlStatus()).resolves.toMatchObject({
            cardAvailable: true,
            loggingEnabled: false,
        });
        const writePromise = adapter.setCardLogging(false);
        await vi.advanceTimersByTimeAsync(200);
        const status = await writePromise;
        expect(bleClientMock.write).toHaveBeenCalledWith('device-a', SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.CARD_LOG_CONTROL, expect.any(DataView));
        const payload = bleClientMock.write.mock.calls[0][3] as DataView;
        expect(Array.from({ length: payload.byteLength }, (_, index) => {
            void _;
            return payload.getUint8(index);
        })).toEqual([0x02]);
        expect(status).toMatchObject({
            lastOp: 'stop',
            result: 'ok',
            cardAvailable: true,
            loggingEnabled: false,
        });
        await adapter.disconnect();
        vi.useRealTimers();
    });
    it('uses the dedicated RTC timezone characteristic and correlates its generation', async () => {
        vi.useFakeTimers();
        let generation = 7;
        let lastOperation = 0;
        bleClientMock.read.mockImplementation(async (_deviceId: string, serviceUuid: string, characteristicUuid: string) => {
            void _deviceId;
            if (serviceUuid === SERVICE_UUIDS.ULSA_WIND
                && characteristicUuid === CHARACTERISTIC_UUIDS.RTC_TIMEZONE_CONTROL) {
                return createRtcTimezoneStatus(generation, lastOperation);
            }
            throw new Error('optional characteristic not found');
        });
        bleClientMock.write.mockImplementation(async () => {
            generation = 8;
            lastOperation = 2;
        });
        const adapter = new CapacitorBLEAdapter();
        await adapter.connect('device-a');
        const writePromise = adapter.writeRtcTimezone({
            op: 'sync_utc_and_zone',
            zoneId: 367396520,
            unixSeconds: 1787030400,
        });
        await vi.advanceTimersByTimeAsync(100);
        const status = await writePromise;
        expect(bleClientMock.write).toHaveBeenCalledWith('device-a', SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.RTC_TIMEZONE_CONTROL, expect.any(DataView));
        const payload = bleClientMock.write.mock.calls[0][3] as DataView;
        expect(payload.byteLength).toBe(14);
        expect(payload.getUint8(0)).toBe(2);
        expect(payload.getUint32(2, true)).toBe(367396520);
        expect(payload.getBigInt64(6, true)).toBe(1787030400n);
        expect(status).toMatchObject({
            lastOperation: 'sync_utc_and_zone',
            operationGeneration: 8,
            zoneId: 367396520,
        });
        await adapter.disconnect();
        vi.useRealTimers();
    });
});
