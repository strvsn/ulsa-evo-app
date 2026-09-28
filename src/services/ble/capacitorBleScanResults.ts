import type { BLEDevice as AppBLEDevice } from './IBLEAdapter';
import { parseNodeIdFromName, parseNodeIdFromServiceData } from './bleDataParser';
import { normalizeUlsaEvoDeviceName } from './deviceIdentity';
import { logBLEDebug } from './bleLogger';

interface CapacitorBleScanResult {
  device?: { deviceId: string; name?: string | null };
  localName?: string | null;
  rssi?: number;
  serviceData?: Record<string, DataView>;
}

const parseAdvertisedNodeId = (
  serviceData: Record<string, DataView> | undefined,
  name: string | null
): number | undefined => {
  try {
    if (serviceData && Object.keys(serviceData).length > 0) {
      logBLEDebug('[BLE] serviceData keys:', Object.keys(serviceData));
      for (const [uuid, data] of Object.entries(serviceData)) {
        logBLEDebug(
          `[BLE] serviceData[${uuid}] byteLength=${data.byteLength}`,
          Array.from({ length: data.byteLength }, (_, index) => data.getUint8(index))
        );
        // '181a' を含む全 UUID キーに対応（フル形式・短縮形・大文字小文字問わず）
        if (uuid.toLowerCase().replaceAll('-', '').includes('181a') && data.byteLength > 0) {
          const nodeId = parseNodeIdFromServiceData(data);
          logBLEDebug(`[BLE] NodeID parsed=${nodeId} from uuid=${uuid}`);
          return nodeId;
        }
      }
    } else {
      logBLEDebug('[BLE] serviceData なし:', name);
    }
  } catch (error) {
    console.warn('[BLE] serviceData 解析エラー:', error);
  }

  return parseNodeIdFromName(name);
};

/** Converts one native advertisement into the shared device-list contract. */
export const normalizeCapacitorBleScanResult = (
  result: CapacitorBleScanResult
): AppBLEDevice | null => {
  if (!result.device) return null;

  const receivedName = result.localName ?? result.device.name ?? null;
  const nodeId = parseAdvertisedNodeId(result.serviceData, receivedName);
  return {
    deviceId: result.device.deviceId,
    name: normalizeUlsaEvoDeviceName(receivedName, nodeId),
    rssi: result.rssi,
    nodeId,
  };
};
