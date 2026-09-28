import { parseNodeIdFromName, parseNodeIdFromServiceData } from './bleDataParser';
import { logBLEDebug } from './bleLogger';
import { isChromeBrowser } from './platformDetector';

interface BluetoothAdvertisementEvent extends Event {
  serviceData?: Map<string, DataView>;
}

type BluetoothDeviceWithAdvertisements = BluetoothDevice & {
  unwatchAdvertisements?: () => void;
};

export const I2C_CONFIG_POLL_INTERVAL_MS = 200;
export const I2C_CONFIG_POLL_TIMEOUT_MS = 6000;
export const CARD_LOG_CONTROL_POLL_INTERVAL_MS = 200;
export const CARD_LOG_CONTROL_POLL_TIMEOUT_MS = 4000;
export const CARD_LOG_SETTINGS_POLL_INTERVAL_MS = 200;
export const CARD_LOG_SETTINGS_POLL_TIMEOUT_MS = 4000;
export const LED_BRIGHTNESS_POLL_INTERVAL_MS = 80;
export const LED_BRIGHTNESS_POLL_TIMEOUT_MS = 1500;
export const LED_WIND_REACTIVE_POLL_INTERVAL_MS = 80;
export const LED_WIND_REACTIVE_POLL_TIMEOUT_MS = 1500;

export const clonePayloadToArrayBuffer = (payload: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(payload.byteLength);
  new Uint8Array(buffer).set(payload);
  return buffer;
};

type PollUntilOptions<T> = {
  intervalMs: number;
  timeoutMs: number;
  readStatus: () => Promise<T | null>;
  isDone: (status: T) => boolean;
  retryNull?: boolean;
};

export const pollUntilStatusSettled = async <T>({
  intervalMs,
  timeoutMs,
  readStatus,
  isDone,
  retryNull = false,
}: PollUntilOptions<T>): Promise<T | null> => {
  const deadline = Date.now() + timeoutMs;
  let latest: T | null = null;
  do {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    latest = await readStatus();
    if (!latest) {
      if (retryNull) continue;
      return null;
    }
    if (isDone(latest)) {
      return latest;
    }
  } while (Date.now() < deadline);

  return latest;
};

export const diagnoseWebBleServices = async (
  server: BluetoothRemoteGATTServer | null
): Promise<void> => {
  if (!server) {
    console.warn('diagnoseServices: サーバーが未接続');
    return;
  }
  if (!isChromeBrowser()) {
    logBLEDebug('🔍 BLE診断: 非Chromeブラウザのためスキップ');
    return;
  }
  logBLEDebug('🔍 BLE診断: デバイスのサービス一覧');
  try {
    const services = await server.getPrimaryServices();
    logBLEDebug(`サービス数: ${services.length}`);
    for (const service of services) {
      logBLEDebug(`📦 サービス: ${service.uuid}`);
      try {
        const chars = await service.getCharacteristics();
        for (const c of chars) {
          const props = [
            c.properties.read ? 'Read' : '',
            c.properties.write ? 'Write' : '',
            c.properties.notify ? 'Notify' : '',
            c.properties.indicate ? 'Indicate' : '',
          ].filter(Boolean).join(', ');
          logBLEDebug(`  📝 ${c.uuid} [${props}]`);
        }
      } catch (error) {
        console.warn('  キャラクタリスティック取得失敗:', error);
      }
    }
  } catch (error) {
    console.error('サービス取得失敗:', error);
  }
};

const resolveNodeIdFromAdvertisements = async (
  device: BluetoothDeviceWithAdvertisements
): Promise<number | undefined> => new Promise((resolve) => {
  const timeoutId = setTimeout(() => {
    device.removeEventListener('advertisementreceived', handler);
    device.unwatchAdvertisements?.();
    logBLEDebug('[BLE] watchAdvertisements timeout: nodeId 取得不可');
    resolve(undefined);
  }, 3000);

  const handler = (event: Event) => {
    clearTimeout(timeoutId);
    device.removeEventListener('advertisementreceived', handler);
    device.unwatchAdvertisements?.();
    const svcData = (event as BluetoothAdvertisementEvent).serviceData;
    logBLEDebug('[BLE] advertisementreceived serviceData:', svcData);
    if (svcData) {
      for (const [uuid, data] of svcData.entries()) {
        logBLEDebug(`[BLE] web svcData[${uuid}] byteLength=${data.byteLength}`,
          Array.from({ length: data.byteLength }, (_, i) => data.getUint8(i)));
        if (uuid.toLowerCase().replaceAll('-', '').includes('181a') && data.byteLength > 0) {
          const id = parseNodeIdFromServiceData(data);
          logBLEDebug(`[BLE] Web NodeID parsed=${id}`);
          resolve(id);
          return;
        }
      }
    }
    resolve(undefined);
  };

  device.addEventListener('advertisementreceived', handler);
  device.watchAdvertisements?.().catch((err: unknown) => {
    console.warn('[BLE] watchAdvertisements Promise拒否:', err);
    clearTimeout(timeoutId);
    device.removeEventListener('advertisementreceived', handler);
    resolve(undefined);
  });
});

export const resolveWebBluetoothNodeId = async (device: BluetoothDevice): Promise<number | undefined> => {
  let nodeId: number | undefined;
  const advertisementDevice = device as BluetoothDeviceWithAdvertisements;
  if (isChromeBrowser() && typeof advertisementDevice.watchAdvertisements === 'function') {
    try {
      nodeId = await resolveNodeIdFromAdvertisements(advertisementDevice);
    } catch (error) {
      console.warn('[BLE] watchAdvertisements 非対応またはエラー:', error);
    }
  } else {
    logBLEDebug('[BLE] watchAdvertisements スキップ（非Chromeまたは未サポート）');
  }

  if (nodeId === undefined) {
    nodeId = parseNodeIdFromName(device.name);
    if (nodeId !== undefined) {
      logBLEDebug(`[BLE] NodeID デバイス名から取得: ${nodeId} (名前: ${device.name})`);
    }
  }
  return nodeId;
};
