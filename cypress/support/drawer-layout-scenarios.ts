import type { ComponentProps } from 'react';
import BLESettingsDrawer from '../../src/components/BLESettingsDrawer';
import { drawerLayoutFixtureProps } from './drawer-layout-fixture';
const longDisconnectedError = [
    'BLE未対応環境での長文エラー表示を検証します',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
].join('_');
export const disconnectedUnsupportedDrawerProps: ComponentProps<typeof BLESettingsDrawer> = {
    ...drawerLayoutFixtureProps,
    connectionState: 'disconnected',
    dataState: 'idle',
    connectedDevice: null,
    deviceInfo: null,
    stm32FirmwareVersion: null,
    sampleMetadataStatus: null,
    deviceHealthStatus: null,
    capabilitiesStatus: null,
    ledBrightnessStatus: null,
    ledBrightnessSupported: false,
    ledWindReactiveStatus: null,
    ledWindReactiveSupported: false,
    deviceResetStatus: null,
    deviceResetSupported: false,
    otaControlStatus: null,
    stm32UpdateControlStatus: null,
    cardStatus: null,
    cardLogDetailStatus: null,
    cardLogSettingsStatus: null,
    deviceModeStatus: null,
    deviceModeSupported: false,
    i2cConfigStatus: null,
    error: longDisconnectedError,
    isSupported: false,
    platformInfo: {
        platform: 'web',
        adapterType: 'Web Bluetooth',
        browserName: `UnsupportedBrowser_${longDisconnectedError}`,
        secureContext: false,
        webBluetoothAvailable: false,
        isSupported: false,
    },
};
