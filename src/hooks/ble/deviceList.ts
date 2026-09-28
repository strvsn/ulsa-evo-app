import type { BLEDevice, NotificationStartResult } from '../../services/ble';
import type { BLEDeviceInfo } from './types';

export const toDeviceInfo = (device: BLEDevice): BLEDeviceInfo => ({
  deviceId: device.deviceId,
  name: device.name,
  rssi: device.rssi,
  nodeId: device.nodeId,
});

export const sortDevicesByRssi = (devices: BLEDeviceInfo[]): BLEDeviceInfo[] =>
  [...devices].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));

export const areBLEDeviceInfosEqual = (a: BLEDeviceInfo, b: BLEDeviceInfo): boolean =>
  a.deviceId === b.deviceId &&
  a.name === b.name &&
  a.rssi === b.rssi &&
  a.nodeId === b.nodeId;

export const areBLEDeviceInfoListsEqual = (a: BLEDeviceInfo[], b: BLEDeviceInfo[]): boolean =>
  a.length === b.length && a.every((device, index) => areBLEDeviceInfosEqual(device, b[index]));

export const upsertDeviceInfo = (devices: BLEDeviceInfo[], device: BLEDeviceInfo): BLEDeviceInfo[] => {
  const index = devices.findIndex((d) => d.deviceId === device.deviceId);
  if (index === -1) {
    return [...devices, device];
  }

  const mergedDevice = { ...devices[index], ...device };
  if (areBLEDeviceInfosEqual(devices[index], mergedDevice)) {
    return devices;
  }

  const next = [...devices];
  next[index] = mergedDevice;
  return next;
};

export const mergeDeviceInfoList = (devices: BLEDevice[]): BLEDeviceInfo[] =>
  devices.reduce<BLEDeviceInfo[]>((merged, device) => upsertDeviceInfo(merged, toDeviceInfo(device)), []);

export const validateNotificationStartResult = (result: NotificationStartResult): void => {
  const startedStandard = Object.entries(result.required)
    .filter(([, started]) => started)
    .map(([name]) => name);

  if (startedStandard.length === 0) {
    throw new Error('標準センサー通知を1項目も開始できませんでした');
  }
};
