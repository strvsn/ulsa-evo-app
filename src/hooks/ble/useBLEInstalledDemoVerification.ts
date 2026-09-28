import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { BLEPlatformInfo, IBLEAdapter } from '../../services/ble';
import type { DeviceInfo } from '../../types/ble';
import { mergeDeviceInfoList, toDeviceInfo } from './deviceList';
import type { BLEDeviceInfo, DemoFirmwareIdentityExpectation } from './types';

interface Options {
  adapterRef: RefObject<IBLEAdapter | null>;
  platformInfo: BLEPlatformInfo | null;
  connectToDevice: (device: BLEDeviceInfo) => Promise<void>;
  setDeviceInfo: Dispatch<SetStateAction<DeviceInfo | null>>;
}

const FIRMWARE_REVISION_PREFIX = /^\d{1,10}\.\d{1,10}\.\d{1,10}/;
const SOFTWARE_REVISION_PREFIX = /^r\d{1,10}\.g[0-9a-f]{12}\.demo/i;

const formatIdentityDiagnosticValue = (value: unknown, prefixPattern: RegExp): string => {
  if (typeof value !== 'string' || value.length === 0) return '判別不能（0文字）';

  const prefix = value.match(prefixPattern)?.[0];
  if (!prefix) return `判別不能（${Array.from(value).length}文字）`;
  const trailingLength = Array.from(value.slice(prefix.length)).length;
  return trailingLength === 0
    ? prefix
    : `${prefix} + 末尾に不要データ（${trailingLength}文字）`;
};

const describeIdentity = (firmwareRevision: unknown, softwareRevision: unknown): string =>
  `FW=${formatIdentityDiagnosticValue(firmwareRevision, FIRMWARE_REVISION_PREFIX)}, ` +
  `Build=${formatIdentityDiagnosticValue(softwareRevision, SOFTWARE_REVISION_PREFIX)}`;

export const useBLEInstalledDemoVerification = ({
  adapterRef,
  platformInfo,
  connectToDevice,
  setDeviceInfo,
}: Options) => useCallback(async (
  expected: DemoFirmwareIdentityExpectation
): Promise<void> => {
  const adapter = adapterRef.current;
  if (!adapter) {
    throw new Error('この環境ではDemo BLEの自動確認を利用できません');
  }

  let candidate: BLEDeviceInfo;
  if (platformInfo?.adapterType === 'WebBluetooth') {
    const selected = await adapter.scanAndSelect();
    if (!selected) {
      throw new Error('Demo候補が選択されませんでした。BLE接続を再確認してください');
    }
    candidate = toDeviceInfo(selected);
  } else if (platformInfo?.adapterType === 'Capacitor' &&
             typeof adapter.scanDevices === 'function') {
    const deadline = Date.now() + 60_000;
    let candidates: BLEDeviceInfo[] = [];
    while (Date.now() < deadline) {
      const devices = await adapter.scanDevices();
      candidates = mergeDeviceInfoList(devices)
        .filter((device) => device.name?.startsWith('ULSA EVO #'));
      if (candidates.length > 1) {
        throw new Error('Demo候補が複数見つかりました。他のULSA EVOの電源を切って再確認してください');
      }
      if (candidates.length === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (candidates.length !== 1) {
      throw new Error('Demo firmware転送済みですが、BLE起動を確認できませんでした');
    }
    candidate = candidates[0];
  } else {
    throw new Error('この環境ではDemo BLEの確認を利用できません');
  }

  await connectToDevice(candidate);
  const info = await adapter.getDeviceInfo();
  if (!info.firmwareRevision || !info.softwareRevision) {
    await adapter.disconnect();
    throw new Error('Demo firmwareのバージョン情報を読み取れず、転送したReleaseとの一致を確認できませんでした');
  }
  const expectedSoftwareRevision =
    `r${expected.revision}.g${expected.commit.slice(0, 12)}.demo`;
  if (info.firmwareRevision !== expected.version ||
      info.softwareRevision !== expectedSoftwareRevision) {
    await adapter.disconnect();
    const expectedIdentity = describeIdentity(expected.version, expectedSoftwareRevision);
    const actualIdentity = describeIdentity(info.firmwareRevision, info.softwareRevision);
    throw new Error(
      `再起動後のDemo firmware identityが転送したReleaseと一致しません` +
      `（期待: ${expectedIdentity} / 実機: ${actualIdentity}）`
    );
  }
  setDeviceInfo(info);
}, [adapterRef, connectToDevice, platformInfo?.adapterType, setDeviceInfo]);
