import { useEffect, useState } from 'react';
import {
  IonCard,
  IonCardContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonSpinner,
} from '@ionic/react';
import { bulbOutline } from 'ionicons/icons';
import { RadioTower } from 'lucide-react';
import type { BLEDeviceInfo } from '../../hooks/useBLE';
import BLESignalStrength from '../BLESignalStrength';
import { NativeControlButton } from '../controls';

type AvailableDevicesCardProps = {
  devices: BLEDeviceInfo[];
  canSelectDevice: boolean;
  canIdentifyDevice: boolean;
  identifyingDeviceId: string | null;
  identifyError: string | null;
  onConnectToDevice: (device: BLEDeviceInfo) => void;
  onIdentifyDevice: (device: BLEDeviceInfo) => void;
};

// BLE identification is write-only: this is a visual estimate, not a device acknowledgement.
const IDENTIFY_START_ESTIMATE_MS = 4000;
const IDENTIFY_RESULT_DISPLAY_MS = 2000;

type IdentifyDeviceButtonProps = {
  device: BLEDeviceInfo;
  canIdentifyDevice: boolean;
  isIdentifying: boolean;
  identifyError: string | null;
  onIdentifyDevice: (device: BLEDeviceInfo) => void;
};

const IdentifyDeviceButton = ({
  device,
  canIdentifyDevice,
  isIdentifying,
  identifyError,
  onIdentifyDevice,
}: IdentifyDeviceButtonProps) => {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [estimateElapsed, setEstimateElapsed] = useState(false);

  useEffect(() => {
    if (startedAt === null) return;
    const elapsed = Date.now() - startedAt;
    const estimateTimer = window.setTimeout(
      () => setEstimateElapsed(true),
      Math.max(0, IDENTIFY_START_ESTIMATE_MS - elapsed),
    );
    const resetTimer = window.setTimeout(() => {
      if (!isIdentifying) setStartedAt(null);
    }, Math.max(0, IDENTIFY_START_ESTIMATE_MS + IDENTIFY_RESULT_DISPLAY_MS - elapsed));
    return () => {
      window.clearTimeout(estimateTimer);
      window.clearTimeout(resetTimer);
    };
  }, [startedAt, isIdentifying]);

  useEffect(() => {
    if (identifyError) setStartedAt(null);
  }, [identifyError]);

  const isEstimating = startedAt !== null && !estimateElapsed;
  const isWaiting = startedAt !== null && estimateElapsed && isIdentifying;
  const isShowingResult = startedAt !== null && estimateElapsed && !isIdentifying;
  const label = isEstimating
    ? 'LED点滅を準備中…'
    : isWaiting
      ? '通信中…'
      : isShowingResult
        ? 'LEDをご確認ください'
        : isIdentifying
          ? '通信中…'
          : 'LEDを点滅してさがす';

  return (
    <NativeControlButton
      className="ble-identify-button"
      controlSize="M44"
      controlVariant="ghost"
      tone="warning"
      aria-label={`${device.name || 'ULSA'} の${label}`}
      disabled={!canIdentifyDevice || startedAt !== null}
      aria-busy={isIdentifying || isEstimating || isWaiting || undefined}
      data-identify-active={startedAt !== null || undefined}
      onClick={() => {
        if (!canIdentifyDevice || startedAt !== null) return;
        setEstimateElapsed(false);
        setStartedAt(Date.now());
        onIdentifyDevice(device);
      }}
    >
      {startedAt !== null && (
        <svg className="ble-identify-progress" viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true">
          <path
            d="M 100 1 H 190 Q 199 1 199 10 V 34 Q 199 43 190 43 H 10 Q 1 43 1 34 V 10 Q 1 1 10 1 H 100"
            pathLength="100"
            style={{ animationDuration: `${IDENTIFY_START_ESTIMATE_MS}ms` }}
          />
        </svg>
      )}
      {isWaiting || (isIdentifying && startedAt === null) ? (
        <IonSpinner name="crescent" aria-hidden="true" />
      ) : (
        <IonIcon icon={bulbOutline} aria-hidden="true" />
      )}
      <span aria-live="polite">{label}</span>
    </NativeControlButton>
  );
};

const formatDeviceMeta = (device: BLEDeviceInfo): string => {
  const parts = [];
  if (device.nodeId !== undefined) parts.push(`Node ID: ${device.nodeId}`);
  return parts.join(' / ');
};

export const AvailableDevicesCard = ({
  devices,
  canSelectDevice,
  canIdentifyDevice,
  identifyingDeviceId,
  identifyError,
  onConnectToDevice,
  onIdentifyDevice,
}: AvailableDevicesCardProps) => (
  <section className="ble-device-list" aria-label="検出デバイス">
      <h2 className="ble-device-list-title">検出デバイス · {devices.length}台</h2>
        {devices.map((device) => {
          const deviceMeta = formatDeviceMeta(device);
          const deviceName = device.name || '不明なデバイス';
          return (
            <IonCard
              key={device.deviceId}
              className="ble-device-card"
              data-device-id={device.deviceId}
              role="group"
              aria-label={`${deviceName} の操作`}
            >
              <IonCardContent>
              <IonItem className="ble-device-item">
                <span slot="start" className="ble-device-tower-icon" aria-hidden="true">
                  <RadioTower className="ulsa-icon" size={20} strokeWidth={1.8} />
                </span>
                <IonLabel>
                  <h2>{deviceName}</h2>
                  {deviceMeta && <p>{deviceMeta}</p>}
                  <p className="device-id">{device.deviceId}</p>
                </IonLabel>
                <span slot="end" className="ble-device-signal-slot">
                  <BLESignalStrength rssi={device.rssi} className="ble-device-signal" />
                </span>
              </IonItem>
              <div className="ble-device-actions">
                <NativeControlButton
                  className="ble-device-connect-button"
                  controlSize="M44"
                  controlVariant="secondary"
                  aria-label={`${deviceName} に接続`}
                  disabled={!canSelectDevice}
                  onClick={() => {
                    if (canSelectDevice) {
                      onConnectToDevice(device);
                    }
                  }}
                >
                  接続
                </NativeControlButton>
                <IdentifyDeviceButton
                  device={device}
                  canIdentifyDevice={canIdentifyDevice}
                  isIdentifying={identifyingDeviceId === device.deviceId}
                  identifyError={identifyError}
                  onIdentifyDevice={onIdentifyDevice}
                />
              </div>
              </IonCardContent>
            </IonCard>
          );
        })}
  </section>
);
