import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
} from '@ionic/react';
import { checkmarkCircle } from 'ionicons/icons';
import type { BLEDeviceInfo } from '../../hooks/useBLE';
import BLESignalStrength from '../BLESignalStrength';

type ConnectedDeviceCardProps = {
  device: BLEDeviceInfo;
};

export const ConnectedDeviceCard = ({ device }: ConnectedDeviceCardProps) => (
  <IonCard>
    <IonCardHeader>
      <IonCardTitle>
        <IonIcon icon={checkmarkCircle} color="success" />
        {' '}接続中のデバイス
      </IonCardTitle>
    </IonCardHeader>
    <IonCardContent>
      <IonList lines="none">
        <IonItem>
          <IonLabel>
            <h2>{device.name || '不明なデバイス'}</h2>
            {device.nodeId !== undefined && (
              <p>Node ID: <strong>{device.nodeId}</strong></p>
            )}
            <p className="device-id">{device.deviceId}</p>
          </IonLabel>
          <BLESignalStrength rssi={device.rssi} className="connected-device-signal" />
        </IonItem>
      </IonList>
    </IonCardContent>
  </IonCard>
);
