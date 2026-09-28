import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le';
import { CHARACTERISTIC_UUIDS, SERVICE_UUIDS } from './bleConstants';
import { logBLEDebug } from './bleLogger';

const DEVICE_IDENTIFY_SETTLE_MS = 200;

/** Serializes the short identify connection with a subsequent normal connection. */
export class CapacitorBleDeviceIdentify {
  private pending: Promise<void> | null = null;

  constructor(private readonly getConnectedDeviceId: () => string | null) {}

  async waitForIdle(): Promise<void> {
    if (!this.pending) return;
    try {
      await this.pending;
    } catch {
      // A failed identify request must not prevent the user from connecting.
    }
  }

  identify(deviceId: string): Promise<void> {
    if (this.pending) return Promise.reject(new Error('LED識別中です'));

    const operation = this.performIdentify(deviceId);
    const tracked = operation.finally(() => {
      if (this.pending === tracked) this.pending = null;
    });
    this.pending = tracked;
    return tracked;
  }

  private async performIdentify(deviceId: string): Promise<void> {
    const connectedDeviceId = this.getConnectedDeviceId();
    if (connectedDeviceId && connectedDeviceId !== deviceId) {
      throw new Error('別のULSAに接続中は候補デバイスを識別できません');
    }
    const temporaryConnection = connectedDeviceId !== deviceId;

    try {
      if (temporaryConnection) {
        await BleClient.stopLEScan().catch(() => undefined);
        await BleClient.connect(deviceId);
      }
      const payload = numbersToDataView([0x01]);
      try {
        await BleClient.write(deviceId, SERVICE_UUIDS.ULSA_WIND, CHARACTERISTIC_UUIDS.DEVICE_IDENTIFY, payload);
      } catch (writeError) {
        logBLEDebug('[BLE] Device Identify acknowledged write不可、Write Without Responseへフォールバック:', writeError);
        await BleClient.writeWithoutResponse(
          deviceId,
          SERVICE_UUIDS.ULSA_WIND,
          CHARACTERISTIC_UUIDS.DEVICE_IDENTIFY,
          payload,
        );
      }
      if (temporaryConnection) {
        await new Promise((resolve) => setTimeout(resolve, DEVICE_IDENTIFY_SETTLE_MS));
      }
    } catch (error) {
      console.warn('[BLE] Device Identify write不可:', error);
      throw new Error('LED識別に失敗しました。ESP32 firmwareがDevice Identifyに対応しているか確認してください');
    } finally {
      if (temporaryConnection) {
        await BleClient.disconnect(deviceId).catch((error) => {
          console.warn('[BLE] Device Identify一時切断失敗:', error);
        });
      }
    }
  }
}
