import type { DeviceMode, DeviceModeStatus } from '../../types/ble';

export const DEVICE_MODE_STATUS_LENGTH = 4;

const DEVICE_MODE_BY_CODE = new Map<number, DeviceMode>([
  [0x00, 'uartMeasure'],
  [0x01, 'i2cMeasure'],
  [0x02, 'command'],
  [0x03, 'uartBridge'],
  [0x04, 'wifiPortal'],
  [0x05, 'bootloader'],
  [0x06, 'stm32Update'],
]);

export const parseDeviceModeStatus = (value: DataView): DeviceModeStatus => {
  if (value.byteLength < DEVICE_MODE_STATUS_LENGTH) {
    throw new Error(`ESP32モードステータスが短すぎます: ${value.byteLength} bytes`);
  }

  const modeCode = value.getUint8(1);
  const flags = value.getUint8(2);
  const phyCode = value.getUint8(3);

  return {
    protocolVersion: value.getUint8(0),
    modeCode,
    mode: DEVICE_MODE_BY_CODE.get(modeCode) ?? 'unknown',
    flags,
    phyCode,
    phy: phyCode === 0 ? '1m' : 'reserved',
    bleConnected: (flags & 0x01) !== 0,
    uartBridgeEnabled: (flags & 0x02) !== 0,
    i2cMeasureActive: (flags & 0x04) !== 0,
    commandMode: (flags & 0x08) !== 0,
    bootloaderMode: (flags & 0x10) !== 0,
    wifiPortalActive: (flags & 0x20) !== 0,
    stm32UpdateActive: (flags & 0x40) !== 0,
  };
};

export const getDeviceModeLabel = (mode: DeviceMode): string => {
  switch (mode) {
    case 'uartMeasure':
      return 'UART計測';
    case 'i2cMeasure':
      return 'I2C計測';
    case 'command':
      return 'コマンド';
    case 'uartBridge':
      return 'UARTブリッジ';
    case 'wifiPortal':
      return 'WiFiポータル';
    case 'bootloader':
      return 'STM32ブートローダー';
    case 'stm32Update':
      return 'STM32更新';
    default:
      return '不明';
  }
};

export const getDeviceModePhyLabel = (phy: DeviceModeStatus['phy']): string => {
  switch (phy) {
    case '1m':
      return '1M PHY';
    case 'reserved':
      return '予約値（非対応）';
    default:
      return '予約値（非対応）';
  }
};
