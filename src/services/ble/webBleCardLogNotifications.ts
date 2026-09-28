import type { CardLogDetailStatus } from '../../types/ble';
import { parseCardLogDetailStatus } from './bleDataParser';

export interface WebBleCardLogDetailNotification {
  characteristic: BluetoothRemoteGATTCharacteristic;
  handler: (event: Event) => void;
}

export const startWebBleCardLogDetailNotification = async (
  characteristic: BluetoothRemoteGATTCharacteristic,
  callback: (status: CardLogDetailStatus) => void
): Promise<WebBleCardLogDetailNotification | null> => {
  if (!characteristic.properties.notify) return null;

  const handler = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    try {
      callback(parseCardLogDetailStatus(value));
    } catch (error) {
      console.warn('[BLE] カードログ詳細Notify解析失敗:', error);
    }
  };

  try {
    characteristic.addEventListener('characteristicvaluechanged', handler);
    await characteristic.startNotifications();
    return { characteristic, handler };
  } catch (error) {
    characteristic.removeEventListener('characteristicvaluechanged', handler);
    console.warn('[BLE] カードログ詳細Notify開始失敗:', error);
    return null;
  }
};
