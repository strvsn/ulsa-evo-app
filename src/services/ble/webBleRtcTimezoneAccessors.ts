import type { RtcTimezoneStatus, RtcTimezoneWriteRequest } from '../../types/ble';
import { CHARACTERISTIC_UUIDS, SERVICE_UUIDS } from './bleConstants';
import {
  buildRtcTimezoneRequest,
  isRtcTimezoneOperationComplete,
  parseRtcTimezoneStatus,
} from './rtcTimezoneControl';
import {
  clonePayloadToArrayBuffer,
  pollUntilStatusSettled,
} from './webBleAdapterHelpers';
import type { GetWebBleCharacteristic } from './webBleFeatureAccessors';

const POLL_INTERVAL_MS = 100;
const POLL_TIMEOUT_MS = 5000;

export const readWebBleRtcTimezoneStatus = async (
  getCharacteristic: GetWebBleCharacteristic
): Promise<RtcTimezoneStatus | null> => {
  const characteristic = await getCharacteristic(
    SERVICE_UUIDS.ULSA_WIND,
    CHARACTERISTIC_UUIDS.RTC_TIMEZONE_CONTROL,
    false
  );
  if (!characteristic) return null;
  try {
    return parseRtcTimezoneStatus(await characteristic.readValue());
  } catch (error) {
    console.warn('[BLE] RTC timezone状態取得失敗:', error);
    return null;
  }
};

export const writeWebBleRtcTimezone = async (
  getCharacteristic: GetWebBleCharacteristic,
  request: RtcTimezoneWriteRequest
): Promise<RtcTimezoneStatus | null> => {
  const characteristic = await getCharacteristic(
    SERVICE_UUIDS.ULSA_WIND,
    CHARACTERISTIC_UUIDS.RTC_TIMEZONE_CONTROL,
    false
  );
  if (!characteristic) return null;

  let baseline: RtcTimezoneStatus;
  try {
    baseline = parseRtcTimezoneStatus(await characteristic.readValue());
  } catch (error) {
    console.warn('[BLE] RTC timezone write前状態取得失敗:', error);
    return null;
  }
  await characteristic.writeValue(
    clonePayloadToArrayBuffer(buildRtcTimezoneRequest(request))
  );

  return pollUntilStatusSettled({
    intervalMs: POLL_INTERVAL_MS,
    timeoutMs: POLL_TIMEOUT_MS,
    // Immediately after Write, some stacks briefly expose the 6/14-byte
    // request value before firmware replaces it with the 28-byte status.
    retryNull: true,
    readStatus: async () => {
      try {
        return parseRtcTimezoneStatus(await characteristic.readValue());
      } catch (error) {
        console.warn('[BLE] RTC timezone状態取得失敗:', error);
        return null;
      }
    },
    isDone: (status) => isRtcTimezoneOperationComplete(
      status,
      request.op,
      baseline.operationGeneration
    ),
  });
};
