import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le';
import type { RtcTimezoneStatus, RtcTimezoneWriteRequest } from '../../types/ble';
import { CHARACTERISTIC_UUIDS, SERVICE_UUIDS } from './bleConstants';
import {
  buildRtcTimezoneRequest,
  isRtcTimezoneOperationComplete,
  parseRtcTimezoneStatus,
} from './rtcTimezoneControl';

const POLL_INTERVAL_MS = 100;
const POLL_TIMEOUT_MS = 5000;
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const readCapacitorBleRtcTimezoneStatus = async (
  deviceId: string
): Promise<RtcTimezoneStatus | null> => {
  try {
    return parseRtcTimezoneStatus(await BleClient.read(
      deviceId,
      SERVICE_UUIDS.ULSA_WIND,
      CHARACTERISTIC_UUIDS.RTC_TIMEZONE_CONTROL
    ));
  } catch (error) {
    console.warn('[BLE] RTC timezone状態取得失敗:', error);
    return null;
  }
};

export const writeCapacitorBleRtcTimezone = async (
  deviceId: string,
  request: RtcTimezoneWriteRequest
): Promise<RtcTimezoneStatus | null> => {
  const baseline = await readCapacitorBleRtcTimezoneStatus(deviceId);
  if (!baseline) return null;

  try {
    const payload = buildRtcTimezoneRequest(request);
    await BleClient.write(
      deviceId,
      SERVICE_UUIDS.ULSA_WIND,
      CHARACTERISTIC_UUIDS.RTC_TIMEZONE_CONTROL,
      numbersToDataView(Array.from(payload))
    );
  } catch (error) {
    console.warn('[BLE] RTC timezone write失敗:', error);
    return null;
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let latest: RtcTimezoneStatus | null = null;
  do {
    await wait(POLL_INTERVAL_MS);
    latest = await readCapacitorBleRtcTimezoneStatus(deviceId);
    // A transient short request echo is not terminal; keep polling until the
    // firmware's main loop publishes a complete 28-byte status or timeout.
    if (!latest) continue;
    if (isRtcTimezoneOperationComplete(
      latest,
      request.op,
      baseline.operationGeneration
    )) {
      return latest;
    }
  } while (Date.now() < deadline);

  return latest;
};
