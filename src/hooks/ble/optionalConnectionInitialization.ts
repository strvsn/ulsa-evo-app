import type { Dispatch, SetStateAction } from 'react';
import type { IBLEAdapter } from '../../services/ble';
import type {
  BLECapabilitiesStatus,
  DeviceHealthStatus,
  DeviceInfo,
  DeviceModeStatus,
  I2cConfigStatus,
  LEDBrightnessStatus,
  SampleMetadataStatus,
  CardLogControlStatus,
  CardLogDetailStatus,
  CardLogSettingsStatus,
  CardStatus,
  Stm32FirmwareVersionStatus,
} from '../../types/ble';

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export const OPTIONAL_CONNECTION_TASK_TIMEOUT_MS = 2500;

export interface OptionalConnectionTask<T> {
  name: string;
  read: () => Promise<T>;
  apply: (value: T) => void;
  reject?: (error: unknown) => void;
}

interface OptionalConnectionInitializationOptions {
  adapter: IBLEAdapter;
  isCurrentSession: () => boolean;
  handleDeviceModeStatus: (status: DeviceModeStatus | null) => void;
  readRtcTimezoneStatus: () => Promise<unknown>;
  setDeviceInfo: StateSetter<DeviceInfo | null>;
  setStm32FirmwareVersionLastReadAt: StateSetter<number | null>;
  setSampleMetadataLastReadAt: StateSetter<number | null>;
  setDeviceHealthLastReadAt: StateSetter<number | null>;
  setCapabilitiesLastReadAt: StateSetter<number | null>;
  setCardStatusLastReadAt: StateSetter<number | null>;
  setCardLogControlSupported: StateSetter<boolean | null>;
  setCardLogDetailLastReadAt: StateSetter<number | null>;
  setCardLogSettingsLastReadAt: StateSetter<number | null>;
  setDeviceModeNotifyActive: StateSetter<boolean>;
  setDeviceModeSupported: StateSetter<boolean | null>;
  setI2cConfigSupported: StateSetter<boolean | null>;
  updateStm32FirmwareVersion: (status: Stm32FirmwareVersionStatus | null) => void;
  updateSampleMetadataStatus: (status: SampleMetadataStatus | null) => void;
  updateDeviceHealthStatus: (status: DeviceHealthStatus | null) => void;
  updateCapabilitiesStatus: (status: BLECapabilitiesStatus | null) => void;
  updateLedBrightnessStatus: (status: LEDBrightnessStatus | null) => void;
  updateCardStatus: (status: CardStatus | null) => void;
  updateCardLogControlStatus: (status: CardLogControlStatus | null) => void;
  updateCardLogDetailStatus: (status: CardLogDetailStatus | null) => void;
  updateCardLogSettingsStatus: (status: CardLogSettingsStatus | null) => void;
  updateI2cConfigStatus: (status: I2cConfigStatus | null) => void;
}

export const withOptionalConnectionTimeout = <T>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`${name} timed out`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });

export const startOptionalConnectionTasks = (
  tasks: OptionalConnectionTask<unknown>[],
  isCurrentSession: () => boolean,
  timeoutMs = OPTIONAL_CONNECTION_TASK_TIMEOUT_MS
): void => {
  for (const task of tasks) {
    void withOptionalConnectionTimeout(Promise.resolve().then(task.read), timeoutMs, task.name).then(
      (value) => {
        if (isCurrentSession()) task.apply(value);
      },
      (error) => {
        if (!isCurrentSession()) return;
        console.warn(`${task.name}失敗（接続は維持）:`, error);
        task.reject?.(error);
      }
    );
  }
};

export const startOptionalConnectionInitialization = ({
  adapter,
  isCurrentSession,
  handleDeviceModeStatus,
  readRtcTimezoneStatus,
  setDeviceInfo,
  setStm32FirmwareVersionLastReadAt,
  setSampleMetadataLastReadAt,
  setDeviceHealthLastReadAt,
  setCapabilitiesLastReadAt,
  setCardStatusLastReadAt,
  setCardLogControlSupported,
  setCardLogDetailLastReadAt,
  setCardLogSettingsLastReadAt,
  setDeviceModeNotifyActive,
  setDeviceModeSupported,
  setI2cConfigSupported,
  updateStm32FirmwareVersion,
  updateSampleMetadataStatus,
  updateDeviceHealthStatus,
  updateCapabilitiesStatus,
  updateLedBrightnessStatus,
  updateCardStatus,
  updateCardLogControlStatus,
  updateCardLogDetailStatus,
  updateCardLogSettingsStatus,
  updateI2cConfigStatus,
}: OptionalConnectionInitializationOptions): void => {
  const now = () => Date.now();
  const tasks: OptionalConnectionTask<unknown>[] = [
    {
      name: 'ESP32モードRead',
      read: () => adapter.getDeviceModeStatus(),
      apply: (value) => {
        const status = value as DeviceModeStatus | null;
        if (status) handleDeviceModeStatus(status);
      },
    },
    {
      name: 'ESP32モードNotify',
      read: () => adapter.startDeviceModeNotifications((status) => {
        if (isCurrentSession()) handleDeviceModeStatus(status);
      }),
      apply: (value) => {
        const active = value as boolean;
        setDeviceModeNotifyActive(active);
        setDeviceModeSupported((current) => active || current === true ? true : false);
      },
      reject: () => {
        setDeviceModeNotifyActive(false);
        setDeviceModeSupported((current) => current === true ? true : false);
      },
    },
    {
      name: 'デバイス情報取得',
      read: () => adapter.getDeviceInfo(),
      apply: (value) => {
        if (value) setDeviceInfo(value as DeviceInfo);
      },
    },
    {
      name: 'STM32 FWバージョン取得',
      read: () => adapter.getStm32FirmwareVersion(),
      apply: (value) => {
        updateStm32FirmwareVersion(value as Stm32FirmwareVersionStatus | null);
        setStm32FirmwareVersionLastReadAt(now());
      },
      reject: () => {
        updateStm32FirmwareVersion(null);
        setStm32FirmwareVersionLastReadAt(now());
      },
    },
    {
      name: 'Sample Metadata取得',
      read: () => adapter.getSampleMetadataStatus(),
      apply: (value) => {
        updateSampleMetadataStatus(value as SampleMetadataStatus | null);
        setSampleMetadataLastReadAt(now());
      },
      reject: () => {
        updateSampleMetadataStatus(null);
        setSampleMetadataLastReadAt(now());
      },
    },
    {
      name: 'Device Health取得',
      read: () => adapter.getDeviceHealthStatus(),
      apply: (value) => {
        updateDeviceHealthStatus(value as DeviceHealthStatus | null);
        setDeviceHealthLastReadAt(now());
      },
      reject: () => {
        updateDeviceHealthStatus(null);
        setDeviceHealthLastReadAt(now());
      },
    },
    {
      name: 'Capabilities取得',
      read: () => adapter.getCapabilitiesStatus(),
      apply: (value) => {
        updateCapabilitiesStatus(value as BLECapabilitiesStatus | null);
        setCapabilitiesLastReadAt(now());
      },
      reject: () => {
        updateCapabilitiesStatus(null);
        setCapabilitiesLastReadAt(now());
      },
    },
    {
      name: 'LED輝度取得',
      read: () => adapter.getLedBrightness(),
      apply: (value) => updateLedBrightnessStatus(value as LEDBrightnessStatus | null),
      reject: () => updateLedBrightnessStatus(null),
    },
    {
      name: 'カード状態取得',
      read: () => adapter.getCardStatus(),
      apply: (value) => {
        updateCardStatus(value as CardStatus | null);
        setCardStatusLastReadAt(now());
      },
      reject: () => {
        updateCardStatus(null);
        setCardStatusLastReadAt(now());
      },
    },
    {
      name: 'カードログ制御状態取得',
      read: () => adapter.getCardLogControlStatus(),
      apply: (value) => {
        const status = value as CardLogControlStatus | null;
        updateCardLogControlStatus(status);
        setCardLogControlSupported(status !== null);
      },
      reject: () => {
        updateCardLogControlStatus(null);
        setCardLogControlSupported(false);
      },
    },
    {
      name: 'カードログ詳細取得',
      read: () => adapter.getCardLogDetailStatus(),
      apply: (value) => {
        updateCardLogDetailStatus(value as CardLogDetailStatus | null);
        setCardLogDetailLastReadAt(now());
      },
      reject: () => {
        updateCardLogDetailStatus(null);
        setCardLogDetailLastReadAt(now());
      },
    },
    {
      name: 'カードログ設定取得',
      read: () => adapter.getCardLogSettingsStatus(),
      apply: (value) => {
        updateCardLogSettingsStatus(value as CardLogSettingsStatus | null);
        setCardLogSettingsLastReadAt(now());
      },
      reject: () => {
        updateCardLogSettingsStatus(null);
        setCardLogSettingsLastReadAt(now());
      },
    },
    {
      name: 'RTC時刻取得',
      read: readRtcTimezoneStatus,
      apply: () => undefined,
    },
    {
      name: 'I2C設定状態取得',
      read: () => adapter.writeI2cConfig({ op: 'read' }),
      apply: (value) => {
        const status = value as I2cConfigStatus | null;
        updateI2cConfigStatus(status);
        setI2cConfigSupported(status === null ? null : status.configWriteSupported);
      },
      reject: () => {
        updateI2cConfigStatus(null);
        setI2cConfigSupported(null);
      },
    },
  ];

  startOptionalConnectionTasks(tasks, isCurrentSession);
};
