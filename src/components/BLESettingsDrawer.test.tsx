import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BLESettingsDrawer from './BLESettingsDrawer';
vi.mock('./ble-settings/OtaPanelView', () => import('../../test-support/OtaPanelControllerHarness'));
import type { BLECapabilitiesStatus, DeviceModeStatus, DeviceHealthStatus, I2cConfigStatus, LEDWindReactiveStatus, OtaControlOp, OtaControlStatus, RtcTimeStatus, Stm32FirmwareVersionStatus, } from '../types/ble';
import { createEmptyBrowserLogStatus, type BrowserLogSessionSummary } from '../services/browserLog';
const softApMock = vi.hoisted(() => ({
    connectToEsp32SoftAp: vi.fn(),
    isNativeSoftApJoinAvailable: vi.fn(() => false),
}));
vi.mock('../services/ota/nativeSoftAp', async () => {
    const actual = await vi.importActual<typeof import('../services/ota/nativeSoftAp')>('../services/ota/nativeSoftAp');
    return {
        ...actual,
        connectToEsp32SoftAp: softApMock.connectToEsp32SoftAp,
        isNativeSoftApJoinAvailable: softApMock.isNativeSoftApJoinAvailable,
        removeEsp32SoftApConfiguration: vi.fn(),
    };
});
const noop = vi.fn();
const idleRtcTimeStatus: RtcTimeStatus = {
    deviceTime: null,
    deviceEpochSeconds: null,
    systemTimeAtRead: null,
    offsetMs: null,
    lastReadAt: null,
    supported: null,
    readError: null,
    syncState: 'idle',
    lastSyncAt: null,
    lastSyncOffsetMs: null,
    syncMessage: null,
    zoneId: null,
    zoneName: null,
    totalUtcOffsetMinutes: null,
    standardUtcOffsetMinutes: null,
    dstOffsetMinutes: null,
    tzdbVersion: null,
    rtcDetected: false,
    rtcReadable: false,
    utcValid: false,
    zoneConfigured: false,
    nvsPersisted: false,
    dstActive: false,
    operationGeneration: null,
    lastOperation: 'none',
    lastResult: null,
    operationBusy: false,
    deviceError: false,
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
const readyI2cConfigStatus: I2cConfigStatus = {
    protocolVersion: 1,
    lastOpCode: 0,
    lastOp: 'read',
    resultCode: 0,
    result: 'ok',
    remoteCommandStatus: 0,
    remoteLastError: 0,
    configFlags: 0,
    nodeId: 7,
    avgCycle: 16,
    windDirInstallMode: 0,
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
const bootEepromFaultHealth: DeviceHealthStatus = {
    protocolVersion: 2, flags: 0x83, bleConnected: true, i2cDetected: true,
    rtcAvailable: true, cardAvailable: false, loggingEnabled: false,
    configDirty: false, rebootRequired: false, errorActive: true,
    esp32ModeCode: 0, esp32LastError: 0, stm32RegisterVersion: 0x0d,
    stm32Status: 0x88, stm32LastError: 0x0e, localI2cError: 0,
    cardState: 0, cardStopReason: 0, rtcFlags: 0x07, rtcPresent: true,
    rtcRunning: true, rtcTimeValid: true, rtcVoltageLow: false,
    rtcClockStopped: false,
};
const legacyStm32FirmwareStatus: Stm32FirmwareVersionStatus = {
    protocolVersion: 2,
    flags: 0x03,
    i2cClientPresent: true,
    detected: true,
    readOk: false,
    localError: 5,
    regVersion: 10,
    firmwareVersionRaw: 0,
    firmwareVersion: null,
    firmwareRevision: 0,
};
const readyCapabilitiesStatus: BLECapabilitiesStatus = {
    protocolVersion: 1,
    flags0: 0xff,
    flags1: 0xff,
    flags2: 0xff,
    flags3: 0x01,
    interfaceRevision: 0x0e,
    maxMeasurementNotifyHz: 10,
    diagnosticPollHintSeconds: 2,
    currentTime: true,
    deviceInfo: true,
    cardStatus: true,
    cardLogControl: true,
    deviceMode: true,
    stm32FirmwareVersion: true,
    i2cConfigControl: true,
    sampleMetadata: true,
    deviceHealth: true,
    cardLogDetail: true,
    cardLogSettings: true,
    capabilities: true,
    windNotifications: true,
    rtcReadWrite: true,
    i2cConfigWrite: true,
    cardLogWrite: true,
    deviceIdentify: true,
    ledBrightness: true,
    ledWindReactive: false,
    otaControl: true,
    resetControl: true,
    stm32UpdateControl: true,
    timezoneConfig: true,
};
const idleBrowserLogStatus = {
    ...createEmptyBrowserLogStatus(),
};
const storedLogSession = (sessionId: string, startedAt: number): BrowserLogSessionSummary => ({
    sessionId,
    startedAt,
    endedAt: startedAt + 60000,
    lastActivityAt: startedAt + 60000,
    retentionAnchorAt: startedAt + 60000,
    expiresAt: startedAt + 30 * 24 * 60 * 60 * 1000,
    rowCount: 10,
    segmentCount: 1,
    sizeBytes: 1024,
    completed: true,
});
const readyLedWindReactiveStatus: LEDWindReactiveStatus = {
    protocolVersion: 1,
    lastOpCode: 0,
    lastOp: 'read',
    resultCode: 0,
    result: 'ok',
    flags: 0x05,
    enabled: true,
    active: false,
    persisted: true,
    theme: 'tide',
};
const createOtaControlStatus = (overrides: Partial<OtaControlStatus> = {}): OtaControlStatus => ({
    protocolVersion: 1,
    lastOpCode: 0,
    lastOp: 'read',
    resultCode: 0,
    result: 'ok',
    stateCode: 0,
    progress: 0,
    flags: 0,
    portalActive: false,
    updating: false,
    hasCredentials: false,
    error: false,
    uploadedBytes: 0,
    totalBytes: 0,
    remainingSeconds: 0,
    ssid: '',
    password: '',
    token: '',
    ip: '',
    nodeId: 0,
    ...overrides,
});
const mockFirmwareReleaseFetch = ({ statusReachable = true, statusBody, }: {
    statusReachable?: boolean;
    statusBody?: Record<string, unknown>;
} = {}) => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/stm32/status?')) {
            return new Response(JSON.stringify({
                phase: 'ready_to_write',
                packageReady: true,
                canCancel: true,
                canWrite: true,
                scratchBytes: 251000,
                totalBytes: 251000,
                packageBytes: 251000,
                packageSha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
                writtenBytes: 0,
                verifiedBytes: 251000,
                progress: 100,
                nodeId: 7,
                target: 'ULSA_EVO_STM32_F411',
                version: '20260708',
                releaseTag: 'stm32-2026.07.08-field.1',
                buildProfile: 'field',
                rdpPolicy: 'preserve',
                bootloaderSyncOk: null,
                bootloaderSyncAttempts: 0,
                bootloaderSyncResponse: 0,
                bootloaderSyncError: null,
                bootloaderSessionActive: false,
                sessionBound: true,
                sessionExpectedNodeId: 7,
                sessionTarget: 'ULSA_EVO_STM32_F411',
                sessionReleaseTag: 'stm32-2026.07.08-field.1',
                error: null,
                errorCode: null,
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.includes('/status?')) {
            if (!statusReachable) {
                throw new TypeError('Failed to fetch');
            }
            return new Response(JSON.stringify({
                state: 'Portal Active',
                portalActive: true,
                updating: false,
                appDriven: true,
                progress: 0,
                uploadedBytes: 0,
                totalBytes: 0,
                remainingSeconds: 280,
                firmwareVersion: 'test',
                error: null,
                ...statusBody,
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.includes('firmware.bin')) {
            return {
                ok: true,
                arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
            };
        }
        if (url.includes('/api/stm32-firmware/download-token')) {
            return {
                ok: true,
                json: async () => ({
                    downloadUrl: '/api/stm32-firmware/download?token=download-token',
                    expiresAt: 1780000000,
                    expiresInSeconds: 300,
                }),
            };
        }
        if (url.includes('/api/stm32-firmware/download')) {
            return {
                ok: true,
                arrayBuffer: async () => new Uint8Array([5, 6, 7, 8]).buffer,
            };
        }
        if (url.includes('/api/stm32-firmware/releases')) {
            return {
                ok: true,
                json: async () => ({
                    releases: [{
                            id: 'stm32-fw-test:asset',
                            tagName: 'stm32-fw-test',
                            title: 'STM32 FW test',
                            publishedAt: '2026-07-08T00:00:00Z',
                            assetName: 'ULSA_EVO_STM32_F411-20260708-stm32-2026.07.08-field.1-field-preserve.ulsa-stm32pkg',
                            target: 'ULSA_EVO_STM32_F411',
                            version: '20260708',
                            releaseTag: 'stm32-2026.07.08-field.1',
                            buildProfile: 'field',
                            rdpPolicy: 'preserve',
                            requiresAdmin: false,
                            size: 251000,
                            packageSha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
                            downloadUrl: '/api/stm32-firmware/download?tag=stm32-fw-test&asset=pkg',
                            downloadTokenUrl: '/api/stm32-firmware/download-token',
                            latest: true,
                        }],
                }),
            };
        }
        return {
            ok: true,
            json: async () => ({
                releases: [{
                        id: 'esp32-fw-test',
                        tagName: 'esp32-fw-test',
                        title: 'ESP32 FW test',
                        publishedAt: '2026-07-07T00:00:00Z',
                        size: 1024,
                        downloadUrl: 'https://example.invalid/firmware.bin',
                        latest: true,
                    }],
            }),
        };
    }));
};
const createDrawerProps = (overrides: Partial<ComponentProps<typeof BLESettingsDrawer>> = {}): ComponentProps<typeof BLESettingsDrawer> => ({
    isOpen: true,
    onDismiss: noop,
    connectionState: 'connected',
    dataState: 'live',
    connectedDevice: { deviceId: 'device-a', name: 'ULSA EVO #0', nodeId: 0 },
    deviceInfo: null,
    stm32FirmwareVersion: null,
    sampleMetadataStatus: null,
    deviceHealthStatus: null,
    capabilitiesStatus: null,
    ledBrightnessStatus: null,
    ledBrightnessSupported: null,
    ledBrightnessBusy: false,
    deviceResetStatus: null,
    deviceResetSupported: null,
    deviceResetBusy: false,
    otaControlStatus: null,
    otaControlBusy: false,
    cardStatus: null,
    cardLogDetailStatus: null,
    cardLogSettingsStatus: null,
    cardLogSettingsBusy: false,
    browserLogIntervalMs: 100,
    browserLogStatus: idleBrowserLogStatus,
    browserLogExportBusy: false,
    browserLogExportDisabled: true,
    browserLogExportTitle: '書き出せるブラウザー側ログがありません',
    browserLogPreparedArchive: null,
    browserLogNextExportBatch: null,
    browserLogExportNotice: null,
    browserLogExportError: null,
    browserLogMaintenanceOperation: null,
    browserLogMaintenanceError: null,
    rtcTimeStatus: idleRtcTimeStatus,
    deviceModeStatus: readyDeviceModeStatus,
    deviceModeNotifyActive: false,
    deviceModeSupported: null,
    i2cConfigStatus: readyI2cConfigStatus,
    i2cConfigBusy: false,
    parseErrorStats: { count: 0, lastError: null },
    error: null,
    isSupported: true,
    platformInfo: { platform: 'ios', adapterType: 'Capacitor', isSupported: true },
    currentThemeIndex: 4,
    onThemeChange: noop,
    onSyncTime: noop,
    onRefreshRtcTime: noop,
    onRefreshStm32FirmwareVersion: noop,
    onRefreshSampleMetadataStatus: noop,
    onRefreshDeviceHealthStatus: noop,
    onRefreshCapabilitiesStatus: noop,
    onRefreshLedBrightness: noop,
    onSetLedBrightness: noop,
    onRefreshDeviceResetStatus: noop,
    onResetDevice: async () => null,
    onRefreshOtaControlStatus: async () => undefined,
    onWriteOtaControl: async () => null,
    onRefreshCardStatus: noop,
    onRefreshCardLogDetailStatus: noop,
    onRefreshCardLogSettingsStatus: noop,
    onWriteCardLogSettings: noop,
    onBrowserLogIntervalMsChange: () => true,
    onPrepareBrowserLogExport: noop,
    onDeliverPreparedBrowserLogExport: noop,
    onPrepareNextBrowserLogExport: noop,
    onDiscardPreparedBrowserLogExport: noop,
    onRefreshBrowserLogs: noop,
    onDeleteBrowserLogSession: noop,
    onDeleteAllBrowserLogs: noop,
    onRefreshDeviceModeStatus: noop,
    onRefreshI2cConfigStatus: noop,
    onWriteI2cConfig: noop,
    onClearError: noop,
    ...overrides,
});
describe('BLESettingsDrawer', () => {
    beforeEach(() => {
        vi.stubEnv('VITE_STM32_UPDATER_ENABLED', 'true');
        vi.stubGlobal('confirm', vi.fn(() => true));
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.useRealTimers();
        softApMock.connectToEsp32SoftAp.mockReset();
        softApMock.isNativeSoftApJoinAvailable.mockReset();
        softApMock.isNativeSoftApJoinAvailable.mockReturnValue(false);
    });
    it('opens on an overview and switches categories from the left menu', async () => {
        render(<BLESettingsDrawer {...createDrawerProps()}/>);
        expect(screen.getByTestId('ble-settings-drawer')).toBeInTheDocument();
        expect(screen.getByText('接続概要')).toBeInTheDocument();
        await act(async () => {
            screen.getByRole('button', { name: /計測設定/ }).click();
        });
        expect(screen.getByText('Node ID')).toBeInTheDocument();
        expect(screen.getByText('設定可')).toBeInTheDocument();
    });
    it('keeps the seven product categories in the requested order', () => {
        render(<BLESettingsDrawer {...createDrawerProps()}/>);
        const navigation = screen.getByRole('navigation', { name: '設定カテゴリ' });
        expect(Array.from(navigation.querySelectorAll('button > span'), (element) => element.textContent))
            .toEqual(['概要', 'FW更新', 'カード/ログ', '時刻', '計測設定', '表示', '情報']);
    });
    it('moves firmware identity and its refresh action into FW update', async () => {
        const onRefreshStm32FirmwareVersion = vi.fn();
        render(<BLESettingsDrawer {...createDrawerProps({
            stm32FirmwareVersion: legacyStm32FirmwareStatus,
            stm32FirmwareVersionLastReadAt: 1725000000000,
            onRefreshStm32FirmwareVersion,
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /^FW更新/ }).click();
        });
        expect(screen.getByText('本体情報')).toBeInTheDocument();
        const refreshButton = screen.getByText('バージョンを再確認').closest('button');
        expect(refreshButton).not.toBeNull();
        fireEvent.click(refreshButton!);
        expect(onRefreshStm32FirmwareVersion).toHaveBeenCalledOnce();
    });
    it('collects open-source guidance, Privacy, and App information in the information category', async () => {
        render(<BLESettingsDrawer {...createDrawerProps()}/>);
        await act(async () => {
            screen.getByRole('button', { name: /情報/ }).click();
        });
        expect(await screen.findByText('アプリ情報')).toBeInTheDocument();
        expect(screen.getByText('Open Source / 利用案内')).toBeInTheDocument();
        expect(screen.getByText('Privacy / データ取扱い')).toBeInTheDocument();
        expect(screen.getByText(/最長30日・合計100MiB/)).toBeInTheDocument();
    });
    it('uses the real drawer surface for interactive progress and panel gestures', () => {
        const onPointerDown = vi.fn();
        const panelGestureHandlers = {
            onPointerDown,
            onPointerMove: vi.fn(),
            onPointerUp: vi.fn(),
            onPointerCancel: vi.fn(),
            onLostPointerCapture: vi.fn(),
        };
        render(<BLESettingsDrawer {...createDrawerProps({
            entryMode: 'interactive',
            isModalActive: false,
            interactionProgress: 0.375,
            interactionOffsetPx: 146,
            interactionTransitionMs: 180,
            panelGestureHandlers,
        })}/>);
        const root = screen.getByTestId('ble-settings-drawer');
        const dialog = screen.getByRole('dialog', { hidden: true });
        expect(root).toHaveClass('ble-settings-drawer-interactive');
        expect(root).toHaveAttribute('data-interaction-progress', '0.375');
        expect(root).toHaveAttribute('aria-hidden', 'true');
        expect(root).toHaveAttribute('inert');
        expect(root.style.getPropertyValue('--ble-settings-interaction-offset')).toBe('146px');
        expect(root.style.getPropertyValue('--ble-settings-interaction-duration')).toBe('180ms');
        expect(dialog).not.toHaveAttribute('aria-modal');
        fireEvent.pointerDown(dialog, { pointerId: 1, isPrimary: true });
        expect(onPointerDown).toHaveBeenCalledTimes(1);
    });
    it('removes inert when a mounted drawer becomes the active modal', () => {
        const inactiveProps = createDrawerProps({ isModalActive: false });
        const { rerender } = render(<BLESettingsDrawer {...inactiveProps}/>);
        const root = screen.getByTestId('ble-settings-drawer');
        expect(root).toHaveAttribute('aria-hidden', 'true');
        expect(root).toHaveAttribute('inert');
        rerender(<BLESettingsDrawer {...inactiveProps} isModalActive/>);
        expect(root).not.toHaveAttribute('aria-hidden');
        expect(root).not.toHaveAttribute('inert');
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });
    it('marks the selected category and resets detail scrolling when switching', async () => {
        render(<BLESettingsDrawer {...createDrawerProps()}/>);
        const overviewButton = screen.getByRole('button', { name: /概要/ });
        const detail = screen.getByTestId('ble-settings-detail');
        expect(overviewButton).toHaveAttribute('aria-current', 'page');
        detail.scrollTop = 180;
        await act(async () => {
            screen.getByRole('button', { name: /計測設定/ }).click();
        });
        expect(detail.scrollTop).toBe(0);
        expect(overviewButton).not.toHaveAttribute('aria-current');
        expect(screen.getByRole('button', { name: /計測設定/ })).toHaveAttribute('aria-current', 'page');
        expect(detail).toHaveAttribute('aria-labelledby', 'ble-settings-detail-title');
    });
    it('writes each LED slider notch immediately, including recovery from off', async () => {
        const onSetLedBrightness = vi.fn();
        const { rerender } = render(<BLESettingsDrawer {...createDrawerProps({
            ledBrightnessStatus: { brightness: 0 },
            ledBrightnessSupported: true,
            onSetLedBrightness,
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /計測設定/ }).click();
        });
        const slider = screen.getByTestId('led-brightness-slider');
        expect(slider.tagName).toBe('ION-RANGE');
        expect(slider).toHaveAttribute('dir', 'ltr');
        expect(screen.queryByTestId('led-brightness-save')).not.toBeInTheDocument();
        await act(async () => {
            fireEvent(slider, new CustomEvent('ionInput', { detail: { value: 3 }, bubbles: true }));
        });
        expect(onSetLedBrightness).toHaveBeenLastCalledWith(50);
        await act(async () => {
            fireEvent(slider, new CustomEvent('ionInput', { detail: { value: 0 }, bubbles: true }));
        });
        expect(onSetLedBrightness).toHaveBeenLastCalledWith(0);
        rerender(<BLESettingsDrawer {...createDrawerProps({
            isUpsideDown: true,
            ledBrightnessStatus: { brightness: 0 },
            ledBrightnessSupported: true,
            onSetLedBrightness,
        })}/>);
        expect(screen.getByTestId('led-brightness-slider')).toHaveAttribute('dir', 'rtl');
    });
    it('does not render wind-reactive controls while preserving their callbacks', async () => {
        const onSetLedWindReactive = vi.fn();
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: { ...readyCapabilitiesStatus, ledWindReactive: true },
            ledWindReactiveStatus: readyLedWindReactiveStatus,
            ledWindReactiveSupported: true,
            onSetLedWindReactive,
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /計測設定/ }).click();
        });
        expect(screen.queryByLabelText('風速LED連動')).not.toBeInTheDocument();
        expect(screen.queryByRole('radio', { name: /Viridis/ })).not.toBeInTheDocument();
        expect(onSetLedWindReactive).not.toHaveBeenCalled();
    });
    it('offers the three curated display themes from settings', async () => {
        const onThemeChange = vi.fn();
        render(<BLESettingsDrawer {...createDrawerProps({ onThemeChange })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /表示/ }).click();
        });
        expect(screen.getByRole('radio', { name: /ULSA Slate/ })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('radio', { name: /ULSA Graphite/ })).toBeInTheDocument();
        await act(async () => {
            screen.getByRole('radio', { name: /ULSA Light/ }).click();
        });
        expect(onThemeChange).toHaveBeenCalledWith(7);
    });
    it('applies distinct Slate and Graphite drawer surfaces', () => {
        const { rerender } = render(<BLESettingsDrawer {...createDrawerProps({ currentThemeIndex: 4 })}/>);
        expect(screen.getByTestId('ble-settings-drawer')).toHaveClass('ble-settings-drawer-slate');
        rerender(<BLESettingsDrawer {...createDrawerProps({ currentThemeIndex: 3 })}/>);
        expect(screen.getByTestId('ble-settings-drawer')).not.toHaveClass('ble-settings-drawer-slate');
    });
    it('keeps I2C write controls disabled when firmware reports read-only support', async () => {
        render(<BLESettingsDrawer {...createDrawerProps({
            i2cConfigStatus: {
                ...readyI2cConfigStatus,
                remoteRegisterVersion: 2,
                configWriteSupported: false,
            },
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /計測設定/ }).click();
        });
        expect(screen.getByText('設定不可')).toBeInTheDocument();
        expect(screen.getByTestId('i2c-node-id-input')).toBeInTheDocument();
        expect(document.querySelector('ion-input[label="Node ID (保存前の設定)"]')).not.toBeInTheDocument();
        expect(screen.queryByTestId('i2c-address-input')).not.toBeInTheDocument();
        expect(screen.queryByText('I2C Address')).not.toBeInTheDocument();
        expect(screen.getByText('このファームウェアでは設定を変更できません。本体の更新をご確認ください。')).toBeInTheDocument();
        expect(screen.getByTestId('i2c-node-id-set')).toHaveAttribute('disabled');
        expect(screen.getByTestId('i2c-node-id-set')).toHaveAttribute('data-control-interaction', 'disabled');
        expect(screen.getByTestId('i2c-node-id-set')).toHaveAttribute('data-control-disabled-reason', 'BLE未接続またはI2C設定の書き込みに未対応です');
    });
    it('shows the same EEPROM boot fault to a normal Web/iOS user', async () => {
        render(<BLESettingsDrawer {...createDrawerProps({ deviceHealthStatus: bootEepromFaultHealth })}/>);
        await act(async () => { screen.getByRole('button', { name: /計測設定/ }).click(); });
        const alerts = screen.getAllByRole('alert');
        expect(alerts.some((alert) => alert.textContent?.includes('EEPROMを読み取れません'))).toBe(true);
        expect(alerts.some((alert) => alert.textContent?.includes('計測値は無効です'))).toBe(true);
    });
    it('keeps Phase 3 async controls busy-safe without losing their original category callbacks', async () => {
        const onWriteI2cConfig = vi.fn();
        const onSyncTime = vi.fn();
        const onPrepareBrowserLogExport = vi.fn();
        render(<BLESettingsDrawer {...createDrawerProps({
            i2cConfigBusy: true,
            onWriteI2cConfig,
            onSyncTime,
            browserLogExportBusy: true,
            browserLogStatus: {
                ...idleBrowserLogStatus,
                hasExportableData: true,
                storedSessionCount: 1,
                sessions: [storedLogSession('session-1', Date.UTC(2026, 8, 20))],
            },
            browserLogExportDisabled: false,
            browserLogExportTitle: '保存済みログをZIPで書き出し',
            onPrepareBrowserLogExport,
            rtcTimeStatus: {
                ...idleRtcTimeStatus,
                syncState: 'syncing',
                syncMessage: '時刻同期中',
            },
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /計測設定/ }).click();
        });
        const i2cSet = screen.getByTestId('i2c-node-id-set');
        expect(i2cSet).toHaveAttribute('data-control-size', 'M44');
        expect(i2cSet).toHaveAttribute('data-control-interaction', 'busy');
        expect(i2cSet).toHaveAttribute('disabled');
        await act(async () => {
            i2cSet.click();
        });
        expect(onWriteI2cConfig).not.toHaveBeenCalled();
        await act(async () => {
            screen.getByRole('button', { name: /時刻/ }).click();
        });
        const syncButton = screen.getByTestId('rtc-time-sync');
        expect(syncButton).toHaveAttribute('data-control-size', 'M44');
        expect(syncButton).toHaveAttribute('data-control-interaction', 'busy');
        expect(syncButton).toHaveAttribute('disabled');
        await act(async () => {
            syncButton.click();
        });
        expect(onSyncTime).not.toHaveBeenCalled();
        await act(async () => {
            screen.getByRole('button', { name: /カード\/ログ/ }).click();
        });
        const exportButton = screen.getByTestId('browser-log-export-session-1');
        expect(exportButton).toHaveAttribute('data-control-size', 'C36');
        expect(exportButton).toHaveAttribute('disabled');
        await act(async () => {
            exportButton.click();
        });
        expect(onPrepareBrowserLogExport).not.toHaveBeenCalled();
    });
    it('writes a valid カードログ interval from the storage panel', async () => {
        const writeCardLogSettings = vi.fn();
        render(<BLESettingsDrawer {...createDrawerProps({
            onWriteCardLogSettings: writeCardLogSettings,
            cardLogSettingsStatus: {
                protocolVersion: 1,
                lastOpCode: 1,
                lastOp: 'setIntervalMs',
                resultCode: 0,
                result: 'ok',
                flags: 0x03,
                persisted: true,
                stmIntervalKnown: true,
                defaultInterval: false,
                autoStartEnabled: false,
                currentIntervalMs: 200,
                minIntervalMs: 100,
                maxIntervalMs: 600000,
                stm32IntervalMs: 100,
            },
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /カード\/ログ/ }).click();
        });
        expect(await screen.findByText('ログ周期設定')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getAllByText('5 Hz (0.2秒間隔)').length).toBeGreaterThanOrEqual(2);
        });
        expect(screen.getByTestId('card-log-settings-rate-select').closest('label'))
            .toHaveClass('card-log-settings-field', 'i2c-config-control');
        expect(screen.getByTestId('card-log-settings-save')).not.toHaveAttribute('disabled');
        expect(screen.getByTestId('card-log-settings-save')).toHaveClass('device-setting-save');
        expect(screen.queryByText(/3\.333\s*Hz/)).not.toBeInTheDocument();
        await act(async () => {
            screen.getByTestId('card-log-settings-save').click();
        });
        expect(writeCardLogSettings).toHaveBeenCalledWith({ op: 'setIntervalMs', intervalMs: 200 });
    });
    it('switches to App and saves an independent ten-second latest-sample interval', async () => {
        const setBrowserLogIntervalMs = vi.fn(() => true);
        render(<BLESettingsDrawer {...createDrawerProps({
            browserLogIntervalMs: 100,
            onBrowserLogIntervalMsChange: setBrowserLogIntervalMs,
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /カード\/ログ/ }).click();
        });
        fireEvent(screen.getByLabelText('ログ周期の保存先'), new CustomEvent('ionChange', { detail: { value: 'browser' }, bubbles: true }));
        expect(await screen.findByText('アプリ内ログの現在値')).toBeInTheDocument();
        expect(screen.getByText(/最後に受信した1サンプル/)).toBeInTheDocument();
        expect(screen.getByText(/平均化しません/)).toBeInTheDocument();
        fireEvent(screen.getByText('秒').closest('ion-segment')!, new CustomEvent('ionChange', { detail: { value: 'seconds' }, bubbles: true }));
        fireEvent(screen.getByTestId('browser-log-settings-input'), new CustomEvent('ionInput', { detail: { value: '10' }, bubbles: true }));
        await act(async () => {
            screen.getByTestId('browser-log-settings-save').click();
        });
        expect(setBrowserLogIntervalMs).toHaveBeenCalledWith(10000);
    });
    it('writes the next-boot Card auto-start setting without starting the current log', async () => {
        const writeCardLogSettings = vi.fn();
        const { rerender } = render(<BLESettingsDrawer {...createDrawerProps({
            onWriteCardLogSettings: writeCardLogSettings,
            cardLogSettingsStatus: {
                protocolVersion: 3,
                lastOpCode: 0,
                lastOp: 'read',
                resultCode: 0,
                result: 'ok',
                flags: 0x03,
                persisted: true,
                stmIntervalKnown: true,
                defaultInterval: false,
                autoStartEnabled: false,
                currentIntervalMs: 200,
                minIntervalMs: 100,
                maxIntervalMs: 600000,
                stm32IntervalMs: 100,
            },
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /カード\/ログ/ }).click();
        });
        const toggle = await screen.findByTestId('card-log-auto-start-toggle');
        expect(toggle).toHaveAttribute('dir', 'ltr');
        await act(async () => {
            fireEvent(toggle, new CustomEvent('ionChange', { detail: { checked: true }, bubbles: true }));
        });
        expect(writeCardLogSettings).toHaveBeenCalledWith({ op: 'setAutoStart', autoStartEnabled: true });
        rerender(<BLESettingsDrawer {...createDrawerProps({
            isUpsideDown: true,
            onWriteCardLogSettings: writeCardLogSettings,
            cardLogSettingsStatus: {
                protocolVersion: 3, lastOpCode: 0, lastOp: 'read', resultCode: 0, result: 'ok',
                flags: 0x03, persisted: true, stmIntervalKnown: true, defaultInterval: false,
                autoStartEnabled: false, currentIntervalMs: 200, minIntervalMs: 100,
                maxIntervalMs: 600000, stm32IntervalMs: 100,
            },
        })}/>);
        expect(screen.getByTestId('card-log-auto-start-toggle')).toHaveAttribute('dir', 'rtl');
    });
    it('keeps the Card auto-start toggle disabled until a device is connected', async () => {
        render(<BLESettingsDrawer {...createDrawerProps({
            connectionState: 'disconnected',
            cardLogSettingsStatus: {
                protocolVersion: 3,
                lastOpCode: 0,
                lastOp: 'read',
                resultCode: 0,
                result: 'ok',
                flags: 0x00,
                persisted: false,
                stmIntervalKnown: false,
                defaultInterval: true,
                autoStartEnabled: false,
                currentIntervalMs: 100,
                minIntervalMs: 100,
                maxIntervalMs: 600000,
                stm32IntervalMs: null,
            },
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /カード\/ログ/ }).click();
        });
        expect(await screen.findByTestId('card-log-auto-start-toggle')).toHaveProperty('disabled', true);
    });
    it('shows browser log status and routes export from the storage panel without a recording mode selector', async () => {
        const onPrepareBrowserLogExport = vi.fn();
        render(<BLESettingsDrawer {...createDrawerProps({
            browserLogStatus: {
                ...idleBrowserLogStatus,
                rowCount: 123,
                segmentCount: 2,
                completedSegmentCount: 1,
                lastSampleAt: 1783230000000,
                bufferedBytes: 2048,
                storedSessionCount: 2,
                storedSegmentCount: 3,
                storedRowCount: 123,
                storedBytes: 2048,
                hasExportableData: true,
                sessions: [
                    storedLogSession('session-1', Date.UTC(2026, 8, 19)),
                    storedLogSession('session-2', Date.UTC(2026, 8, 20))
                ],
            },
            browserLogExportDisabled: false,
            browserLogExportTitle: '保存済みログ2件のCSVをZIPで一括書き出し',
            onPrepareBrowserLogExport,
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /カード\/ログ/ }).click();
        });
        expect(screen.getByText('アプリ内ログ')).toBeInTheDocument();
        expect(screen.getByText('アプリ内保存')).toBeInTheDocument();
        expect(screen.getByText('停止中')).toBeInTheDocument();
        expect(screen.getByText('保存済みログ')).toBeInTheDocument();
        expect(screen.getByText('2件')).toBeInTheDocument();
        expect(screen.getByText('CSVファイル')).toBeInTheDocument();
        expect(screen.getByText('3件')).toBeInTheDocument();
        expect(screen.getByText('保存行数')).toBeInTheDocument();
        expect(screen.getByText('123')).toBeInTheDocument();
        expect(screen.getByText('2.0 KiB / 100.0 MiB')).toBeInTheDocument();
        expect(screen.queryByTestId('log-recording-mode')).not.toBeInTheDocument();
        await act(async () => {
            screen.getByRole('checkbox', { name: 'すべてのログを選択' }).click();
            screen.getByTestId('browser-log-download-selected').click();
        });
        expect(onPrepareBrowserLogExport).toHaveBeenCalledTimes(1);
        expect(onPrepareBrowserLogExport).toHaveBeenCalledWith(['session-1', 'session-2']);
    });
    it('shows OTA firmware update as ordered steps without exposing a standalone prepare action', async () => {
        mockFirmwareReleaseFetch({
            statusBody: {
                nodeId: 7,
                ssid: 'ULSA-EVO-OTA-7',
            },
        });
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            otaControlStatus: createOtaControlStatus(),
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /FW更新/ }).click();
        });
        expect(await screen.findByText('ESP32 FW更新')).toBeInTheDocument();
        const step1 = screen.getByRole('button', { name: /FWを取得/ });
        const step2 = screen.getByRole('button', { name: /更新用Wi-Fiを開始/ });
        const step3 = screen.getByRole('button', { name: /転送して更新/ });
        expect(step1.compareDocumentPosition(step2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(step2.compareDocumentPosition(step3) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.queryByRole('button', { name: /^準備$/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Wi-Fi情報作成/ })).not.toBeInTheDocument();
    });
    it('enables STM32 field updates in supported Web Bluetooth builds', async () => {
        vi.stubGlobal('isSecureContext', true);
        vi.stubGlobal('navigator', { userAgent: 'Chrome/142.0.0.0', bluetooth: {}, language: 'ja-JP' });
        mockFirmwareReleaseFetch();
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            platformInfo: { platform: 'web', adapterType: 'WebBluetooth', isSupported: true },
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /FW更新/ }).click();
        });
        expect(await screen.findByText('STM32 FW更新')).toBeInTheDocument();
        expect(await screen.findByText(/更新用Wi-Fiへの手動接続とブラウザのアクセス許可が必要です/)).toBeInTheDocument();
        const stm32Card = screen.getByText('STM32 FW更新').closest('section')!;
        await waitFor(() => expect(stm32Card.querySelector('.firmware-update-entry-primary')).toBeEnabled());
    });
    it('explains why STM32 field updates are unavailable in iOS browsers', async () => {
        vi.stubGlobal('navigator', { userAgent: 'iPhone Bluefy', bluetooth: {}, language: 'ja-JP' });
        mockFirmwareReleaseFetch();
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            platformInfo: { platform: 'web', adapterType: 'WebBluetooth', isSupported: true },
        })}/>);
        fireEvent.click(screen.getByRole('button', { name: /FW更新/ }));
        expect(await screen.findByText(/iPhone／iPadのブラウザではSTM32更新に対応していません/)).toBeInTheDocument();
        const stm32Card = screen.getByText('STM32 FW更新').closest('section')!;
        expect(stm32Card.querySelector('.firmware-update-entry-primary')).toBeDisabled();
    });
    it.each([
        ['empty', ''],
        ['false', 'false'],
        ['another value', 'TRUE']
    ])('does not render or request the STM32 updater when the feature flag is %s', async (_label, value) => {
        void _label;
        vi.unstubAllEnvs();
        vi.stubEnv('VITE_STM32_UPDATER_ENABLED', value);
        mockFirmwareReleaseFetch();
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            otaControlStatus: createOtaControlStatus(),
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /FW更新/ }).click();
        });
        expect(await screen.findByText('ESP32 FW更新')).toBeInTheDocument();
        expect(screen.queryByText('STM32 FW更新')).not.toBeInTheDocument();
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
        const requestedUrls = vi.mocked(globalThis.fetch).mock.calls.map(([input]) => String(input));
        expect(requestedUrls.some((url) => url.includes('/api/stm32-firmware/'))).toBe(false);
    });
    it('renders and requests the STM32 updater when its feature flag is exactly true', async () => {
        mockFirmwareReleaseFetch();
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            otaControlStatus: createOtaControlStatus(),
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /FW更新/ }).click();
        });
        expect(await screen.findByText('STM32 FW更新')).toBeInTheDocument();
        await waitFor(() => {
            const requestedUrls = vi.mocked(globalThis.fetch).mock.calls.map(([input]) => String(input));
            expect(requestedUrls.some((url) => url.includes('/api/stm32-firmware/releases'))).toBe(true);
        });
    });
    it('runs OTA prepare then activate from the single Wi-Fi connection step after firmware is cached', async () => {
        mockFirmwareReleaseFetch();
        const onWriteOtaControl = vi.fn(async (op: OtaControlOp) => createOtaControlStatus({
            lastOpCode: op === 'preparePortal' ? 1 : 2,
            lastOp: op,
            portalActive: op === 'activatePortal',
            hasCredentials: true,
            nodeId: 7,
            ssid: 'ULSA-EVO-OTA-7',
            password: 'ota-pass',
            token: 'ota-token',
            ip: '192.168.4.1',
        }));
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            connectedDevice: { deviceId: 'device-a', name: 'ULSA EVO #7', nodeId: 7 },
            otaControlStatus: createOtaControlStatus(),
            onWriteOtaControl,
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /FW更新/ }).click();
        });
        const downloadButton = await screen.findByRole('button', { name: /FWを取得/ });
        await waitFor(() => expect(downloadButton).not.toBeDisabled());
        await act(async () => {
            downloadButton.click();
        });
        await waitFor(() => {
            expect(screen.getByText(/KB 取得済み/)).toBeInTheDocument();
        });
        expect(onWriteOtaControl).not.toHaveBeenCalled();
        await act(async () => {
            screen.getByRole('button', { name: /更新用Wi-Fiを開始/ }).click();
        });
        await waitFor(() => {
            expect(onWriteOtaControl).toHaveBeenCalledTimes(2);
        });
        expect(onWriteOtaControl).toHaveBeenNthCalledWith(1, 'preparePortal');
        expect(onWriteOtaControl).toHaveBeenNthCalledWith(2, 'activatePortal');
    });
    it('continues to Wi-Fi status verification when activate portal readback is still queued', async () => {
        mockFirmwareReleaseFetch({
            statusBody: {
                nodeId: 7,
                ssid: 'ULSA-EVO-OTA-7',
            },
        });
        softApMock.isNativeSoftApJoinAvailable.mockReturnValue(true);
        softApMock.connectToEsp32SoftAp.mockResolvedValue({
            ssid: 'ULSA-EVO-OTA-7',
            connected: true,
        });
        const onWriteOtaControl = vi.fn(async (op: OtaControlOp) => createOtaControlStatus({
            lastOpCode: op === 'preparePortal' ? 1 : 2,
            lastOp: op,
            resultCode: op === 'activatePortal' ? 1 : 0,
            result: op === 'activatePortal' ? 'queued' : 'ok',
            portalActive: false,
            hasCredentials: true,
            nodeId: 7,
            ssid: 'ULSA-EVO-OTA-7',
            password: 'ota-pass',
            token: 'ota-token',
            ip: '192.168.4.1',
        }));
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            connectedDevice: { deviceId: 'device-a', name: 'ULSA EVO #7', nodeId: 7 },
            otaControlStatus: createOtaControlStatus({
                hasCredentials: true,
                nodeId: 7,
                ssid: 'ULSA-EVO-OTA-7',
                password: 'ota-pass',
                token: 'ota-token',
                ip: '192.168.4.1',
            }),
            onWriteOtaControl,
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /FW更新/ }).click();
        });
        const downloadButton = await screen.findByRole('button', { name: /FWを取得/ });
        await waitFor(() => expect(downloadButton).not.toBeDisabled());
        await act(async () => {
            downloadButton.click();
        });
        await waitFor(() => {
            expect(screen.getByText(/KB 取得済み/)).toBeInTheDocument();
        });
        vi.useFakeTimers();
        await act(async () => {
            screen.getByRole('button', { name: /更新用Wi-Fiに接続/ }).click();
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3500);
        });
        expect(softApMock.connectToEsp32SoftAp).toHaveBeenCalledTimes(1);
        expect(onWriteOtaControl).toHaveBeenCalledTimes(1);
        expect(onWriteOtaControl).toHaveBeenCalledWith('activatePortal');
        expect(screen.getByText('更新用Wi-Fi接続を確認しました')).toBeInTheDocument();
        vi.useRealTimers();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /転送して更新/ })).not.toBeDisabled();
        });
    });
    it('does not count down while the iOS Wi-Fi confirmation dialog is waiting', async () => {
        mockFirmwareReleaseFetch();
        softApMock.isNativeSoftApJoinAvailable.mockReturnValue(true);
        let resolveJoin: (value: {
            ssid: string;
            connected: boolean;
            reason: string;
        }) => void = () => undefined;
        softApMock.connectToEsp32SoftAp.mockReturnValue(new Promise((resolve) => {
            resolveJoin = resolve;
        }));
        const onWriteOtaControl = vi.fn(async (op: OtaControlOp) => createOtaControlStatus({
            lastOpCode: op === 'preparePortal' ? 1 : 2,
            lastOp: op,
            portalActive: op === 'activatePortal',
            hasCredentials: true,
            ssid: 'ULSA-EVO-OTA-0',
            password: 'ota-pass-123',
            token: 'ota-token',
            ip: '192.168.4.1',
        }));
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            otaControlStatus: createOtaControlStatus(),
            onWriteOtaControl,
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /FW更新/ }).click();
        });
        const downloadButton = await screen.findByRole('button', { name: /FWを取得/ });
        await waitFor(() => expect(downloadButton).not.toBeDisabled());
        await act(async () => {
            downloadButton.click();
        });
        await waitFor(() => {
            expect(screen.getByText(/KB 取得済み/)).toBeInTheDocument();
        });
        vi.useFakeTimers();
        await act(async () => {
            screen.getByRole('button', { name: /更新用Wi-Fiに接続/ }).click();
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3500);
        });
        expect(onWriteOtaControl).toHaveBeenCalledTimes(2);
        expect(softApMock.connectToEsp32SoftAp).toHaveBeenCalledTimes(1);
        expect(screen.getByText('iOSの確認ダイアログで接続を承認してください')).toBeInTheDocument();
        expect(screen.queryByText(/目安あと/)).not.toBeInTheDocument();
        await act(async () => {
            resolveJoin({ ssid: 'ULSA-EVO-OTA-0', connected: false, reason: 'userDenied' });
            await Promise.resolve();
        });
    });
    it('keeps transfer disabled when native SoftAP join fails', async () => {
        mockFirmwareReleaseFetch();
        softApMock.isNativeSoftApJoinAvailable.mockReturnValue(true);
        softApMock.connectToEsp32SoftAp.mockResolvedValue({
            ssid: 'ULSA-EVO-OTA-0',
            connected: false,
            reason: 'joinFailed',
            message: 'ネットワークに接続できません',
        });
        const onWriteOtaControl = vi.fn(async (op: OtaControlOp) => createOtaControlStatus({
            lastOpCode: op === 'preparePortal' ? 1 : 2,
            lastOp: op,
            portalActive: op === 'activatePortal',
            hasCredentials: true,
            ssid: 'ULSA-EVO-OTA-0',
            password: 'ota-pass-123',
            token: 'ota-token',
            ip: '192.168.4.1',
        }));
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            otaControlStatus: createOtaControlStatus(),
            onWriteOtaControl,
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /FW更新/ }).click();
        });
        const downloadButton = await screen.findByRole('button', { name: /FWを取得/ });
        await waitFor(() => expect(downloadButton).not.toBeDisabled());
        await act(async () => {
            downloadButton.click();
        });
        await waitFor(() => {
            expect(screen.getByText(/KB 取得済み/)).toBeInTheDocument();
        });
        vi.useFakeTimers();
        await act(async () => {
            screen.getByRole('button', { name: /更新用Wi-Fiに接続/ }).click();
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3500);
        });
        expect(onWriteOtaControl).toHaveBeenCalledTimes(2);
        expect(screen.getByText(/iOSが「ULSA-EVO-OTA-0」へ参加できませんでした.*本体が白表示ならStep 2/))
            .toBeInTheDocument();
        expect(screen.getByRole('button', { name: /転送して更新/ })).toBeDisabled();
    });
    it('keeps transfer disabled when native SoftAP join reports connected but ESP32 status is unreachable', async () => {
        mockFirmwareReleaseFetch({ statusReachable: false });
        softApMock.isNativeSoftApJoinAvailable.mockReturnValue(true);
        softApMock.connectToEsp32SoftAp.mockResolvedValue({
            ssid: 'ULSA-EVO-OTA-0',
            connected: true,
        });
        const onWriteOtaControl = vi.fn(async (op: OtaControlOp) => createOtaControlStatus({
            lastOpCode: op === 'preparePortal' ? 1 : 2,
            lastOp: op,
            portalActive: op === 'activatePortal',
            hasCredentials: true,
            ssid: 'ULSA-EVO-OTA-0',
            password: 'ota-pass-123',
            token: 'ota-token',
            ip: '192.168.4.1',
        }));
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            otaControlStatus: createOtaControlStatus(),
            onWriteOtaControl,
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /FW更新/ }).click();
        });
        const downloadButton = await screen.findByRole('button', { name: /FWを取得/ });
        await waitFor(() => expect(downloadButton).not.toBeDisabled());
        await act(async () => {
            downloadButton.click();
        });
        await waitFor(() => {
            expect(screen.getByText(/KB 取得済み/)).toBeInTheDocument();
        });
        vi.useFakeTimers();
        await act(async () => {
            screen.getByRole('button', { name: /更新用Wi-Fiに接続/ }).click();
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(24000);
        });
        expect(screen.getByText('更新用Wi-Fi接続後もESP32に到達できません。iOSのWi-Fi接続先を確認してください')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /転送して更新/ })).toBeDisabled();
    });
    it('keeps transfer disabled when ESP32 status responds before the portal is active', async () => {
        mockFirmwareReleaseFetch({
            statusBody: {
                state: 'WiFi Disconnected',
                portalActive: false,
                updating: false,
                nodeId: 0,
                ssid: 'ULSA-EVO-OTA-0',
                remainingSeconds: 0,
            },
        });
        softApMock.isNativeSoftApJoinAvailable.mockReturnValue(true);
        softApMock.connectToEsp32SoftAp.mockResolvedValue({
            ssid: 'ULSA-EVO-OTA-0',
            connected: true,
        });
        const onWriteOtaControl = vi.fn(async (op: OtaControlOp) => createOtaControlStatus({
            lastOpCode: op === 'preparePortal' ? 1 : 2,
            lastOp: op,
            portalActive: op === 'activatePortal',
            hasCredentials: true,
            ssid: 'ULSA-EVO-OTA-0',
            password: 'ota-pass-123',
            token: 'ota-token',
            ip: '192.168.4.1',
        }));
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            otaControlStatus: createOtaControlStatus(),
            onWriteOtaControl,
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /FW更新/ }).click();
        });
        const downloadButton = await screen.findByRole('button', { name: /FWを取得/ });
        await waitFor(() => expect(downloadButton).not.toBeDisabled());
        await act(async () => {
            downloadButton.click();
        });
        await waitFor(() => {
            expect(screen.getByText(/KB 取得済み/)).toBeInTheDocument();
        });
        vi.useFakeTimers();
        await act(async () => {
            screen.getByRole('button', { name: /更新用Wi-Fiに接続/ }).click();
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(24000);
        });
        expect(screen.getByText('更新用Wi-Fi接続後もESP32に到達できません。iOSのWi-Fi接続先を確認してください')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /転送して更新/ })).toBeDisabled();
    });
    it('keeps transfer disabled when ESP32 status reports a different SoftAP SSID', async () => {
        mockFirmwareReleaseFetch({
            statusBody: {
                nodeId: 9,
                ssid: 'ULSA-EVO-OTA-9',
            },
        });
        softApMock.isNativeSoftApJoinAvailable.mockReturnValue(true);
        softApMock.connectToEsp32SoftAp.mockResolvedValue({
            ssid: 'ULSA-EVO-OTA-0',
            connected: true,
        });
        const onWriteOtaControl = vi.fn(async (op: OtaControlOp) => createOtaControlStatus({
            lastOpCode: op === 'preparePortal' ? 1 : 2,
            lastOp: op,
            portalActive: op === 'activatePortal',
            hasCredentials: true,
            ssid: 'ULSA-EVO-OTA-0',
            password: 'ota-pass-123',
            token: 'ota-token',
            ip: '192.168.4.1',
        }));
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            otaControlStatus: createOtaControlStatus(),
            onWriteOtaControl,
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /FW更新/ }).click();
        });
        const downloadButton = await screen.findByRole('button', { name: /FWを取得/ });
        await waitFor(() => expect(downloadButton).not.toBeDisabled());
        await act(async () => {
            downloadButton.click();
        });
        await waitFor(() => {
            expect(screen.getByText(/KB 取得済み/)).toBeInTheDocument();
        });
        vi.useFakeTimers();
        await act(async () => {
            screen.getByRole('button', { name: /更新用Wi-Fiに接続/ }).click();
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3500);
        });
        expect(screen.getByText('ESP32の更新用Wi-Fi名が接続情報と一致しません。BLE接続からやり直してください')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /転送して更新/ })).toBeDisabled();
    });
    it('keeps ESP32 OTA available when the informational Node ID changes', async () => {
        mockFirmwareReleaseFetch({
            statusBody: {
                nodeId: 9,
                ssid: 'ULSA-EVO-OTA-0',
            },
        });
        softApMock.isNativeSoftApJoinAvailable.mockReturnValue(true);
        softApMock.connectToEsp32SoftAp.mockResolvedValue({
            ssid: 'ULSA-EVO-OTA-0',
            connected: true,
        });
        const onWriteOtaControl = vi.fn(async (op: OtaControlOp) => createOtaControlStatus({
            lastOpCode: op === 'preparePortal' ? 1 : 2,
            lastOp: op,
            portalActive: op === 'activatePortal',
            hasCredentials: true,
            nodeId: 0,
            ssid: 'ULSA-EVO-OTA-0',
            password: 'ota-pass-123',
            token: 'ota-token',
            ip: '192.168.4.1',
        }));
        const drawerProps = createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            connectedDevice: { deviceId: 'device-a', name: 'ULSA EVO #0', nodeId: 0 },
            otaControlStatus: createOtaControlStatus({
                protocolVersion: 3,
                hasCredentials: true,
                nodeId: 0,
                ssid: 'ULSA-EVO-OTA-0',
                password: 'ota-pass-123',
                token: 'ota-token',
                ip: '192.168.4.1',
            }),
            onWriteOtaControl,
        });
        const { rerender } = render(<BLESettingsDrawer {...drawerProps}/>);
        await act(async () => {
            screen.getByRole('button', { name: /FW更新/ }).click();
        });
        const downloadButton = await screen.findByRole('button', { name: /FWを取得/ });
        await waitFor(() => expect(downloadButton).not.toBeDisabled());
        await act(async () => {
            downloadButton.click();
        });
        await waitFor(() => {
            expect(screen.getByText(/KB 取得済み/)).toBeInTheDocument();
        });
        vi.useFakeTimers();
        await act(async () => {
            screen.getByRole('button', { name: /更新用Wi-Fiに接続/ }).click();
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3500);
        });
        expect(screen.getByText(/Node ID表示が変わっています/)).toHaveTextContent('更新を継続できます');
        expect(screen.getByText('更新用Wi-Fi接続を確認しました')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /転送して更新/ })).toBeEnabled();
        rerender(<BLESettingsDrawer {...drawerProps} connectionState="disconnected" connectedDevice={null}/>);
        expect(screen.getByRole('button', { name: /更新用Wi-Fiに接続 接続確認済み/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /転送して更新/ })).toBeEnabled();
    });
    it('uses the fresh OTA session when the connected BLE device node is stale', async () => {
        mockFirmwareReleaseFetch({
            statusBody: {
                nodeId: 0,
                ssid: 'ULSA-EVO-OTA-0',
            },
        });
        softApMock.isNativeSoftApJoinAvailable.mockReturnValue(true);
        softApMock.connectToEsp32SoftAp.mockResolvedValue({
            ssid: 'ULSA-EVO-OTA-0',
            connected: true,
        });
        const onWriteOtaControl = vi.fn(async (op: OtaControlOp) => createOtaControlStatus({
            lastOpCode: op === 'preparePortal' ? 1 : 2,
            lastOp: op,
            portalActive: op === 'activatePortal',
            hasCredentials: true,
            nodeId: 0,
            ssid: 'ULSA-EVO-OTA-0',
            password: 'ota-pass-123',
            token: 'ota-token',
            ip: '192.168.4.1',
        }));
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            connectedDevice: { deviceId: 'device-a', name: 'ULSA EVO #1', nodeId: 1 },
            otaControlStatus: createOtaControlStatus(),
            onWriteOtaControl,
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /FW更新/ }).click();
        });
        const downloadButton = await screen.findByRole('button', { name: /FWを取得/ });
        await waitFor(() => expect(downloadButton).not.toBeDisabled());
        await act(async () => {
            downloadButton.click();
        });
        await waitFor(() => {
            expect(screen.getByText(/KB 取得済み/)).toBeInTheDocument();
        });
        vi.useFakeTimers();
        await act(async () => {
            screen.getByRole('button', { name: /更新用Wi-Fiに接続/ }).click();
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3500);
        });
        expect(onWriteOtaControl).toHaveBeenCalledTimes(2);
        expect(softApMock.connectToEsp32SoftAp).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(/接続中デバイスのnode IDと更新用Wi-Fi情報が一致しません/)).not.toBeInTheDocument();
        expect(screen.getByText('更新用Wi-Fi接続を確認しました')).toBeInTheDocument();
    });
    it('stops before Wi-Fi join when activate portal returns a failure result', async () => {
        mockFirmwareReleaseFetch();
        softApMock.isNativeSoftApJoinAvailable.mockReturnValue(true);
        const onWriteOtaControl = vi.fn(async (op: OtaControlOp) => createOtaControlStatus({
            lastOpCode: op === 'preparePortal' ? 1 : 2,
            lastOp: op,
            resultCode: op === 'activatePortal' ? 6 : 0,
            result: op === 'activatePortal' ? 'failed' : 'ok',
            portalActive: false,
            hasCredentials: true,
            ssid: 'ULSA-EVO-OTA-0',
            password: 'ota-pass-123',
            token: 'ota-token',
            ip: '192.168.4.1',
        }));
        render(<BLESettingsDrawer {...createDrawerProps({
            capabilitiesStatus: readyCapabilitiesStatus,
            otaControlStatus: createOtaControlStatus(),
            onWriteOtaControl,
        })}/>);
        await act(async () => {
            screen.getByRole('button', { name: /FW更新/ }).click();
        });
        const downloadButton = await screen.findByRole('button', { name: /FWを取得/ });
        await waitFor(() => expect(downloadButton).not.toBeDisabled());
        await act(async () => {
            downloadButton.click();
        });
        await waitFor(() => {
            expect(screen.getByText(/KB 取得済み/)).toBeInTheDocument();
        });
        await act(async () => {
            screen.getByRole('button', { name: /更新用Wi-Fiに接続/ }).click();
        });
        await waitFor(() => {
            expect(screen.getByText('ESP32の更新用Wi-Fi起動に失敗しました')).toBeInTheDocument();
        });
        expect(onWriteOtaControl).toHaveBeenCalledTimes(2);
        expect(softApMock.connectToEsp32SoftAp).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /転送して更新/ })).toBeDisabled();
    });
});
