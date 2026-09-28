import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebBLEAdapter } from './WebBLEAdapter';
import { CHARACTERISTIC_UUIDS, SERVICE_UUIDS } from './bleConstants';
import { ULSA_EVO_WEB_DEVICE_NAME_PREFIX } from './webBleDiscovery';
vi.mock('./platformDetector', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./platformDetector')>();
    return {
        ...actual,
        isChromeBrowser: vi.fn(() => true),
    };
});
type MockFunction = ReturnType<typeof vi.fn>;
type CharacteristicMock = {
    uuid: string;
    value?: DataView;
    properties: BluetoothCharacteristicProperties;
    addEventListener: MockFunction;
    removeEventListener: MockFunction;
    startNotifications: MockFunction;
    stopNotifications: MockFunction;
    readValue: MockFunction;
    writeValue: MockFunction;
    emit: (value: DataView) => void;
};
type ServiceMock = {
    uuid: string;
    setCharacteristic: (uuid: string, characteristic: CharacteristicMock) => void;
    getCharacteristic: MockFunction;
    getCharacteristics: MockFunction;
};
type GattServerMock = {
    connected: boolean;
    connect: MockFunction;
    disconnect: MockFunction;
    getPrimaryServices: MockFunction;
    getPrimaryService: MockFunction;
};
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
    view.setInt16(20, 0, true);
    view.setUint16(22, generation, true);
    view.setUint16(24, 2025, true);
    view.setUint8(26, 'b'.charCodeAt(0));
    return view;
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
const createCardLogDetailStatus = (loggingEnabled: boolean): DataView => {
    const value = new DataView(new ArrayBuffer(20));
    value.setUint8(0, 2);
    value.setUint8(1, loggingEnabled ? 0x07 : 0x05);
    value.setUint8(2, loggingEnabled ? 4 : 3);
    value.setUint8(5, loggingEnabled ? 0x01 : 0x08);
    return value;
};
const createCharacteristic = (uuid: string, properties: Partial<BluetoothCharacteristicProperties> = { notify: true, read: true }): CharacteristicMock => {
    let handler: EventListenerOrEventListenerObject | null = null;
    const characteristic: CharacteristicMock = {
        uuid,
        value: undefined as DataView | undefined,
        properties: {
            broadcast: false,
            read: false,
            writeWithoutResponse: false,
            write: false,
            notify: false,
            indicate: false,
            authenticatedSignedWrites: false,
            reliableWrite: false,
            writableAuxiliaries: false,
            ...properties,
        },
        addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
            void _type;
            handler = listener;
        }),
        removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
            void _type;
            if (handler === listener) {
                handler = null;
            }
        }),
        startNotifications: vi.fn(async () => characteristic as unknown as BluetoothRemoteGATTCharacteristic),
        stopNotifications: vi.fn(async () => characteristic as unknown as BluetoothRemoteGATTCharacteristic),
        readValue: vi.fn(async () => characteristic.value ?? dataViewFromBytes(0)),
        writeValue: vi.fn(async () => undefined),
        emit: (value: DataView) => {
            characteristic.value = value;
            if (typeof handler === 'function') {
                handler({ target: characteristic } as unknown as Event);
            }
            else if (handler) {
                handler.handleEvent({ target: characteristic } as unknown as Event);
            }
        },
    };
    return characteristic;
};
const createService = (uuid: string): ServiceMock => {
    const characteristics = new Map<string, CharacteristicMock>();
    const service: ServiceMock = {
        uuid,
        setCharacteristic: (characteristicUuid: string, characteristic: CharacteristicMock) => {
            characteristics.set(characteristicUuid, characteristic);
        },
        getCharacteristic: vi.fn(async (characteristicUuid: string) => {
            const characteristic = characteristics.get(characteristicUuid);
            if (!characteristic) {
                throw new Error(`characteristic not found: ${characteristicUuid}`);
            }
            return characteristic as unknown as BluetoothRemoteGATTCharacteristic;
        }),
        getCharacteristics: vi.fn(async () => [...characteristics.values()] as unknown as BluetoothRemoteGATTCharacteristic[]),
    };
    return service;
};
const installWebBluetoothMock = (services: ServiceMock[]) => {
    const serviceMap = new Map(services.map((service) => [service.uuid, service]));
    let gattDisconnectHandler: EventListenerOrEventListenerObject | null = null;
    const server: GattServerMock = {
        connected: false,
        connect: vi.fn(async () => {
            server.connected = true;
            return server as unknown as BluetoothRemoteGATTServer;
        }),
        disconnect: vi.fn(() => {
            server.connected = false;
        }),
        getPrimaryServices: vi.fn(async () => services as unknown as BluetoothRemoteGATTService[]),
        getPrimaryService: vi.fn(async (serviceUuid: string) => {
            const service = serviceMap.get(serviceUuid);
            if (!service) {
                throw new Error(`service not found: ${serviceUuid}`);
            }
            return service as unknown as BluetoothRemoteGATTService;
        }),
    };
    const device = {
        id: 'web-device-a',
        name: 'ULSA EVO #7',
        gatt: server,
        addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
            if (type === 'gattserverdisconnected') {
                gattDisconnectHandler = listener;
            }
        }),
        removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
            if (type === 'gattserverdisconnected' && gattDisconnectHandler === listener) {
                gattDisconnectHandler = null;
            }
        }),
    };
    Object.defineProperty(navigator, 'bluetooth', {
        configurable: true,
        value: {
            requestDevice: vi.fn(async () => device),
            getAvailability: vi.fn(async () => true),
        },
    });
    const emitGattDisconnect = () => {
        if (typeof gattDisconnectHandler === 'function') {
            gattDisconnectHandler(new Event('gattserverdisconnected'));
        }
        else if (gattDisconnectHandler) {
            gattDisconnectHandler.handleEvent(new Event('gattserverdisconnected'));
        }
    };
    return { device, server, emitGattDisconnect };
};
const createRequiredEnvironmentService = () => {
    const environmentalService = createService(SERVICE_UUIDS.ENVIRONMENTAL_SENSING);
    const windDirection = createCharacteristic(CHARACTERISTIC_UUIDS.APPARENT_WIND_DIRECTION);
    const windSpeed = createCharacteristic(CHARACTERISTIC_UUIDS.APPARENT_WIND_SPEED);
    const temperature = createCharacteristic(CHARACTERISTIC_UUIDS.TEMPERATURE);
    environmentalService.setCharacteristic(CHARACTERISTIC_UUIDS.APPARENT_WIND_DIRECTION, windDirection);
    environmentalService.setCharacteristic(CHARACTERISTIC_UUIDS.APPARENT_WIND_SPEED, windSpeed);
    environmentalService.setCharacteristic(CHARACTERISTIC_UUIDS.TEMPERATURE, temperature);
    return { environmentalService, windDirection, windSpeed, temperature };
};
const createI2cConfigStatus = (lastOp: number, result: number): DataView => dataViewFromBytes(1, lastOp, result, 0, 0, 0, 7, 16, 0, 0x42, 1, 100, 0, 6, 0x42, 0x06);
const createCardLogControlStatus = (lastOp: number, result: number, flags = 0x03): DataView => dataViewFromBytes(1, lastOp, result, 3, flags, 0);
const flushBackgroundBleTasks = async (): Promise<void> => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
};
describe('WebBLEAdapter', () => {
    it('reads extended card counters through the shared v2 parser', async () => {
        const service = createService(SERVICE_UUIDS.ULSA_WIND);
        const characteristic = createCharacteristic(CHARACTERISTIC_UUIDS.CARD_LOG_DETAIL, { read: true });
        const value = new DataView(new ArrayBuffer(36));
        value.setUint8(0, 2);
        value.setUint8(5, 5);
        value.setUint32(20, 1234, true);
        value.setUint32(24, 9, true);
        characteristic.readValue.mockResolvedValue(value);
        service.setCharacteristic(CHARACTERISTIC_UUIDS.CARD_LOG_DETAIL, characteristic);
        installWebBluetoothMock([service]);
        const adapter = new WebBLEAdapter();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        expect(await adapter.getCardLogDetailStatus()).toMatchObject({
            syncedLogCount: 1234, droppedLogCount: 9, recovering: true,
        });
        await adapter.disconnect();
    });
    beforeEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
        vi.unstubAllEnvs();
        Reflect.deleteProperty(navigator, 'bluetooth');
    });
    it('uses BLE wording for a user-facing identify connection error', async () => {
        const adapter = new WebBLEAdapter();
        await expect(adapter.identifyDevice('web-device-a'))
            .rejects.toThrow('デバイス識別には有効なWeb BLE接続が必要です');
    });
    it('uses the environmental service with a ULSA EVO name fallback in the Web chooser', async () => {
        const { environmentalService } = createRequiredEnvironmentService();
        installWebBluetoothMock([environmentalService]);
        const adapter = new WebBLEAdapter();
        await adapter.scanAndSelect();
        const requestDevice = (navigator.bluetooth as Bluetooth & {
            requestDevice: MockFunction;
        }).requestDevice;
        expect(requestDevice).toHaveBeenCalledWith({
            filters: [
                { services: [SERVICE_UUIDS.ENVIRONMENTAL_SENSING] },
                { namePrefix: ULSA_EVO_WEB_DEVICE_NAME_PREFIX }
            ],
            optionalServices: [
                SERVICE_UUIDS.ENVIRONMENTAL_SENSING,
                SERVICE_UUIDS.CURRENT_TIME,
                SERVICE_UUIDS.DEVICE_INFORMATION,
                SERVICE_UUIDS.ULSA_WIND
            ],
        });
    });
    it('does not enumerate all GATT services and characteristics in a user build', async () => {
        const { environmentalService } = createRequiredEnvironmentService();
        const { server } = installWebBluetoothMock([environmentalService]);
        const adapter = new WebBLEAdapter();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        await adapter.startSensorNotifications(vi.fn());
        expect(server.getPrimaryServices).not.toHaveBeenCalled();
        expect(environmentalService.getCharacteristics).not.toHaveBeenCalled();
        await adapter.disconnect();
    });
    it('emits each Web standard field independently', async () => {
        const { environmentalService, windDirection, windSpeed, temperature } = createRequiredEnvironmentService();
        installWebBluetoothMock([environmentalService]);
        const adapter = new WebBLEAdapter();
        const onData = vi.fn();
        const device = await adapter.scanAndSelect();
        expect(device).toMatchObject({ deviceId: 'web-device-a', name: 'ULSA EVO #7', nodeId: 7 });
        await adapter.connect(device!.deviceId);
        const result = await adapter.startSensorNotifications(onData);
        expect(result.required).toEqual({ windDirection: true, windSpeed: true, temperature: true });
        expect(result.startedCount).toBe(3);
        temperature.emit(int16LE(2150));
        expect(onData).toHaveBeenCalledTimes(1);
        const firstEvent = onData.mock.calls[0][0];
        expect(firstEvent.changedField).toBe('temperature');
        expect(Number.isNaN(firstEvent.latestSnapshot.windDirection)).toBe(true);
        expect(Number.isNaN(firstEvent.latestSnapshot.windSpeed)).toBe(true);
        expect(firstEvent.latestSnapshot.temperature).toBe(21.5);
        windDirection.emit(uint16LE(9000));
        windSpeed.emit(uint16LE(234));
        temperature.emit(int16LE(2160));
        expect(onData).toHaveBeenCalledTimes(4);
        expect(onData).toHaveBeenLastCalledWith(expect.objectContaining({
            changedField: 'temperature',
            latestSnapshot: expect.objectContaining({ windDirection: 90, windSpeed: 2.34, temperature: 21.6 }),
        }));
        await adapter.disconnect();
    });
    it('starts standard notifications without overlapping single-flight GATT operations', async () => {
        const { environmentalService, windDirection, windSpeed, temperature } = createRequiredEnvironmentService();
        installWebBluetoothMock([environmentalService]);
        let inFlight = false;
        let overlapErrors = 0;
        for (const characteristic of [windDirection, windSpeed, temperature]) {
            characteristic.startNotifications.mockImplementation(async () => {
                if (inFlight) {
                    overlapErrors++;
                    throw new Error('GATT operation already in progress');
                }
                inFlight = true;
                await new Promise<void>((resolve) => setTimeout(resolve, 10));
                inFlight = false;
                return characteristic as unknown as BluetoothRemoteGATTCharacteristic;
            });
        }
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const adapter = new WebBLEAdapter();
        try {
            const device = await adapter.scanAndSelect();
            await adapter.connect(device!.deviceId);
            const result = await adapter.startSensorNotifications(vi.fn());
            expect(result.required).toEqual({ windDirection: true, windSpeed: true, temperature: true });
            expect(overlapErrors).toBe(0);
        }
        finally {
            await adapter.disconnect();
            consoleError.mockRestore();
        }
    });
    it('does not start the next standard subscription while one is still pending', async () => {
        const { environmentalService, windDirection, windSpeed, temperature } = createRequiredEnvironmentService();
        installWebBluetoothMock([environmentalService]);
        let completeDirection!: (characteristic: BluetoothRemoteGATTCharacteristic) => void;
        windDirection.startNotifications.mockImplementation(() => new Promise((resolve) => {
            completeDirection = resolve;
        }));
        const adapter = new WebBLEAdapter();
        try {
            const device = await adapter.scanAndSelect();
            await adapter.connect(device!.deviceId);
            const startup = adapter.startSensorNotifications(vi.fn());
            await vi.waitFor(() => expect(windDirection.startNotifications).toHaveBeenCalledOnce());
            expect(windSpeed.startNotifications).not.toHaveBeenCalled();
            expect(temperature.startNotifications).not.toHaveBeenCalled();
            completeDirection(windDirection as unknown as BluetoothRemoteGATTCharacteristic);
            expect((await startup).required).toEqual({ windDirection: true, windSpeed: true, temperature: true });
        }
        finally {
            await adapter.disconnect();
        }
    });
    it('removes a listener when a standard notification subscription fails', async () => {
        const { environmentalService, windSpeed } = createRequiredEnvironmentService();
        installWebBluetoothMock([environmentalService]);
        windSpeed.startNotifications.mockRejectedValue(new Error('GATT operation already in progress'));
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const adapter = new WebBLEAdapter();
        const onData = vi.fn();
        try {
            const device = await adapter.scanAndSelect();
            await adapter.connect(device!.deviceId);
            const result = await adapter.startSensorNotifications(onData);
            expect(result.required).toEqual({ windDirection: true, windSpeed: false, temperature: true });
            expect(windSpeed.removeEventListener).toHaveBeenCalledWith('characteristicvaluechanged', expect.any(Function));
            windSpeed.emit(uint16LE(123));
            expect(onData).not.toHaveBeenCalled();
        }
        finally {
            await adapter.disconnect();
            consoleError.mockRestore();
        }
    });
    it('does not duplicate standard listeners after disconnect and reconnect', async () => {
        const { environmentalService, windSpeed } = createRequiredEnvironmentService();
        installWebBluetoothMock([environmentalService]);
        const adapter = new WebBLEAdapter();
        const device = await adapter.scanAndSelect();
        const firstData = vi.fn();
        const secondData = vi.fn();
        await adapter.connect(device!.deviceId);
        await adapter.startSensorNotifications(firstData);
        windSpeed.emit(uint16LE(100));
        expect(firstData).toHaveBeenCalledOnce();
        await adapter.disconnect();
        await adapter.connect(device!.deviceId);
        await adapter.startSensorNotifications(secondData);
        windSpeed.emit(uint16LE(200));
        expect(firstData).toHaveBeenCalledOnce();
        expect(secondData).toHaveBeenCalledOnce();
        expect(windSpeed.removeEventListener).toHaveBeenCalledWith('characteristicvaluechanged', expect.any(Function));
        await adapter.disconnect();
    });
    it('emits product Web field events with the latest cached standard snapshot', async () => {
        const { environmentalService, windDirection, windSpeed, temperature } = createRequiredEnvironmentService();
        const ulsaService = createService(SERVICE_UUIDS.ULSA_WIND);
        const soundSpeed = createCharacteristic(CHARACTERISTIC_UUIDS.SOUND_SPEED);
        ulsaService.setCharacteristic(CHARACTERISTIC_UUIDS.SOUND_SPEED, soundSpeed);
        installWebBluetoothMock([environmentalService, ulsaService]);
        const adapter = new WebBLEAdapter();
        const onData = vi.fn();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        await adapter.startSensorNotifications(onData);
        await flushBackgroundBleTasks();
        const updates: Array<[
            CharacteristicMock,
            DataView
        ]> = [
            [windDirection, uint16LE(9000)], [windSpeed, uint16LE(234)], [temperature, int16LE(2150)],
            [windSpeed, uint16LE(300)], [windDirection, uint16LE(9100)],
            [soundSpeed, uint16LE(34420)], [temperature, int16LE(2160)]
        ];
        updates.forEach(([characteristic, value]) => characteristic.emit(value));
        expect(onData).toHaveBeenCalledTimes(updates.length);
        expect(ulsaService.getCharacteristic).not.toHaveBeenCalledWith(CHARACTERISTIC_UUIDS.WIND_AXIS_SPEEDS);
        expect(onData).toHaveBeenLastCalledWith(expect.objectContaining({
            changedField: 'temperature', latestSnapshot: expect.objectContaining({
                windDirection: 91, windSpeed: 3, temperature: 21.6, soundSpeed: 344.2,
                windSpeedA: null, windSpeedB: null,
            }),
        }));
        await adapter.disconnect();
    });
    it('throws and cleans up only when all standard Web characteristics are missing', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const missingTemperatureService = createService(SERVICE_UUIDS.ENVIRONMENTAL_SENSING);
        const { server } = installWebBluetoothMock([missingTemperatureService]);
        const adapter = new WebBLEAdapter();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        await expect(adapter.startSensorNotifications(vi.fn())).rejects.toThrow('標準センサー通知');
        expect(server.disconnect).not.toHaveBeenCalled();
        await adapter.disconnect();
        consoleWarn.mockRestore();
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
    ])('keeps Web measurement live when only $changedField is available', async ({ characteristicUuid, changedField, value, expectedValue, }) => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const environmentalService = createService(SERVICE_UUIDS.ENVIRONMENTAL_SENSING);
        const characteristic = createCharacteristic(characteristicUuid);
        environmentalService.setCharacteristic(characteristicUuid, characteristic);
        installWebBluetoothMock([environmentalService]);
        const adapter = new WebBLEAdapter();
        const onData = vi.fn();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        const result = await adapter.startSensorNotifications(onData);
        expect(Object.values(result.required).filter(Boolean)).toHaveLength(1);
        characteristic.emit(value);
        expect(onData).toHaveBeenCalledOnce();
        expect(onData.mock.calls[0][0]).toEqual(expect.objectContaining({
            changedField,
            latestSnapshot: expect.objectContaining({ [changedField]: expectedValue }),
        }));
        await adapter.disconnect();
        consoleWarn.mockRestore();
    });
    it('marks notified sensorStatus optional only after the first read succeeds', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { environmentalService, windDirection, windSpeed, temperature } = createRequiredEnvironmentService();
        const ulsaService = createService(SERVICE_UUIDS.ULSA_WIND);
        const sensorStatus = createCharacteristic(CHARACTERISTIC_UUIDS.SENSOR_STATUS, { read: true, notify: true });
        sensorStatus.value = dataViewFromBytes(5, 1, 2, 0xc0, 0x06, 0, 0);
        ulsaService.setCharacteristic(CHARACTERISTIC_UUIDS.SENSOR_STATUS, sensorStatus);
        installWebBluetoothMock([environmentalService, ulsaService]);
        const adapter = new WebBLEAdapter();
        const onData = vi.fn();
        const onSensorStatus = vi.fn();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        const result = await adapter.startSensorNotifications(onData, onSensorStatus);
        await flushBackgroundBleTasks();
        expect(sensorStatus.readValue).toHaveBeenCalledOnce();
        expect(result.optional.sensorStatus).toBe(true);
        expect(result.startedCount).toBe(4);
        expect(onData).toHaveBeenCalledTimes(1);
        expect(onData.mock.calls[0][0]).toEqual(expect.objectContaining({ changedField: 'sensorStatus' }));
        expect(onSensorStatus).toHaveBeenCalledWith({
            nodeId: 5, sensorStatus: 1, statusProtocolVersion: 2,
            statusFlags: 0xc0, serviceStatus: 0x06, activeCause: 0,
            ntcReadingStatus: 0,
        });
        windDirection.emit(uint16LE(4500));
        windSpeed.emit(uint16LE(345));
        temperature.emit(int16LE(2600));
        expect(onData).toHaveBeenCalledTimes(4);
        expect(onData).toHaveBeenLastCalledWith(expect.objectContaining({
            changedField: 'temperature',
            latestSnapshot: expect.objectContaining({
                windDirection: 45,
                windSpeed: 3.45,
                temperature: 26,
                sensorStatus: 1,
                nodeId: 5,
            }),
        }));
        await adapter.disconnect();
        consoleWarn.mockRestore();
    });
    it('falls back to reading sensorStatus when Notify startup fails', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { environmentalService } = createRequiredEnvironmentService();
        const ulsaService = createService(SERVICE_UUIDS.ULSA_WIND);
        const sensorStatus = createCharacteristic(CHARACTERISTIC_UUIDS.SENSOR_STATUS, { read: true, notify: true });
        sensorStatus.value = dataViewFromBytes(6, 0, 2, 0x90, 0x02, 4, 1);
        sensorStatus.startNotifications.mockRejectedValue(new Error('notify unavailable'));
        ulsaService.setCharacteristic(CHARACTERISTIC_UUIDS.SENSOR_STATUS, sensorStatus);
        installWebBluetoothMock([environmentalService, ulsaService]);
        const adapter = new WebBLEAdapter();
        const onSensorStatus = vi.fn();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        const result = await adapter.startSensorNotifications(vi.fn(), onSensorStatus);
        await flushBackgroundBleTasks();
        expect(result.required).toEqual({ windDirection: true, windSpeed: true, temperature: true });
        expect(result.optional.sensorStatus).toBe(true);
        expect(sensorStatus.readValue).toHaveBeenCalledOnce();
        expect(onSensorStatus).toHaveBeenCalledWith(expect.objectContaining({
            nodeId: 6,
            sensorStatus: 0,
            activeCause: 4,
        }));
        await adapter.disconnect();
        consoleWarn.mockRestore();
    });
    it('clears notification callbacks when the Web device disconnects externally', async () => {
        const { environmentalService, windDirection, windSpeed, temperature } = createRequiredEnvironmentService();
        const { emitGattDisconnect } = installWebBluetoothMock([environmentalService]);
        const adapter = new WebBLEAdapter();
        const onDisconnect = vi.fn();
        const onData = vi.fn();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId, onDisconnect);
        await adapter.startSensorNotifications(onData);
        windDirection.emit(uint16LE(9000));
        windSpeed.emit(uint16LE(234));
        temperature.emit(int16LE(2150));
        expect(onData).toHaveBeenCalledTimes(3);
        emitGattDisconnect();
        expect(onDisconnect).toHaveBeenCalledOnce();
        expect(adapter.getConnectionState()).toBe('disconnected');
        expect(windDirection.removeEventListener).toHaveBeenCalled();
        expect(windSpeed.removeEventListener).toHaveBeenCalled();
        expect(temperature.removeEventListener).toHaveBeenCalled();
        windDirection.emit(uint16LE(9100));
        windSpeed.emit(uint16LE(250));
        temperature.emit(int16LE(2200));
        expect(onData).toHaveBeenCalledTimes(3);
    });
    it('returns null when the Web I2C config characteristic is absent', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { environmentalService } = createRequiredEnvironmentService();
        installWebBluetoothMock([environmentalService]);
        const adapter = new WebBLEAdapter();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        await expect(adapter.getI2cConfigStatus()).resolves.toBeNull();
        await expect(adapter.writeI2cConfig({ op: 'save' })).resolves.toBeNull();
        await adapter.disconnect();
        consoleWarn.mockRestore();
    });
    it('returns null when the Web カードログ control characteristic is absent', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { environmentalService } = createRequiredEnvironmentService();
        installWebBluetoothMock([environmentalService]);
        const adapter = new WebBLEAdapter();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        await expect(adapter.getCardLogControlStatus()).resolves.toBeNull();
        await expect(adapter.setCardLogging(false)).resolves.toBeNull();
        await adapter.disconnect();
        consoleWarn.mockRestore();
    });
    it('returns null when the Web device mode characteristic is absent', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { environmentalService } = createRequiredEnvironmentService();
        installWebBluetoothMock([environmentalService]);
        const adapter = new WebBLEAdapter();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        await expect(adapter.getDeviceModeStatus()).resolves.toBeNull();
        await adapter.disconnect();
        consoleWarn.mockRestore();
    });
    it('reads Web device mode status', async () => {
        const { environmentalService } = createRequiredEnvironmentService();
        const ulsaService = createService(SERVICE_UUIDS.ULSA_WIND);
        const deviceMode = createCharacteristic(CHARACTERISTIC_UUIDS.DEVICE_MODE, { read: true });
        deviceMode.value = dataViewFromBytes(1, 3, 0x03, 1);
        ulsaService.setCharacteristic(CHARACTERISTIC_UUIDS.DEVICE_MODE, deviceMode);
        installWebBluetoothMock([environmentalService, ulsaService]);
        const adapter = new WebBLEAdapter();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        await expect(adapter.getDeviceModeStatus()).resolves.toMatchObject({
            mode: 'uartBridge',
            phy: 'reserved',
            uartBridgeEnabled: true,
        });
        await adapter.disconnect();
    });
    it('subscribes to Web device mode notifications', async () => {
        const { environmentalService } = createRequiredEnvironmentService();
        const ulsaService = createService(SERVICE_UUIDS.ULSA_WIND);
        const deviceMode = createCharacteristic(CHARACTERISTIC_UUIDS.DEVICE_MODE, { read: true, notify: true });
        ulsaService.setCharacteristic(CHARACTERISTIC_UUIDS.DEVICE_MODE, deviceMode);
        installWebBluetoothMock([environmentalService, ulsaService]);
        const adapter = new WebBLEAdapter();
        const onStatus = vi.fn();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        await expect(adapter.startDeviceModeNotifications(onStatus)).resolves.toBe(true);
        deviceMode.emit(dataViewFromBytes(1, 3, 0x03, 1));
        expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'uartBridge',
            phy: 'reserved',
            uartBridgeEnabled: true,
        }));
        await adapter.stopDeviceModeNotifications();
        deviceMode.emit(dataViewFromBytes(1, 1, 0x05, 0));
        expect(onStatus).toHaveBeenCalledTimes(1);
        expect(deviceMode.stopNotifications).toHaveBeenCalled();
        await adapter.disconnect();
    });
    it('subscribes to Web card log detail independently from standard sensor notifications', async () => {
        const { environmentalService } = createRequiredEnvironmentService();
        const ulsaService = createService(SERVICE_UUIDS.ULSA_WIND);
        const detail = createCharacteristic(CHARACTERISTIC_UUIDS.CARD_LOG_DETAIL, { read: true, notify: true });
        ulsaService.setCharacteristic(CHARACTERISTIC_UUIDS.CARD_LOG_DETAIL, detail);
        installWebBluetoothMock([environmentalService, ulsaService]);
        const adapter = new WebBLEAdapter();
        const onStatus = vi.fn();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        await expect(adapter.startCardLogDetailNotifications(onStatus)).resolves.toBe(true);
        detail.emit(createCardLogDetailStatus(true));
        expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({
            loggingEnabled: true,
            recordingRequested: true,
            cardState: 4,
        }));
        await adapter.stopCardLogDetailNotifications();
        detail.emit(createCardLogDetailStatus(false));
        expect(onStatus).toHaveBeenCalledTimes(1);
        expect(detail.stopNotifications).toHaveBeenCalledOnce();
        await adapter.disconnect();
    });
    it('tries the ULSA custom service even when the Chrome service list cache is incomplete', async () => {
        const { environmentalService } = createRequiredEnvironmentService();
        const ulsaService = createService(SERVICE_UUIDS.ULSA_WIND);
        const deviceMode = createCharacteristic(CHARACTERISTIC_UUIDS.DEVICE_MODE, { read: true });
        deviceMode.value = dataViewFromBytes(1, 1, 0x05, 0);
        ulsaService.setCharacteristic(CHARACTERISTIC_UUIDS.DEVICE_MODE, deviceMode);
        const { server } = installWebBluetoothMock([environmentalService, ulsaService]);
        server.getPrimaryServices.mockResolvedValueOnce([environmentalService] as unknown as BluetoothRemoteGATTService[]);
        const adapter = new WebBLEAdapter();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        await expect(adapter.getDeviceModeStatus()).resolves.toMatchObject({
            mode: 'i2cMeasure',
            i2cMeasureActive: true,
        });
        expect(server.getPrimaryService).toHaveBeenCalledWith(SERVICE_UUIDS.ULSA_WIND);
        await adapter.disconnect();
    });
    it('writes Web I2C config commands and returns the parsed final status', async () => {
        vi.useFakeTimers();
        const { environmentalService } = createRequiredEnvironmentService();
        const ulsaService = createService(SERVICE_UUIDS.ULSA_WIND);
        const i2cConfig = createCharacteristic(CHARACTERISTIC_UUIDS.I2C_CONFIG_CONTROL, { read: true, write: true });
        i2cConfig.value = createI2cConfigStatus(0x20, 0x00);
        ulsaService.setCharacteristic(CHARACTERISTIC_UUIDS.I2C_CONFIG_CONTROL, i2cConfig);
        installWebBluetoothMock([environmentalService, ulsaService]);
        const adapter = new WebBLEAdapter();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        const writePromise = adapter.writeI2cConfig({ op: 'save' });
        await vi.advanceTimersByTimeAsync(200);
        const status = await writePromise;
        expect(i2cConfig.writeValue).toHaveBeenCalledWith(expect.any(ArrayBuffer));
        const written = new Uint8Array(i2cConfig.writeValue.mock.calls[0][0] as ArrayBuffer);
        expect(Array.from(written)).toEqual([0x20]);
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
    it('writes Web カードログ control commands and returns the parsed final status', async () => {
        vi.useFakeTimers();
        const { environmentalService } = createRequiredEnvironmentService();
        const ulsaService = createService(SERVICE_UUIDS.ULSA_WIND);
        const cardLogControl = createCharacteristic(CHARACTERISTIC_UUIDS.CARD_LOG_CONTROL, { read: true, write: true });
        cardLogControl.value = createCardLogControlStatus(0x02, 0x00, 0x01);
        ulsaService.setCharacteristic(CHARACTERISTIC_UUIDS.CARD_LOG_CONTROL, cardLogControl);
        installWebBluetoothMock([environmentalService, ulsaService]);
        const adapter = new WebBLEAdapter();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        await expect(adapter.getCardLogControlStatus()).resolves.toMatchObject({
            cardAvailable: true,
            loggingEnabled: false,
        });
        const writePromise = adapter.setCardLogging(false);
        await vi.advanceTimersByTimeAsync(200);
        const status = await writePromise;
        expect(cardLogControl.writeValue).toHaveBeenCalledWith(expect.any(ArrayBuffer));
        const written = new Uint8Array(cardLogControl.writeValue.mock.calls[0][0] as ArrayBuffer);
        expect(Array.from(written)).toEqual([0x02]);
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
        const { environmentalService } = createRequiredEnvironmentService();
        const ulsaService = createService(SERVICE_UUIDS.ULSA_WIND);
        const rtcTimezone = createCharacteristic(CHARACTERISTIC_UUIDS.RTC_TIMEZONE_CONTROL, { read: true, write: true });
        rtcTimezone.value = createRtcTimezoneStatus(7);
        rtcTimezone.writeValue.mockImplementation(async () => {
            rtcTimezone.value = createRtcTimezoneStatus(8, 2);
        });
        ulsaService.setCharacteristic(CHARACTERISTIC_UUIDS.RTC_TIMEZONE_CONTROL, rtcTimezone);
        installWebBluetoothMock([environmentalService, ulsaService]);
        const adapter = new WebBLEAdapter();
        const device = await adapter.scanAndSelect();
        await adapter.connect(device!.deviceId);
        const writePromise = adapter.writeRtcTimezone({
            op: 'sync_utc_and_zone',
            zoneId: 367396520,
            unixSeconds: 1787030400,
        });
        await vi.advanceTimersByTimeAsync(100);
        const status = await writePromise;
        const payload = rtcTimezone.writeValue.mock.calls[0][0] as ArrayBuffer;
        const payloadView = new DataView(payload);
        expect(payloadView.byteLength).toBe(14);
        expect(payloadView.getUint8(0)).toBe(2);
        expect(payloadView.getUint32(2, true)).toBe(367396520);
        expect(payloadView.getBigInt64(6, true)).toBe(1787030400n);
        expect(status).toMatchObject({
            lastOperation: 'sync_utc_and_zone',
            operationGeneration: 8,
            zoneId: 367396520,
        });
        await adapter.disconnect();
        vi.useRealTimers();
    });
});
