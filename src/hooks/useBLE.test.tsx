import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBLE, type BLEDeviceInfo } from './useBLE';
import type { BLEConnectionState, IBLEAdapter, NotificationStartResult } from '../services/ble';
import type { DeviceInfo, DeviceModeStatus, LEDBrightnessStatus, CardLogControlStatus, CardLogDetailStatus, CardStatus, SensorData, RtcTimezoneStatus } from '../types/ble';
import { CARD_LOG_CONTROL_FALLBACK_REFRESH_MS } from './ble/constants';
import { useBleConnectionModal } from '../pages/dashboard/useBleConnectionModal';
vi.mock('../services/ble', () => ({
    BLENotSupportedError: class BLENotSupportedError extends Error {
    },
    getBLEPlatformInfo: vi.fn(() => ({
        platform: 'ios',
        adapterType: 'Capacitor',
        isSupported: true,
    })),
    getBLEAdapter: vi.fn(),
}));
const { BLENotSupportedError, getBLEAdapter } = await import('../services/ble');
const createNotificationResult = (overrides: Partial<NotificationStartResult> = {}): NotificationStartResult => ({
    required: {
        windDirection: true,
        windSpeed: true,
        temperature: true,
        ...overrides.required,
    },
    optional: {
        soundSpeed: false,
        headingSpeed: false,
        windAxisSpeeds: false,
        sensorStatus: false,
        ...overrides.optional,
    },
    startedCount: overrides.startedCount ?? 3,
});
const liveSample: SensorData = {
    windSpeed: 1.23,
    windSpeedA: null,
    windSpeedB: null,
    windDirection: 42,
    temperature: 24.5,
    soundSpeed: 344.2,
    headingSpeed: 0,
    sensorStatus: 0,
    timestamp: 1234,
};
const readyCardStatus = {
    cardState: 3,
    usagePercent: 12.5,
    freeSpaceMB: 7000,
    totalSpaceMB: 8000,
    usedSpaceMB: 1000,
    cardTypeCode: 4,
    cardType: 'cardhc' as const,
};
const readyCardLogControlStatus = {
    protocolVersion: 1,
    lastOpCode: 0x00,
    lastOp: 'read' as const,
    resultCode: 0,
    result: 'ok' as const,
    cardState: 3,
    flags: 0x03,
    cardAvailable: true,
    loggingEnabled: true,
    canLog: false,
    stopReasonCode: 0,
};
const readyStm32FirmwareVersion = {
    protocolVersion: 1,
    flags: 0x07,
    i2cClientPresent: true,
    detected: true,
    readOk: true,
    localError: 0,
    regVersion: 6,
    firmwareVersionRaw: 20260628,
    firmwareVersion: '20260628',
};
const readyDeviceModeStatus: DeviceModeStatus = {
    protocolVersion: 1,
    modeCode: 1,
    mode: 'i2cMeasure',
    flags: 0x05,
    phyCode: 0,
    phy: '1m',
    bleConnected: true,
    uartBridgeEnabled: false,
    i2cMeasureActive: true,
    commandMode: false,
    bootloaderMode: false,
    wifiPortalActive: false,
    stm32UpdateActive: false,
};
const readyI2cStatus = {
    protocolVersion: 1,
    lastOpCode: 0x20,
    lastOp: 'save' as const,
    resultCode: 0,
    result: 'ok' as const,
    remoteCommandStatus: 0,
    remoteLastError: 0,
    configFlags: 0,
    nodeId: 7,
    avgCycle: 16,
    windDirInstallMode: 0 as const,
    i2cAddress: 0x42,
    i2cSlaveEnabled: true,
    measurementIntervalMs: 100,
    localI2cError: 0,
    remoteRegisterVersion: 6,
    currentTargetI2cAddress: 0x42,
    rebootRequired: false,
    detected: true,
    configWriteSupported: true,
};
const readI2cStatus = {
    ...readyI2cStatus,
    lastOpCode: 0x00,
    lastOp: 'read' as const,
};
const createRtcTimezoneStatus = (overrides: Partial<RtcTimezoneStatus> = {}): RtcTimezoneStatus => ({
    protocolVersion: 1,
    flags: 0x1f,
    rtcDetected: true,
    rtcReadable: true,
    utcValid: true,
    zoneConfigured: true,
    nvsPersisted: true,
    dstActive: false,
    busy: false,
    error: false,
    lastOperationCode: 0,
    lastOperation: 'none',
    resultCode: 0,
    result: 'ok',
    zoneId: 367396520,
    rtcUnixSeconds: Math.floor(Date.now() / 1000),
    totalUtcOffsetMinutes: 540,
    standardUtcOffsetMinutes: 540,
    dstOffsetMinutes: 0,
    operationGeneration: 10,
    tzdbYear: 2025,
    tzdbRevisionLetter: 'b',
    tzdbVersion: '2025b',
    ...overrides,
});
const createAdapter = (): IBLEAdapter => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    scanAndSelect: vi.fn().mockResolvedValue(null),
    scanDevices: vi.fn().mockResolvedValue([]),
    stopScan: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    identifyDevice: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getConnectionState: vi.fn((): BLEConnectionState => 'disconnected'),
    startSensorNotifications: vi.fn().mockResolvedValue(createNotificationResult()),
    stopSensorNotifications: vi.fn().mockResolvedValue(undefined),
    getParseErrorStats: vi.fn(() => ({ count: 0, lastError: null })),
    getDeviceInfo: vi.fn().mockResolvedValue({
        firmwareRevision: '',
        softwareRevision: '',
        manufacturerName: '',
        modelNumber: '',
    }),
    getStm32FirmwareVersion: vi.fn().mockResolvedValue(null),
    getSampleMetadataStatus: vi.fn().mockResolvedValue(null),
    getDeviceHealthStatus: vi.fn().mockResolvedValue(null),
    getCapabilitiesStatus: vi.fn().mockResolvedValue(null),
    getLedBrightness: vi.fn().mockResolvedValue(null),
    setLedBrightness: vi.fn().mockResolvedValue(null),
    getLedWindReactive: vi.fn().mockResolvedValue(null),
    setLedWindReactive: vi.fn().mockResolvedValue(null),
    getOtaControlStatus: vi.fn().mockResolvedValue(null),
    writeOtaControl: vi.fn().mockResolvedValue(null),
    getStm32UpdateControlStatus: vi.fn().mockResolvedValue(null),
    writeStm32UpdateControl: vi.fn().mockResolvedValue(null),
    getDeviceResetStatus: vi.fn().mockResolvedValue(null),
    resetDevice: vi.fn().mockResolvedValue(null),
    getCardStatus: vi.fn().mockResolvedValue(null),
    getCardLogControlStatus: vi.fn().mockResolvedValue(null),
    getCardLogDetailStatus: vi.fn().mockResolvedValue(null),
    startCardLogDetailNotifications: vi.fn().mockResolvedValue(true),
    stopCardLogDetailNotifications: vi.fn().mockResolvedValue(undefined),
    getCardLogSettingsStatus: vi.fn().mockResolvedValue(null),
    setCardLogging: vi.fn().mockResolvedValue(null),
    writeCardLogSettings: vi.fn().mockResolvedValue(null),
    getDeviceModeStatus: vi.fn().mockResolvedValue(null),
    startDeviceModeNotifications: vi.fn().mockResolvedValue(false),
    stopDeviceModeNotifications: vi.fn().mockResolvedValue(undefined),
    getI2cConfigStatus: vi.fn().mockResolvedValue(null),
    writeI2cConfig: vi.fn().mockResolvedValue(null),
    getRtcTimezoneStatus: vi.fn().mockResolvedValue(null),
    writeRtcTimezone: vi.fn().mockResolvedValue(null),
    isSupported: vi.fn(() => true),
    isEnabled: vi.fn().mockResolvedValue(true),
});
describe('useBLE', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it('normalizes external initialization error branding before exposing it to the UI', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const adapter = createAdapter();
        vi.mocked(adapter.initialize).mockRejectedValue(new BLENotSupportedError('Bluetooth permission denied'));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.error).toBe('BLE permission denied'));
        expect(result.current.isSupported).toBe(false);
        consoleError.mockRestore();
    });
    it('normalizes external scan error branding before exposing it to the UI', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const adapter = createAdapter();
        vi.mocked(adapter.scanDevices!).mockRejectedValue(new Error('Bluetooth permission denied'));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.scanAndConnect();
        });
        expect(result.current.error).toBe('BLE permission denied');
        consoleError.mockRestore();
    });
    it('lists multiple Capacitor scan results without auto-connecting', async () => {
        const adapter = createAdapter();
        const devices: BLEDeviceInfo[] = [
            { deviceId: 'device-a', name: 'ULSA EVO #1', nodeId: 1, rssi: -70 },
            { deviceId: 'device-b', name: 'ULSA EVO #2', nodeId: 2, rssi: -45 }
        ];
        vi.mocked(adapter.scanDevices!).mockImplementation(async (onDeviceFound) => {
            if (onDeviceFound)
                devices.forEach(onDeviceFound);
            return devices;
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.scanAndConnect();
        });
        expect(adapter.connect).not.toHaveBeenCalled();
        expect(result.current.connectionState).toBe('disconnected');
        expect(result.current.availableDevices.map((device) => device.deviceId)).toEqual(['device-a', 'device-b']);
    });
    it('lists a single Capacitor scan result and waits for explicit selection', async () => {
        const adapter = createAdapter();
        const device: BLEDeviceInfo = { deviceId: 'device-a', name: 'ULSA EVO #1', nodeId: 1, rssi: -60 };
        vi.mocked(adapter.scanDevices!).mockImplementation(async (onDeviceFound) => {
            onDeviceFound?.(device);
            return [device];
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.scanAndConnect();
        });
        expect(adapter.connect).not.toHaveBeenCalled();
        expect(result.current.connectionState).toBe('disconnected');
        expect(result.current.availableDevices).toEqual([device]);
    });
    it('collects time-separated devices through the actual modal search controller', async () => {
        const adapter = createAdapter();
        let found!: (device: BLEDeviceInfo) => void;
        let finish!: (devices: BLEDeviceInfo[]) => void;
        vi.mocked(adapter.scanDevices!).mockImplementation((callback) => {
            found = callback!;
            return new Promise((resolve) => { finish = resolve; });
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => {
            const ble = useBLE();
            const modal = useBleConnectionModal({ connectionState: ble.connectionState,
                availableDevices: ble.availableDevices, error: ble.error, platformInfo: ble.platformInfo,
                scanAndConnect: ble.scanAndConnect, cancelScan: ble.cancelScan, connectToDevice: ble.connectToDevice });
            return { ble, modal };
        });
        await waitFor(() => expect(result.current.ble.isSupported).toBe(true));
        act(() => { result.current.modal.handleStatusCardClick(); });
        await waitFor(() => expect(found).toBeDefined());
        const devices = ['a', 'b', 'c'].map((id, index) => ({ deviceId: id, name: 'ULSA EVO #7', nodeId: 7, rssi: -70 + index * 10 }));
        for (const device of devices) {
            act(() => { found(device); });
            expect(adapter.stopScan).not.toHaveBeenCalled();
            expect(result.current.ble.connectionState).toBe('scanning');
        }
        expect(result.current.ble.availableDevices.map((device) => device.deviceId)).toEqual(['a', 'b', 'c']);
        await act(async () => { finish([...devices].reverse()); });
        expect(result.current.ble.availableDevices.map((device) => device.deviceId)).toEqual(['a', 'b', 'c']);
        expect(result.current.modal.isContinuousNativeScanActive).toBe(false);
        expect(adapter.connect).not.toHaveBeenCalled();
    });
    it('retains earlier native discoveries on rescan and updates RSSI without moving cards', async () => {
        const adapter = createAdapter();
        const first = { deviceId: 'a', name: 'ULSA EVO #7', nodeId: 7, rssi: -80 };
        const second = { deviceId: 'b', name: 'ULSA EVO #7', nodeId: 7, rssi: -40 };
        vi.mocked(adapter.scanDevices!).mockImplementationOnce(async (found) => {
            found?.(first);
            found?.(second);
            return [second, first];
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => { await result.current.scanAndConnect(); });
        let found!: (device: BLEDeviceInfo) => void;
        let finish!: (devices: BLEDeviceInfo[]) => void;
        vi.mocked(adapter.scanDevices!).mockImplementationOnce((callback) => {
            found = callback!;
            return new Promise((resolve) => { finish = resolve; });
        });
        let rescanning!: Promise<void>;
        act(() => { rescanning = result.current.scanAndConnect(); });
        expect(result.current.availableDevices.map((device) => device.deviceId)).toEqual(['a', 'b']);
        const third = { ...second, deviceId: 'c', rssi: -20 };
        act(() => { found({ ...first, rssi: -10 }); found(third); });
        await act(async () => { finish([third, { ...first, rssi: -10 }]); await rescanning; });
        expect(result.current.availableDevices.map((device) => device.deviceId)).toEqual(['a', 'b', 'c']);
        expect(result.current.availableDevices.map((device) => device.rssi)).toEqual([-10, -40, -20]);
        expect(adapter.connect).not.toHaveBeenCalled();
    });
    it('identifies a scanned device without entering connected state', async () => {
        const adapter = createAdapter();
        const device: BLEDeviceInfo = { deviceId: 'device-a', name: 'ULSA EVO #1', nodeId: 1, rssi: -60 };
        let resolveIdentify: (() => void) | null = null;
        vi.mocked(adapter.identifyDevice).mockImplementation(() => new Promise<void>((resolve) => {
            resolveIdentify = resolve;
        }));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        let identifyPromise: Promise<void> | null = null;
        act(() => {
            identifyPromise = result.current.identifyDevice(device);
        });
        await waitFor(() => expect(result.current.identifyingDeviceId).toBe('device-a'));
        expect(adapter.identifyDevice).toHaveBeenCalledWith('device-a');
        expect(adapter.connect).not.toHaveBeenCalled();
        expect(result.current.connectionState).toBe('disconnected');
        expect(resolveIdentify).not.toBeNull();
        await act(async () => {
            resolveIdentify?.();
            await identifyPromise;
        });
        expect(result.current.identifyingDeviceId).toBeNull();
    });
    it('does not replace a successful connection with a late identify error', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            const adapter = createAdapter();
            const device: BLEDeviceInfo = { deviceId: 'device-a', name: 'ULSA EVO #1', nodeId: 1, rssi: -60 };
            let rejectIdentify: ((error: Error) => void) | undefined;
            vi.mocked(adapter.identifyDevice).mockImplementation(() => new Promise<void>((_resolve, reject) => { void _resolve; rejectIdentify = reject; }));
            vi.mocked(getBLEAdapter).mockReturnValue(adapter);
            const { result } = renderHook(() => useBLE());
            await waitFor(() => expect(result.current.isSupported).toBe(true));
            let identifyPromise: Promise<void> | undefined;
            act(() => { identifyPromise = result.current.identifyDevice(device); });
            await waitFor(() => expect(result.current.identifyingDeviceId).toBe('device-a'));
            await act(async () => { await result.current.connectToDevice(device); });
            expect(result.current.connectionState).toBe('connected');
            await act(async () => {
                rejectIdentify?.(new Error('identify failed'));
                await identifyPromise;
            });
            expect(result.current.error).toBeNull();
        }
        finally {
            consoleError.mockRestore();
        }
    });
    it('allows identifying a discovered device while the native scan is still running', async () => {
        const adapter = createAdapter();
        const device: BLEDeviceInfo = { deviceId: 'device-a', name: 'ULSA EVO #1', nodeId: 1, rssi: -60 };
        let resolveScan: ((devices: BLEDeviceInfo[]) => void) | undefined;
        vi.mocked(adapter.scanDevices!).mockImplementation((onDeviceFound) => {
            onDeviceFound?.(device);
            return new Promise((resolve) => {
                resolveScan = resolve;
            });
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        let scanPromise: Promise<void> | undefined;
        act(() => {
            scanPromise = result.current.scanAndConnect();
        });
        await waitFor(() => expect(result.current.connectionState).toBe('scanning'));
        await act(async () => {
            await result.current.identifyDevice(device);
        });
        expect(adapter.identifyDevice).toHaveBeenCalledWith('device-a');
        expect(adapter.connect).not.toHaveBeenCalled();
        expect(result.current.connectionState).toBe('scanning');
        await act(async () => {
            resolveScan?.([device]);
            await scanPromise;
        });
        expect(result.current.connectionState).toBe('disconnected');
    });
    it('deduplicates scan results and keeps the strongest RSSI entry', async () => {
        const adapter = createAdapter();
        const devices: BLEDeviceInfo[] = [
            { deviceId: 'device-a', name: 'ULSA EVO #1', nodeId: 1, rssi: -80 },
            { deviceId: 'device-b', name: 'ULSA EVO #2', nodeId: 2, rssi: -50 },
            { deviceId: 'device-a', name: 'ULSA EVO #1', nodeId: 1, rssi: -40 }
        ];
        vi.mocked(adapter.scanDevices!).mockImplementation(async (onDeviceFound) => {
            if (onDeviceFound)
                devices.forEach(onDeviceFound);
            return devices;
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.scanAndConnect();
        });
        expect(adapter.connect).not.toHaveBeenCalled();
        expect(result.current.availableDevices).toHaveLength(2);
        expect(result.current.availableDevices.map((device) => [device.deviceId, device.rssi])).toEqual([
            ['device-a', -40],
            ['device-b', -50]
        ]);
    });
    it('keeps duplicate scan result references stable until visible device fields change', async () => {
        const adapter = createAdapter();
        const device: BLEDeviceInfo = { deviceId: 'device-a', name: 'ULSA EVO #1', nodeId: 1, rssi: -60 };
        const secondDevice: BLEDeviceInfo = { deviceId: 'device-b', name: 'ULSA EVO #2', nodeId: 2, rssi: -70 };
        let onDeviceFoundCallback: ((device: BLEDeviceInfo) => void) | undefined;
        let resolveScan: ((devices: BLEDeviceInfo[]) => void) | undefined;
        vi.mocked(adapter.scanDevices!).mockImplementation((onDeviceFound) => {
            onDeviceFoundCallback = onDeviceFound;
            return new Promise((resolve) => {
                resolveScan = resolve;
            });
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        let scanPromise: Promise<void> | undefined;
        act(() => {
            scanPromise = result.current.scanAndConnect();
        });
        await waitFor(() => expect(result.current.connectionState).toBe('scanning'));
        expect(onDeviceFoundCallback).toBeDefined();
        act(() => {
            onDeviceFoundCallback?.(device);
        });
        const firstAvailableDevicesRef = result.current.availableDevices;
        expect(firstAvailableDevicesRef).toEqual([device]);
        act(() => {
            onDeviceFoundCallback?.({ ...device });
        });
        expect(result.current.availableDevices).toBe(firstAvailableDevicesRef);
        act(() => {
            onDeviceFoundCallback?.({ ...device, rssi: -45 });
        });
        expect(result.current.availableDevices).not.toBe(firstAvailableDevicesRef);
        expect(result.current.availableDevices[0].rssi).toBe(-45);
        act(() => {
            onDeviceFoundCallback?.(secondDevice);
        });
        const scanCallbackDevicesRef = result.current.availableDevices;
        expect(scanCallbackDevicesRef.map((availableDevice) => availableDevice.deviceId)).toEqual(['device-a', 'device-b']);
        await act(async () => {
            resolveScan?.([{ ...device, rssi: -45 }, secondDevice]);
            await scanPromise;
        });
        expect(adapter.connect).not.toHaveBeenCalled();
        expect(result.current.connectionState).toBe('disconnected');
        expect(result.current.availableDevices).toBe(scanCallbackDevicesRef);
    });
    it('treats scan cancellation as a disconnected idle state', async () => {
        const adapter = createAdapter();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const cancelError = Object.assign(new Error('User cancelled'), { name: 'NotFoundError' });
        vi.mocked(adapter.scanDevices!).mockRejectedValue(cancelError);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.scanAndConnect();
        });
        expect(result.current.connectionState).toBe('disconnected');
        expect(result.current.error).toBeNull();
        expect(result.current.availableDevices).toEqual([]);
        expect(consoleError).not.toHaveBeenCalled();
        consoleError.mockRestore();
    });
    it('releases an active Capacitor scan through the public cancel action', async () => {
        const adapter = createAdapter();
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.cancelScan();
        });
        expect(adapter.stopScan).toHaveBeenCalledOnce();
    });
    it('does not enter connected state when required notifications fail', async () => {
        const adapter = createAdapter();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.mocked(adapter.startSensorNotifications).mockRejectedValue(new Error('必須センサー通知を開始できませんでした'));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(adapter.connect).toHaveBeenCalledWith('device-a', expect.any(Function));
        expect(adapter.disconnect).toHaveBeenCalled();
        expect(result.current.connectionState).toBe('disconnected');
        expect(result.current.connectedDevice).toBeNull();
        expect(result.current.error).toContain('必須センサー通知');
        consoleError.mockRestore();
    });
    it('does not start optional ESP32 device mode monitoring when required notifications fail', async () => {
        const adapter = createAdapter();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.mocked(adapter.getDeviceModeStatus).mockResolvedValue(readyDeviceModeStatus);
        vi.mocked(adapter.startDeviceModeNotifications).mockResolvedValue(true);
        vi.mocked(adapter.startSensorNotifications).mockRejectedValue(new Error('必須センサー通知を開始できませんでした'));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(adapter.getDeviceModeStatus).not.toHaveBeenCalled();
        expect(adapter.startDeviceModeNotifications).not.toHaveBeenCalled();
        expect(adapter.disconnect).toHaveBeenCalled();
        expect(result.current.connectionState).toBe('disconnected');
        expect(result.current.connectedDevice).toBeNull();
        expect(result.current.error).toContain('必須センサー通知');
        expect(result.current.deviceModeNotifyActive).toBe(false);
        expect(result.current.deviceModeSupported).toBeNull();
        consoleError.mockRestore();
    });
    it('does not let a pending optional ESP32 device mode read delay sensor notifications', async () => {
        const adapter = createAdapter();
        let resolveDeviceModeRead!: (status: DeviceModeStatus | null) => void;
        const deviceModeRead = new Promise<DeviceModeStatus | null>((resolve) => {
            resolveDeviceModeRead = resolve;
        });
        vi.mocked(adapter.getDeviceModeStatus).mockReturnValue(deviceModeRead);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        await waitFor(() => expect(adapter.getDeviceModeStatus).toHaveBeenCalledOnce());
        expect(adapter.startSensorNotifications).toHaveBeenCalledOnce();
        expect(vi.mocked(adapter.startSensorNotifications).mock.invocationCallOrder[0])
            .toBeLessThan(vi.mocked(adapter.getDeviceModeStatus).mock.invocationCallOrder[0]);
        expect(result.current.connectionState).toBe('connected');
        await act(async () => {
            resolveDeviceModeRead(readyDeviceModeStatus);
            await Promise.resolve();
        });
    });
    it('starts I2C config initialization even when another optional read never settles', async () => {
        const adapter = createAdapter();
        let resolveDeviceInfo!: (info: DeviceInfo) => void;
        vi.mocked(adapter.getDeviceInfo).mockReturnValue(new Promise((resolve) => {
            resolveDeviceInfo = resolve;
        }));
        vi.mocked(adapter.writeI2cConfig).mockResolvedValue(readI2cStatus);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(result.current.connectionState).toBe('connected');
        await waitFor(() => expect(adapter.writeI2cConfig).toHaveBeenCalledWith({ op: 'read' }));
        await waitFor(() => expect(result.current.i2cConfigStatus).toEqual(readI2cStatus));
        resolveDeviceInfo({
            firmwareRevision: '',
            softwareRevision: '',
            manufacturerName: '',
            modelNumber: '',
        });
    });
    it('does not apply delayed optional results after disconnect', async () => {
        const adapter = createAdapter();
        let resolveVersion!: (status: typeof readyStm32FirmwareVersion) => void;
        vi.mocked(adapter.getStm32FirmwareVersion).mockReturnValue(new Promise((resolve) => {
            resolveVersion = resolve;
        }));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        await waitFor(() => expect(adapter.getStm32FirmwareVersion).toHaveBeenCalledOnce());
        await act(async () => {
            await result.current.disconnect();
            resolveVersion(readyStm32FirmwareVersion);
            await Promise.resolve();
        });
        expect(result.current.connectionState).toBe('disconnected');
        expect(result.current.stm32FirmwareVersion).toBeNull();
        expect(result.current.stm32FirmwareVersionLastReadAt).toBeNull();
    });
    it('enters live state from wind speed while optional I2C initialization is pending', async () => {
        const adapter = createAdapter();
        let resolveI2cRead!: (status: typeof readI2cStatus) => void;
        vi.mocked(adapter.writeI2cConfig).mockReturnValue(new Promise((resolve) => {
            resolveI2cRead = resolve;
        }));
        vi.mocked(adapter.startSensorNotifications).mockImplementation(async (callback) => {
            callback({ changedField: 'windSpeed', latestSnapshot: liveSample, receivedAt: Date.now() });
            return createNotificationResult();
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        const timelineSamples: SensorData[] = [];
        const unsubscribe = result.current.subscribeTimelineSamples((sample) => timelineSamples.push(sample));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(result.current.connectionState).toBe('connected');
        await waitFor(() => expect(result.current.dataState).toBe('live'));
        expect(timelineSamples.at(-1)?.windSpeed).toBe(liveSample.windSpeed);
        unsubscribe();
        resolveI2cRead(readI2cStatus);
    });
    it('ignores sensor notifications retained by an old connection after disconnect', async () => {
        const adapter = createAdapter();
        let emitSensorData: Parameters<IBLEAdapter['startSensorNotifications']>[0] | undefined;
        vi.mocked(adapter.startSensorNotifications).mockImplementation(async (callback) => {
            emitSensorData = callback;
            return createNotificationResult();
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        const timelineSamples: SensorData[] = [];
        result.current.subscribeTimelineSamples((sample) => timelineSamples.push(sample));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
            await result.current.disconnect();
            emitSensorData?.({ changedField: 'windSpeed', latestSnapshot: liveSample, receivedAt: 9999 });
        });
        expect(result.current.sensorData).toBeNull();
        expect(timelineSamples).toEqual([]);
        expect(result.current.dataState).toBe('idle');
    });
    it('rejects a notification result with zero started characteristics', async () => {
        const adapter = createAdapter();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.mocked(adapter.startSensorNotifications).mockResolvedValue(createNotificationResult({
            required: { windDirection: false, windSpeed: false, temperature: false },
            startedCount: 0,
        }));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(adapter.disconnect).toHaveBeenCalled();
        expect(result.current.connectionState).toBe('disconnected');
        expect(result.current.error).toContain('標準センサー通知を1項目も開始できませんでした');
        consoleError.mockRestore();
    });
    it('keeps the connection when one standard notification is missing', async () => {
        const adapter = createAdapter();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.mocked(adapter.startSensorNotifications).mockResolvedValue(createNotificationResult({
            required: { windDirection: true, windSpeed: true, temperature: false },
            startedCount: 2,
        }));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(adapter.disconnect).not.toHaveBeenCalled();
        expect(result.current.connectionState).toBe('connected');
        expect(result.current.error).toBeNull();
        consoleError.mockRestore();
    });
    it('keeps disconnected state when the custom service is absent', async () => {
        const adapter = createAdapter();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.mocked(adapter.connect).mockRejectedValue(new Error('ULSA custom service not found'));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(adapter.startSensorNotifications).not.toHaveBeenCalled();
        expect(result.current.connectionState).toBe('disconnected');
        expect(result.current.connectedDevice).toBeNull();
        expect(result.current.error).toContain('custom service');
        consoleError.mockRestore();
    });
    it('marks connected data stale after samples stop arriving', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.startSensorNotifications).mockImplementation(async (callback) => {
            callback({ changedField: 'windSpeed', latestSnapshot: liveSample, receivedAt: Date.now() });
            return createNotificationResult();
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(result.current.connectionState).toBe('connected');
        await waitFor(() => expect(result.current.dataState).toBe('live'));
        await waitFor(() => expect(result.current.dataState).toBe('stale'), { timeout: 4500 });
    });
    it('updates the connected Node ID from STM32-origin Sensor Status data', async () => {
        const adapter = createAdapter();
        let emitSensorStatus: ((status: Pick<SensorData, 'nodeId' | 'sensorStatus'>) => void) | undefined;
        vi.mocked(adapter.startSensorNotifications).mockImplementation(async (_callback, onSensorStatus) => {
            void _callback;
            emitSensorStatus = onSensorStatus;
            return createNotificationResult({
                optional: {
                    soundSpeed: false,
                    headingSpeed: false,
                    windAxisSpeeds: false,
                    sensorStatus: true,
                },
                startedCount: 4,
            });
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1', nodeId: 1 });
        });
        await act(async () => {
            emitSensorStatus?.({ nodeId: 7, sensorStatus: 1 });
        });
        expect(result.current.connectedDevice).toMatchObject({
            deviceId: 'device-a',
            name: 'ULSA EVO #7',
            nodeId: 7,
        });
        expect(result.current.dataState).toBe('waiting');
    });
    it('normalizes sensor samples to fresh receipt-timestamped objects', async () => {
        const adapter = createAdapter();
        const receivedAt = 987654321;
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(receivedAt);
        vi.mocked(adapter.startSensorNotifications).mockImplementation(async (callback) => {
            callback({ changedField: 'windSpeed', latestSnapshot: liveSample, receivedAt });
            return createNotificationResult();
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        try {
            const { result } = renderHook(() => useBLE());
            await waitFor(() => expect(result.current.isSupported).toBe(true));
            const displayUpdates: Array<Parameters<Parameters<typeof result.current.subscribeDisplaySamples>[0]>[0]> = [];
            result.current.subscribeDisplaySamples((update) => displayUpdates.push(update));
            await act(async () => {
                await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
            });
            await waitFor(() => {
                expect(displayUpdates.at(-1)?.latestSample).not.toBe(liveSample);
                expect(displayUpdates.at(-1)?.latestSample).toEqual({
                    ...liveSample,
                    timestamp: receivedAt,
                });
                expect(displayUpdates.at(-1)?.lastStandardReceivedAt).toBe(receivedAt);
            });
        }
        finally {
            nowSpy.mockRestore();
        }
    });
    it('updates cards from every standard field but advances the timeline only for wind speed', async () => {
        const adapter = createAdapter();
        let emitSensorData: Parameters<IBLEAdapter['startSensorNotifications']>[0] | undefined;
        vi.mocked(adapter.startSensorNotifications).mockImplementation(async (callback) => {
            emitSensorData = callback;
            return createNotificationResult();
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        const timelineSamples: SensorData[] = [];
        const displayUpdates: Array<Parameters<Parameters<typeof result.current.subscribeDisplaySamples>[0]>[0]> = [];
        result.current.subscribeTimelineSamples((sample) => timelineSamples.push(sample));
        result.current.subscribeDisplaySamples((update) => displayUpdates.push(update));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        const receivedAt = Date.now();
        const temperatureSnapshot = { ...liveSample, temperature: 25.1 };
        act(() => {
            emitSensorData?.({ changedField: 'temperature', latestSnapshot: temperatureSnapshot, receivedAt });
        });
        await waitFor(() => expect(result.current.dataState).toBe('live'));
        await waitFor(() => expect(displayUpdates.at(-1)?.latestSample.temperature).toBe(25.1));
        await waitFor(() => expect(displayUpdates.at(-1)?.standardFieldReceivedAt.temperature).toBe(receivedAt));
        expect(timelineSamples).toEqual([]);
        const directionSnapshot = { ...temperatureSnapshot, windDirection: 91 };
        act(() => {
            emitSensorData?.({ changedField: 'windDirection', latestSnapshot: directionSnapshot, receivedAt: receivedAt + 1 });
        });
        await waitFor(() => expect(displayUpdates.at(-1)?.latestSample.windDirection).toBe(91));
        await waitFor(() => expect(displayUpdates.at(-1)?.standardFieldReceivedAt.windDirection).toBe(receivedAt + 1));
        expect(timelineSamples).toEqual([]);
        const speedSnapshot = { ...directionSnapshot, windSpeed: 2.5 };
        act(() => {
            emitSensorData?.({ changedField: 'windSpeed', latestSnapshot: speedSnapshot, receivedAt: receivedAt + 2 });
        });
        await waitFor(() => expect(displayUpdates.at(-1)?.standardFieldReceivedAt.windSpeed).toBe(receivedAt + 2));
        await waitFor(() => expect(timelineSamples.at(-1)).toEqual({
            ...speedSnapshot,
            timestamp: receivedAt + 2,
        }));
    });
    it('publishes every wind-speed timeline sample without waiting for a React display frame', async () => {
        const adapter = createAdapter();
        let emitSensorData: Parameters<IBLEAdapter['startSensorNotifications']>[0] | undefined;
        vi.mocked(adapter.startSensorNotifications).mockImplementation(async (callback) => {
            emitSensorData = callback;
            return createNotificationResult();
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        const timelineSamples: SensorData[] = [];
        result.current.subscribeTimelineSamples((sample) => timelineSamples.push(sample));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        act(() => {
            for (let index = 0; index < 10; index += 1) {
                emitSensorData?.({
                    changedField: 'windSpeed',
                    latestSnapshot: { ...liveSample, windSpeed: index },
                    receivedAt: 1000 + index,
                });
            }
        });
        expect(timelineSamples).toHaveLength(10);
        expect(timelineSamples.map(({ windSpeed }) => windSpeed)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
    it('keeps timeline samples but suppresses display commits while the document is hidden', async () => {
        const adapter = createAdapter();
        let emitSensorData: Parameters<IBLEAdapter['startSensorNotifications']>[0] | undefined;
        let visibilityState: DocumentVisibilityState = 'visible';
        const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get')
            .mockImplementation(() => visibilityState);
        vi.mocked(adapter.startSensorNotifications).mockImplementation(async (callback) => {
            emitSensorData = callback;
            return createNotificationResult();
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        const timelineSamples: SensorData[] = [];
        const displayUpdates: Array<Parameters<Parameters<typeof result.current.subscribeDisplaySamples>[0]>[0]> = [];
        result.current.subscribeTimelineSamples((sample) => timelineSamples.push(sample));
        result.current.subscribeDisplaySamples((update) => displayUpdates.push(update));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        visibilityState = 'hidden';
        act(() => {
            emitSensorData?.({
                changedField: 'windSpeed',
                latestSnapshot: { ...liveSample, windSpeed: 2.5 },
                receivedAt: 2000,
            });
        });
        expect(timelineSamples).toHaveLength(1);
        expect(timelineSamples[0]).toMatchObject({ windSpeed: 2.5, timestamp: 2000 });
        expect(displayUpdates).toHaveLength(0);
        visibilitySpy.mockRestore();
    });
    it('publishes fresh display snapshots while hidden only when PiP is active', async () => {
        const adapter = createAdapter();
        let emitSensorData: Parameters<IBLEAdapter['startSensorNotifications']>[0] | undefined;
        let visibilityState: DocumentVisibilityState = 'visible';
        const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get')
            .mockImplementation(() => visibilityState);
        vi.mocked(adapter.startSensorNotifications).mockImplementation(async (callback) => {
            emitSensorData = callback;
            return createNotificationResult();
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result, rerender } = renderHook(({ pipActive }) => useBLE({ backgroundSensorDisplayActive: pipActive }), { initialProps: { pipActive: false } });
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        const displayUpdates: Array<Parameters<Parameters<typeof result.current.subscribeDisplaySamples>[0]>[0]> = [];
        result.current.subscribeDisplaySamples((update) => displayUpdates.push(update));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        rerender({ pipActive: true });
        visibilityState = 'hidden';
        act(() => {
            emitSensorData?.({
                changedField: 'windDirection',
                latestSnapshot: { ...liveSample, windDirection: 91 },
                receivedAt: 2000,
            });
            emitSensorData?.({
                changedField: 'windSpeed',
                latestSnapshot: { ...liveSample, windDirection: 91, windSpeed: 2.5 },
                receivedAt: 2001,
            });
        });
        expect(displayUpdates).toHaveLength(1);
        expect(displayUpdates[0]).toMatchObject({
            latestSample: { windDirection: 91, windSpeed: 2.5, timestamp: 2001 },
            standardFieldReceivedAt: { windDirection: 2000, windSpeed: 2001 },
            lastStandardReceivedAt: 2001,
        });
        visibilitySpy.mockRestore();
    });
    it('publishes adapter parse error stats while connected', async () => {
        const adapter = createAdapter();
        const stats = { count: 0, lastError: null as string | null };
        vi.mocked(adapter.getParseErrorStats).mockImplementation(() => ({ ...stats }));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(result.current.parseErrorStats).toEqual({ count: 0, lastError: null });
        stats.count = 2;
        stats.lastError = 'windSpeed: out of range 655.35 (0..100)';
        await waitFor(() => {
            expect(result.current.parseErrorStats).toEqual(stats);
        }, { timeout: 1800 });
    });
    it('keeps parse error stats state stable while adapter stats are unchanged', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.getParseErrorStats).mockImplementation(() => ({ count: 0, lastError: null }));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        const currentStats = result.current.parseErrorStats;
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 1100));
        });
        expect(result.current.parseErrorStats).toBe(currentStats);
    });
    it('clears stale Card status when refresh returns unavailable', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.getCardStatus)
            .mockResolvedValueOnce(readyCardStatus)
            .mockResolvedValueOnce(null);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(result.current.cardStatus).toEqual(readyCardStatus);
        await act(async () => {
            await result.current.refreshCardStatus();
        });
        expect(result.current.cardStatus).toBeNull();
    });
    it('reads STM32 firmware version on connect and manual refresh', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.getStm32FirmwareVersion)
            .mockResolvedValueOnce(readyStm32FirmwareVersion)
            .mockResolvedValueOnce({
            ...readyStm32FirmwareVersion,
            firmwareVersionRaw: 20260703,
            firmwareVersion: '20260703',
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(result.current.stm32FirmwareVersion?.firmwareVersion).toBe('20260628');
        await act(async () => {
            await result.current.refreshStm32FirmwareVersion();
        });
        expect(adapter.getStm32FirmwareVersion).toHaveBeenCalledTimes(2);
        expect(result.current.stm32FirmwareVersion?.firmwareVersion).toBe('20260703');
    });
    it('refreshes ESP32 Device Information as well as STM32 after an empty initial read', async () => {
        const adapter = createAdapter();
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => { await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' }); });
        await waitFor(() => expect(adapter.getDeviceInfo).toHaveBeenCalledOnce());
        const initialStm32Reads = vi.mocked(adapter.getStm32FirmwareVersion).mock.calls.length;
        vi.mocked(adapter.getDeviceInfo).mockResolvedValue({ firmwareRevision: '1.0.2', softwareRevision: 'demo', manufacturerName: 'STRVSN', modelNumber: 'ULSA EVO' });
        vi.mocked(adapter.getStm32FirmwareVersion).mockResolvedValue(readyStm32FirmwareVersion);
        await act(async () => { await result.current.refreshFirmwareVersions(); });
        expect(result.current.deviceInfo?.firmwareRevision).toBe('1.0.2');
        expect(adapter.getDeviceInfo).toHaveBeenCalledTimes(2);
        expect(adapter.getStm32FirmwareVersion).toHaveBeenCalledTimes(initialStm32Reads + 1);
        expect(result.current.firmwareInfoError).toBeNull();
        expect(result.current.connectionState).toBe('connected');
    });
    it('keeps unchanged STM32 firmware version references while refreshing last-read timestamps', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.getStm32FirmwareVersion)
            .mockResolvedValueOnce(readyStm32FirmwareVersion)
            .mockResolvedValueOnce({ ...readyStm32FirmwareVersion });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date('2026-07-04T00:00:00.000Z'));
            await act(async () => {
                await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
            });
            const stm32FirmwareVersionRef = result.current.stm32FirmwareVersion;
            const firstLastReadAt = result.current.stm32FirmwareVersionLastReadAt;
            expect(stm32FirmwareVersionRef).toEqual(readyStm32FirmwareVersion);
            expect(firstLastReadAt).toEqual(new Date('2026-07-04T00:00:00.000Z').getTime());
            vi.setSystemTime(new Date('2026-07-04T00:02:00.000Z'));
            await act(async () => {
                await result.current.refreshStm32FirmwareVersion();
            });
            expect(result.current.stm32FirmwareVersion).toBe(stm32FirmwareVersionRef);
            expect(result.current.stm32FirmwareVersionLastReadAt).toEqual(new Date('2026-07-04T00:02:00.000Z').getTime());
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('refreshes Card status every minute while connected', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.getCardStatus).mockResolvedValue(readyCardStatus);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        vi.useFakeTimers();
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(adapter.getCardStatus).toHaveBeenCalledTimes(1);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(59999);
        });
        expect(adapter.getCardStatus).toHaveBeenCalledTimes(1);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(adapter.getCardStatus).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });
    it('keeps unchanged Card status object references while refreshing last-read timestamps', async () => {
        const adapter = createAdapter();
        const unchangedCardStatus: CardStatus = { ...readyCardStatus };
        const unchangedCardLogControlStatus: CardLogControlStatus = { ...readyCardLogControlStatus };
        vi.mocked(adapter.getCardStatus)
            .mockResolvedValueOnce(readyCardStatus)
            .mockResolvedValueOnce(unchangedCardStatus);
        vi.mocked(adapter.getCardLogControlStatus)
            .mockResolvedValueOnce(readyCardLogControlStatus)
            .mockResolvedValueOnce(unchangedCardLogControlStatus);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date('2026-07-04T00:00:00.000Z'));
            await act(async () => {
                await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
            });
            const cardStatusRef = result.current.cardStatus;
            const cardLogControlStatusRef = result.current.cardLogControlStatus;
            const firstLastReadAt = result.current.cardStatusLastReadAt;
            expect(cardStatusRef).toEqual(readyCardStatus);
            expect(cardLogControlStatusRef).toEqual(readyCardLogControlStatus);
            expect(firstLastReadAt).toEqual(new Date('2026-07-04T00:00:00.000Z').getTime());
            vi.setSystemTime(new Date('2026-07-04T00:01:00.000Z'));
            await act(async () => {
                await result.current.refreshCardStatus();
            });
            expect(result.current.cardStatus).toBe(cardStatusRef);
            expect(result.current.cardLogControlStatus).toBe(cardLogControlStatusRef);
            expect(result.current.cardStatusLastReadAt).toEqual(new Date('2026-07-04T00:01:00.000Z').getTime());
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('controls カードログging through the adapter and refreshes カード状態', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.getCardStatus).mockResolvedValue(readyCardStatus);
        vi.mocked(adapter.getCardLogControlStatus)
            .mockResolvedValueOnce(readyCardLogControlStatus)
            .mockResolvedValueOnce({
            ...readyCardLogControlStatus,
            lastOpCode: 0x02,
            lastOp: 'stop',
            flags: 0x01,
            loggingEnabled: false,
            canLog: false,
            stopReasonCode: 5,
        });
        vi.mocked(adapter.setCardLogging).mockResolvedValue({
            ...readyCardLogControlStatus,
            lastOpCode: 0x02,
            lastOp: 'stop',
            flags: 0x01,
            loggingEnabled: false,
            canLog: false,
            stopReasonCode: 5,
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(result.current.cardLogControlStatus?.loggingEnabled).toBe(true);
        await act(async () => {
            await result.current.setCardLogging(false);
        });
        expect(adapter.setCardLogging).toHaveBeenCalledWith(false);
        expect(adapter.getCardStatus).toHaveBeenCalledTimes(2);
        expect(result.current.cardLogControlStatus?.loggingEnabled).toBe(false);
        expect(result.current.cardLogControlSupported).toBe(true);
        expect(result.current.error).toBeNull();
    });
    it('reflects physical card logging from optional detail notify without delaying standard connection', async () => {
        const adapter = createAdapter();
        let emitCardLogDetail: ((status: CardLogDetailStatus) => void) | undefined;
        vi.mocked(adapter.startCardLogDetailNotifications!).mockImplementation(async (callback) => {
            emitCardLogDetail = callback;
            return true;
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(result.current.connectionState).toBe('connected');
        expect(adapter.startSensorNotifications).toHaveBeenCalledOnce();
        await waitFor(() => expect(adapter.startCardLogDetailNotifications).toHaveBeenCalledOnce());
        act(() => {
            emitCardLogDetail?.({
                protocolVersion: 2,
                flags: 0x07,
                cardAvailable: true,
                loggingEnabled: true,
                canLog: true,
                fileOpen: false,
                rtcTimestamping: false,
                slowWrite: false,
                errorStop: false,
                cardState: 4,
                stopReasonCode: 0,
                logRateHz: 10,
                logCount: 1,
                flushCount: 0,
                bufferedBytes: 20,
                lastWriteDurationMs: 0,
                lastLogAgeSeconds: 0,
                recordingRequested: true,
                inputPaused: false,
                recovering: false,
                quiescent: false,
                syncedLogCount: null,
                droppedLogCount: null,
                uncertainLogCount: null,
                queueDepth: null,
            });
        });
        expect(result.current.cardLogDetailStatus?.loggingEnabled).toBe(true);
        expect(result.current.dataState).not.toBe('idle');
    });
    it('uses low-rate Card Log Control reads only when detail notify is unavailable', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.startCardLogDetailNotifications!).mockResolvedValue(false);
        vi.mocked(adapter.getCardLogControlStatus).mockResolvedValue(readyCardLogControlStatus);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        vi.useFakeTimers();
        try {
            const { result } = renderHook(() => useBLE());
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1);
            });
            await act(async () => {
                await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
            });
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1);
            });
            const readsAfterFallbackStart = vi.mocked(adapter.getCardLogControlStatus).mock.calls.length;
            await act(async () => {
                await vi.advanceTimersByTimeAsync(CARD_LOG_CONTROL_FALLBACK_REFRESH_MS);
            });
            expect(vi.mocked(adapter.getCardLogControlStatus).mock.calls.length)
                .toBeGreaterThan(readsAfterFallbackStart);
            expect(adapter.getCardStatus).toHaveBeenCalledTimes(1);
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('keeps standard measurements connected and falls back when optional detail notify stalls', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.startCardLogDetailNotifications!).mockImplementation(() => new Promise<boolean>(() => undefined));
        vi.mocked(adapter.getCardLogControlStatus).mockResolvedValue(readyCardLogControlStatus);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        vi.useFakeTimers();
        try {
            const { result } = renderHook(() => useBLE());
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1);
            });
            await act(async () => {
                await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
            });
            const readsBeforeTimeout = vi.mocked(adapter.getCardLogControlStatus).mock.calls.length;
            await act(async () => {
                await vi.advanceTimersByTimeAsync(2501);
            });
            expect(result.current.connectionState).toBe('connected');
            expect(adapter.startSensorNotifications).toHaveBeenCalledOnce();
            expect(vi.mocked(adapter.getCardLogControlStatus).mock.calls.length)
                .toBeGreaterThan(readsBeforeTimeout);
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('rejects a failed Card operation after refreshing the terminal status', async () => {
        const adapter = createAdapter();
        const failedStopStatus: CardLogControlStatus = {
            ...readyCardLogControlStatus,
            lastOpCode: 0x02,
            lastOp: 'stop',
            resultCode: 0x05,
            result: 'unavailable',
            cardState: 2,
            flags: 0,
            cardAvailable: false,
            loggingEnabled: false,
            canLog: false,
            stopReasonCode: 3,
        };
        vi.mocked(adapter.getCardStatus).mockResolvedValue({
            ...readyCardStatus,
            cardState: 2,
        });
        vi.mocked(adapter.getCardLogControlStatus)
            .mockResolvedValueOnce(readyCardLogControlStatus)
            .mockResolvedValue(failedStopStatus);
        vi.mocked(adapter.setCardLogging).mockResolvedValue(failedStopStatus);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        let failure: unknown;
        await act(async () => {
            try {
                await result.current.setCardLogging(false);
            }
            catch (error) {
                failure = error;
            }
        });
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toContain('unavailable');
        expect(result.current.cardLogControlStatus?.loggingEnabled).toBe(false);
        expect(result.current.error).toContain('unavailable');
    });
    it('explains a Card start rejected outside I2C mode without showing recording', async () => {
        const adapter = createAdapter();
        const wrongModeStatus: CardLogControlStatus = {
            ...readyCardLogControlStatus,
            lastOpCode: 0x01,
            lastOp: 'start',
            resultCode: 0x07,
            result: 'wrongMode',
            flags: 0x01,
            loggingEnabled: false,
            canLog: false,
        };
        vi.mocked(adapter.setCardLogging).mockResolvedValue(wrongModeStatus);
        vi.mocked(adapter.getCardLogControlStatus).mockResolvedValue(wrongModeStatus);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        let failure: unknown;
        await act(async () => {
            try {
                await result.current.setCardLogging(true);
            }
            catch (error) {
                failure = error;
            }
        });
        expect((failure as Error).message).toBe('カードログを開始するには本体をI2C計測モードに戻してください。');
        expect(result.current.cardLogControlStatus?.loggingEnabled).toBe(false);
    });
    it('prevents overlapping カードログging operations', async () => {
        const adapter = createAdapter();
        const stoppedStatus: CardLogControlStatus = {
            ...readyCardLogControlStatus,
            lastOpCode: 0x02,
            lastOp: 'stop',
            flags: 0x01,
            loggingEnabled: false,
            canLog: false,
            stopReasonCode: 5,
        };
        let resolveSetCardLogging: (status: CardLogControlStatus) => void = () => undefined;
        vi.mocked(adapter.getCardStatus).mockResolvedValue(readyCardStatus);
        vi.mocked(adapter.getCardLogControlStatus)
            .mockResolvedValueOnce(readyCardLogControlStatus)
            .mockResolvedValue(stoppedStatus);
        vi.mocked(adapter.setCardLogging)
            .mockImplementationOnce(() => new Promise<CardLogControlStatus>((resolve) => {
            resolveSetCardLogging = resolve;
        }));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        let firstOperation: Promise<void> | undefined;
        await act(async () => {
            firstOperation = result.current.setCardLogging(false);
            void result.current.setCardLogging(true);
        });
        expect(adapter.setCardLogging).toHaveBeenCalledTimes(1);
        expect(adapter.setCardLogging).toHaveBeenCalledWith(false);
        await act(async () => {
            resolveSetCardLogging(stoppedStatus);
            await firstOperation;
        });
        expect(result.current.cardLogControlBusy).toBe(false);
        expect(result.current.cardLogControlStatus?.loggingEnabled).toBe(false);
        expect(result.current.error).toBeNull();
    });
    it('serializes LED brightness writes and finishes at the latest selected notch', async () => {
        const adapter = createAdapter();
        let resolveFirstWrite: ((status: LEDBrightnessStatus | null) => void) | null = null;
        vi.mocked(adapter.setLedBrightness)
            .mockImplementationOnce(() => new Promise<LEDBrightnessStatus | null>((resolve) => {
            resolveFirstWrite = resolve;
        }))
            .mockResolvedValueOnce({ brightness: 50 });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        let firstOperation: Promise<void> | undefined;
        await act(async () => {
            firstOperation = result.current.setLedBrightness(0);
            void result.current.setLedBrightness(50);
        });
        expect(adapter.setLedBrightness).toHaveBeenCalledTimes(1);
        expect(adapter.setLedBrightness).toHaveBeenLastCalledWith(0);
        await act(async () => {
            resolveFirstWrite?.({ brightness: 0 });
            await firstOperation;
        });
        expect(adapter.setLedBrightness).toHaveBeenNthCalledWith(2, 50);
        expect(result.current.ledBrightnessStatus).toEqual({ brightness: 50 });
        expect(result.current.ledBrightnessBusy).toBe(false);
    });
    it('tracks ESP32 device mode on connect and manual refresh', async () => {
        const adapter = createAdapter();
        let notifyCallback: ((status: DeviceModeStatus) => void) | null = null;
        const bridgeModeStatus: DeviceModeStatus = {
            ...readyDeviceModeStatus,
            modeCode: 3,
            mode: 'uartBridge',
            flags: 0x03,
            uartBridgeEnabled: true,
            i2cMeasureActive: false,
        };
        vi.mocked(adapter.getDeviceModeStatus)
            .mockResolvedValueOnce(readyDeviceModeStatus)
            .mockResolvedValueOnce(bridgeModeStatus);
        vi.mocked(adapter.startDeviceModeNotifications).mockImplementation(async (callback) => {
            notifyCallback = callback;
            return true;
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(result.current.deviceModeStatus).toEqual(readyDeviceModeStatus);
        expect(result.current.deviceModeLastReadAt).toEqual(expect.any(Number));
        expect(result.current.deviceModeNotifyActive).toBe(true);
        expect(result.current.deviceModeSupported).toBe(true);
        act(() => {
            notifyCallback?.(bridgeModeStatus);
        });
        expect(result.current.deviceModeStatus).toEqual(bridgeModeStatus);
        await act(async () => {
            await result.current.refreshDeviceModeStatus();
        });
        expect(result.current.deviceModeStatus).toEqual(bridgeModeStatus);
        expect(result.current.deviceModeLastReadAt).toEqual(expect.any(Number));
    });
    it('skips periodic ESP32 device mode reads while notify is active', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.getDeviceModeStatus).mockResolvedValue(readyDeviceModeStatus);
        vi.mocked(adapter.startDeviceModeNotifications).mockResolvedValue(true);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        vi.useFakeTimers();
        try {
            await act(async () => {
                await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
            });
            expect(result.current.deviceModeNotifyActive).toBe(true);
            expect(adapter.getDeviceModeStatus).toHaveBeenCalledTimes(1);
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1500);
            });
            expect(adapter.getDeviceModeStatus).toHaveBeenCalledTimes(1);
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('keeps periodic ESP32 device mode reads as a fallback when notify is unavailable', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.getDeviceModeStatus).mockResolvedValue(readyDeviceModeStatus);
        vi.mocked(adapter.startDeviceModeNotifications).mockResolvedValue(false);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        vi.useFakeTimers();
        try {
            await act(async () => {
                await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
            });
            expect(result.current.deviceModeNotifyActive).toBe(false);
            expect(adapter.getDeviceModeStatus).toHaveBeenCalledTimes(1);
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1499);
            });
            expect(adapter.getDeviceModeStatus).toHaveBeenCalledTimes(1);
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1);
            });
            expect(adapter.getDeviceModeStatus).toHaveBeenCalledTimes(2);
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('keeps the last ESP32 device mode after disconnect', async () => {
        const adapter = createAdapter();
        let disconnectCallback: (() => void) | null | undefined = null;
        vi.mocked(adapter.connect).mockImplementation(async (_deviceId, onDisconnect) => {
            void _deviceId;
            disconnectCallback = onDisconnect;
        });
        vi.mocked(adapter.getDeviceModeStatus).mockResolvedValue(readyDeviceModeStatus);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(result.current.connectionState).toBe('connected');
        expect(result.current.deviceModeStatus).toEqual(readyDeviceModeStatus);
        act(() => {
            disconnectCallback?.();
        });
        expect(result.current.connectionState).toBe('disconnected');
        expect(result.current.deviceModeStatus).toEqual(readyDeviceModeStatus);
        expect(result.current.deviceModeLastReadAt).toEqual(expect.any(Number));
        expect(result.current.deviceModeNotifyActive).toBe(false);
        expect(result.current.deviceModeSupported).toBe(true);
    });
    it('keeps the last ESP32 device mode when a refresh read is transiently unavailable', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.getDeviceModeStatus)
            .mockResolvedValueOnce(readyDeviceModeStatus)
            .mockResolvedValueOnce(null);
        vi.mocked(adapter.startDeviceModeNotifications).mockResolvedValue(false);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(result.current.deviceModeStatus).toEqual(readyDeviceModeStatus);
        expect(result.current.deviceModeSupported).toBe(true);
        await act(async () => {
            await result.current.refreshDeviceModeStatus();
        });
        expect(result.current.deviceModeStatus).toEqual(readyDeviceModeStatus);
        expect(result.current.deviceModeSupported).toBe(true);
    });
    it('keeps ESP32 device mode status reference stable when refresh data is unchanged', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.getDeviceModeStatus)
            .mockResolvedValueOnce(readyDeviceModeStatus)
            .mockResolvedValueOnce({ ...readyDeviceModeStatus });
        vi.mocked(adapter.startDeviceModeNotifications).mockResolvedValue(false);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        const currentModeStatus = result.current.deviceModeStatus;
        await act(async () => {
            await result.current.refreshDeviceModeStatus();
        });
        expect(adapter.getDeviceModeStatus).toHaveBeenCalledTimes(2);
        expect(result.current.deviceModeStatus).toBe(currentModeStatus);
        expect(result.current.deviceModeLastReadAt).toEqual(expect.any(Number));
        expect(result.current.deviceModeSupported).toBe(true);
    });
    it('marks ESP32 device mode as unsupported when read and notify are unavailable', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.getDeviceModeStatus).mockResolvedValue(null);
        vi.mocked(adapter.startDeviceModeNotifications).mockResolvedValue(false);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(result.current.connectionState).toBe('connected');
        expect(result.current.deviceModeStatus).toBeNull();
        expect(result.current.deviceModeNotifyActive).toBe(false);
        expect(result.current.deviceModeSupported).toBe(false);
        expect(result.current.error).toBeNull();
    });
    it('dispatches I2C config write requests through the adapter', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.writeI2cConfig)
            .mockResolvedValueOnce(readI2cStatus)
            .mockResolvedValueOnce(readyI2cStatus);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        await act(async () => {
            await result.current.writeI2cConfig({ op: 'save' });
        });
        expect(adapter.writeI2cConfig).toHaveBeenCalledWith({ op: 'read' });
        expect(adapter.writeI2cConfig).toHaveBeenCalledWith({ op: 'save' });
        expect(result.current.i2cConfigStatus).toEqual(readyI2cStatus);
        expect(result.current.i2cConfigSupported).toBe(true);
    });
    it('refreshes I2C config status by sending READ_CONFIG through the adapter', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.writeI2cConfig)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(readI2cStatus);
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        await act(async () => {
            await result.current.refreshI2cConfigStatus();
        });
        expect(adapter.writeI2cConfig).toHaveBeenLastCalledWith({ op: 'read' });
        expect(result.current.i2cConfigStatus).toEqual(readI2cStatus);
        expect(result.current.i2cConfigSupported).toBe(true);
    });
    it('keeps unchanged I2C config status references while refreshing manually', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.writeI2cConfig)
            .mockResolvedValueOnce(readI2cStatus)
            .mockResolvedValueOnce({ ...readI2cStatus });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        const i2cConfigStatusRef = result.current.i2cConfigStatus;
        await act(async () => {
            await result.current.refreshI2cConfigStatus();
        });
        expect(adapter.writeI2cConfig).toHaveBeenLastCalledWith({ op: 'read' });
        expect(result.current.i2cConfigStatus).toBe(i2cConfigStatusRef);
        expect(result.current.i2cConfigSupported).toBe(true);
        expect(result.current.i2cConfigBusy).toBe(false);
    });
    it('prevents overlapping I2C config operations', async () => {
        const adapter = createAdapter();
        let resolveWrite: (status: typeof readyI2cStatus) => void = () => undefined;
        vi.mocked(adapter.writeI2cConfig)
            .mockResolvedValueOnce(readI2cStatus)
            .mockImplementationOnce(() => new Promise<typeof readyI2cStatus>((resolve) => {
            resolveWrite = resolve;
        }));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        let firstWrite: Promise<boolean> | undefined;
        await act(async () => {
            firstWrite = result.current.writeI2cConfig({ op: 'save' });
            void result.current.refreshI2cConfigStatus();
            void result.current.writeI2cConfig({ op: 'discard' });
        });
        expect(adapter.writeI2cConfig).toHaveBeenCalledTimes(2);
        expect(adapter.writeI2cConfig).toHaveBeenLastCalledWith({ op: 'save' });
        await act(async () => {
            resolveWrite(readyI2cStatus);
            await firstWrite;
        });
        expect(result.current.i2cConfigBusy).toBe(false);
        expect(result.current.i2cConfigStatus).toEqual(readyI2cStatus);
    });
    it('syncs time and verifies the RTC read-back offset', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.getRtcTimezoneStatus).mockResolvedValue(createRtcTimezoneStatus());
        vi.mocked(adapter.writeRtcTimezone).mockResolvedValue(createRtcTimezoneStatus({
            lastOperationCode: 2,
            lastOperation: 'sync_utc_and_zone',
            operationGeneration: 11,
        }));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        vi.mocked(adapter.getDeviceHealthStatus).mockClear();
        await act(async () => {
            await result.current.syncTime(367396520);
        });
        expect(adapter.writeRtcTimezone).toHaveBeenCalledWith(expect.objectContaining({
            op: 'sync_utc_and_zone',
            zoneId: 367396520,
        }));
        expect(adapter.getRtcTimezoneStatus).toHaveBeenCalled();
        expect(adapter.getDeviceHealthStatus).toHaveBeenCalledOnce();
        expect(result.current.rtcTimeStatus.supported).toBe(true);
        expect(result.current.rtcTimeStatus.syncState).toBe('synced');
        expect(result.current.rtcTimeStatus.syncMessage).toBe('時刻と地域を同期しました');
    });
    it('prevents overlapping RTC sync operations', async () => {
        const adapter = createAdapter();
        let resolveSync: () => void = () => undefined;
        vi.mocked(adapter.getRtcTimezoneStatus).mockResolvedValue(createRtcTimezoneStatus());
        vi.mocked(adapter.writeRtcTimezone).mockImplementationOnce(() => new Promise((resolve) => {
            resolveSync = () => resolve(createRtcTimezoneStatus({
                lastOperationCode: 2,
                lastOperation: 'sync_utc_and_zone',
                operationGeneration: 11,
            }));
        }));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        let firstSync: Promise<void> | undefined;
        await act(async () => {
            firstSync = result.current.syncTime(367396520);
            void result.current.syncTime(367396520);
        });
        expect(adapter.writeRtcTimezone).toHaveBeenCalledTimes(1);
        await act(async () => {
            resolveSync();
            await firstSync;
        });
        expect(result.current.rtcTimeStatus.syncState).toBe('synced');
        expect(result.current.rtcTimeStatus.syncMessage).toBe('時刻と地域を同期しました');
    });
    it('skips periodic RTC reads while diagnostics UI is closed', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.getRtcTimezoneStatus).mockResolvedValue(createRtcTimezoneStatus());
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE({ diagnosticsActive: false }));
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        vi.useFakeTimers();
        try {
            await act(async () => {
                await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
            });
            expect(adapter.getRtcTimezoneStatus).toHaveBeenCalledTimes(1);
            await act(async () => {
                await vi.advanceTimersByTimeAsync(5000);
            });
            expect(adapter.getRtcTimezoneStatus).toHaveBeenCalledTimes(1);
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('starts RTC read-back immediately and periodically while diagnostics UI is open', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.getRtcTimezoneStatus).mockResolvedValue(createRtcTimezoneStatus());
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result, rerender } = renderHook(({ diagnosticsActive }: {
            diagnosticsActive: boolean;
        }) => useBLE({ diagnosticsActive }), { initialProps: { diagnosticsActive: false } });
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        vi.useFakeTimers();
        try {
            await act(async () => {
                await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
            });
            expect(adapter.getRtcTimezoneStatus).toHaveBeenCalledTimes(1);
            await act(async () => {
                rerender({ diagnosticsActive: true });
            });
            expect(adapter.getRtcTimezoneStatus).toHaveBeenCalledTimes(2);
            await act(async () => {
                await vi.advanceTimersByTimeAsync(5000);
            });
            expect(adapter.getRtcTimezoneStatus).toHaveBeenCalledTimes(3);
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('does not poll private diagnostics on a standard Demo profile', async () => {
        const adapter = createAdapter();
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE({ diagnosticsActive: true }));
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
    });
    it('keeps the BLE connection when optional I2C config status cannot be read', async () => {
        const adapter = createAdapter();
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.mocked(adapter.writeI2cConfig).mockRejectedValue(new Error('I2C config unavailable'));
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        expect(result.current.connectionState).toBe('connected');
        expect(result.current.i2cConfigStatus).toBeNull();
        expect(result.current.i2cConfigSupported).toBeNull();
        expect(result.current.error).toBeNull();
        consoleWarn.mockRestore();
    });
    it('pauses and resumes sensor notifications without disconnecting', async () => {
        const adapter = createAdapter();
        vi.mocked(adapter.startSensorNotifications).mockImplementation(async (callback) => {
            callback({ changedField: 'windSpeed', latestSnapshot: liveSample, receivedAt: Date.now() });
            return createNotificationResult();
        });
        vi.mocked(getBLEAdapter).mockReturnValue(adapter);
        const { result } = renderHook(() => useBLE());
        await waitFor(() => expect(result.current.isSupported).toBe(true));
        await act(async () => {
            await result.current.connectToDevice({ deviceId: 'device-a', name: 'ULSA EVO #1' });
        });
        await waitFor(() => expect(result.current.dataState).toBe('live'));
        await act(async () => {
            await result.current.setSensorNotificationsPaused(true);
        });
        expect(adapter.stopSensorNotifications).toHaveBeenCalledTimes(1);
        expect(adapter.disconnect).not.toHaveBeenCalled();
        expect(result.current.connectionState).toBe('connected');
        expect(result.current.sensorData).toBeNull();
        expect(result.current.dataState).toBe('waiting');
        await act(async () => {
            await result.current.setSensorNotificationsPaused(false);
        });
        expect(adapter.startSensorNotifications).toHaveBeenCalledTimes(2);
        expect(adapter.disconnect).not.toHaveBeenCalled();
        await waitFor(() => expect(result.current.dataState).toBe('live'));
    });
});
