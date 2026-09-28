import { memo, useEffect, useRef, useState } from 'react';
import { IonCard, IonCardContent } from '@ionic/react';
import { RadioTower, ScanLine, Unplug } from 'lucide-react';
import type { BLEConnectionState, BLEDataState } from '../hooks/useBLE';
import type { DisplaySampleListener } from '../hooks/ble/types';
import { recordPerfEvent } from '../utils/renderPerfDiagnostics';
import BLESignalStrength from './BLESignalStrength';
import {
  describeDeviceStatus,
  isSupportedDeviceStatusProtocol,
} from '../services/ble/deviceStatus';

interface StatusCardProps {
  connectionState: BLEConnectionState;
  dataState: BLEDataState;
  deviceName: string | null;
  signalRssi?: number;
  signalRssiSupported?: boolean;
  subscribeDisplaySamples?: (listener: DisplaySampleListener) => () => void;
  sensorStatus?: {
    sensorStatus: number;
    statusProtocolVersion?: number;
    statusFlags?: number;
    serviceStatus?: number;
    activeCause?: number;
  } | null;
  onClick: () => void;
}

const areStatusCardPropsEqual = (
  previous: StatusCardProps,
  next: StatusCardProps,
): boolean => (
  previous.connectionState === next.connectionState &&
  previous.dataState === next.dataState &&
  previous.deviceName === next.deviceName &&
  Object.is(previous.signalRssi, next.signalRssi) &&
  previous.signalRssiSupported === next.signalRssiSupported &&
  previous.subscribeDisplaySamples === next.subscribeDisplaySamples &&
  previous.sensorStatus?.sensorStatus === next.sensorStatus?.sensorStatus &&
  previous.sensorStatus?.statusProtocolVersion === next.sensorStatus?.statusProtocolVersion &&
  previous.sensorStatus?.statusFlags === next.sensorStatus?.statusFlags &&
  previous.sensorStatus?.serviceStatus === next.sensorStatus?.serviceStatus &&
  previous.sensorStatus?.activeCause === next.sensorStatus?.activeCause &&
  previous.onClick === next.onClick
);

/**
 * BLE接続状態を表示するカード
 * クリックでモーダルを開く / BLE接続を開始
 */
const StatusCard = memo<StatusCardProps>(({
  connectionState,
  dataState,
  deviceName,
  signalRssi,
  signalRssiSupported = true,
  subscribeDisplaySamples,
  sensorStatus,
  onClick,
}) => {
  recordPerfEvent('StatusCard.render');
  const [observedStandardFields, setObservedStandardFields] = useState(0);
  const observedStandardFieldsRef = useRef(0);
  const [partialDataGraceElapsed, setPartialDataGraceElapsed] = useState(false);
  useEffect(() => {
    observedStandardFieldsRef.current = 0;
    setObservedStandardFields(0);
    setPartialDataGraceElapsed(false);
    if (connectionState !== 'connected' || dataState !== 'live' || !subscribeDisplaySamples) return;

    const unsubscribe = subscribeDisplaySamples((update) => {
      const received = update.standardFieldReceivedAt;
      const mask = (received.windDirection === undefined ? 0 : 1)
        | (received.windSpeed === undefined ? 0 : 2)
        | (received.temperature === undefined ? 0 : 4);
      const next = observedStandardFieldsRef.current | mask;
      if (next === observedStandardFieldsRef.current) return;
      observedStandardFieldsRef.current = next;
      setObservedStandardFields(next);
    });
    const timer = window.setTimeout(() => setPartialDataGraceElapsed(true), 3000);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [connectionState, dataState, subscribeDisplaySamples]);

  const missingStandardFields = partialDataGraceElapsed && observedStandardFields !== 0
    ? [
      ...(observedStandardFields & 1 ? [] : ['風向']),
      ...(observedStandardFields & 2 ? [] : ['風速']),
      ...(observedStandardFields & 4 ? [] : ['温度']),
    ]
    : [];
  const partiallyReceiving = connectionState === 'connected' && dataState === 'live'
    && missingStandardFields.length > 0;
  const deviceStatusMessage = describeDeviceStatus(sensorStatus);
  const lowTemperatureAdvisory =
    sensorStatus?.statusProtocolVersion === 3 &&
    sensorStatus.sensorStatus === 1 &&
    sensorStatus.activeCause === 2;
  const deviceStatusNotReady =
    isSupportedDeviceStatusProtocol(sensorStatus?.statusProtocolVersion) &&
    sensorStatus?.sensorStatus === 0 &&
    ((sensorStatus?.statusFlags ?? 0) & 0x80) === 0 &&
    (sensorStatus?.activeCause ?? 0) === 0;

  const getStatusText = () => {
    if (connectionState === 'connected') {
      if (dataState === 'stale') return 'データ停止';
      if (lowTemperatureAdvisory) return '低温警告';
      if (deviceStatusMessage) return '計測無効';
      if (deviceStatusNotReady) return 'データ待ち';
      if (partiallyReceiving) return '一部データ受信';
      if (dataState === 'live') return 'LIVE';
      return 'データ待ち';
    }

    switch (connectionState) {
      case 'scanning':
        return 'スキャン中';
      case 'connecting':
        return '接続中...';
      default:
        return '未接続';
    }
  };

  const getStatusClass = () => {
    if (connectionState === 'connected') {
      if (lowTemperatureAdvisory || deviceStatusMessage) return 'stale';
      if (deviceStatusNotReady) return 'connecting';
      if (partiallyReceiving) return 'stale';
      if (dataState === 'live') return 'connected';
      if (dataState === 'stale') return 'stale';
      return 'connecting';
    }

    switch (connectionState) {
      case 'scanning':
      case 'connecting':
        return 'connecting';
      default:
        return 'disconnected';
    }
  };

  const getSubtitle = () => {
    if (connectionState === 'connected' && deviceName) {
      if (dataState === 'stale') {
        const lastStatus = deviceStatusMessage ? `（最終状態: ${deviceStatusMessage}）` : '';
        return `${deviceName} からのデータが停止しています${lastStatus}`;
      }
      if (deviceStatusMessage) return `${deviceName}: ${deviceStatusMessage}`;
      if (deviceStatusNotReady) return `${deviceName} のデータを待機中`;
      if (partiallyReceiving) return `${deviceName} ${missingStandardFields.join('・')}を受信できません`;
      if (dataState === 'waiting' || dataState === 'idle') {
        return `${deviceName} のデータを待機中`;
      }
      return `${deviceName} データ受信中`;
    }
    if (connectionState === 'scanning') {
      return 'デバイスを検索中...';
    }
    if (connectionState === 'connecting') {
      return 'デバイスへ接続中...';
    }
    return 'タップして接続';
  };

  const StatusIcon = connectionState === 'connected'
    ? RadioTower
    : connectionState === 'scanning' || connectionState === 'connecting'
      ? ScanLine
      : Unplug;

  const statusText = getStatusText();
  const subtitle = getSubtitle();

  return (
    <>
      <span
        className="ulsa-visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {`BLE接続状態: ${statusText}。${subtitle}`}
      </span>
      <IonCard className="status-card" button onClick={onClick}>
        <IonCardContent className="status-content">
          {connectionState === 'connected' ? (
            <BLESignalStrength
              rssi={signalRssi}
              unavailable={!signalRssiSupported}
              className="connection-signal-strength"
            />
          ) : (
            <StatusIcon
              className={`connection-icon ulsa-icon ${getStatusClass()}`}
              size={21}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          )}
          <span className="status-text">BLEデバイス</span>
          <div className={`status-badge ${getStatusClass()}`}>{statusText}</div>
          <div className="status-subtitle">{subtitle}</div>
        </IonCardContent>
      </IonCard>
    </>
  );
}, areStatusCardPropsEqual);

export default StatusCard;
