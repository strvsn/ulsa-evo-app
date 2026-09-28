import React from 'react';
import {
  IonModal,
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonFooter,
  IonLabel,
  IonSpinner,
  IonChip,
  IonCard,
  IonCardContent,
} from '@ionic/react';
import {
  RadioTower,
  TriangleAlert,
  X,
} from 'lucide-react';
import { recordPerfEvent } from '../utils/renderPerfDiagnostics';
import { AvailableDevicesCard } from './ble-modal/AvailableDevicesCard';
import { ConnectedDeviceCard } from './ble-modal/ConnectedDeviceCard';
import { areBLEModalPropsEqual } from './ble-modal/memo';
import type { BLEModalProps } from './ble-modal/types';
import {
  getConnectionStatusColor,
  getConnectionStatusText,
} from './ble-settings/formatters';
import { ULSA_DEVICE_NOT_FOUND_ERROR } from '../hooks/ble/scanMessages';
import { ControlIconButton, IonicControlButton } from './controls';
import './BLEModal.css';

const BLEModal: React.FC<BLEModalProps> = ({
  isOpen,
  onDismiss,
  connectionState,
  dataState,
  connectedDevice,
  availableDevices,
  identifyingDeviceId = null,
  error,
  isSupported,
  platformInfo,
  themeGradient,
  themeIsLight = false,
  isContinuousNativeScanActive = false,
  onScanAndConnect,
  onConnectToDevice,
  onIdentifyDevice = () => undefined,
  onDisconnect,
  onClearError,
}) => {
  recordPerfEvent('BLEModal.render');

  const isScanning = connectionState === 'scanning';
  const isConnecting = connectionState === 'connecting';
  const isConnected = connectionState === 'connected';
  const isContinuingNativeSearch = isContinuousNativeScanActive && !isConnected;
  const isBusy = isScanning || isConnecting;
  const canIdentifyDevice = identifyingDeviceId === null;
  const canSelectDetectedDevice = !isBusy;

  const getStatusText = () => isContinuingNativeSearch
    ? 'ULSAを捜索中...'
    : getConnectionStatusText(connectionState, dataState);
  const getStatusColor = () => getConnectionStatusColor(connectionState, dataState);

  const modalStyle = {
    '--ble-modal-gradient': themeGradient ?? 'linear-gradient(150deg, #071019 0%, #101d29 100%)',
  } as React.CSSProperties;
  const modalClassName = [
    'ble-modal',
    themeIsLight ? 'ble-modal-light' : '',
    !isConnected && availableDevices.length === 0 ? 'ble-modal-compact' : '',
  ].filter(Boolean).join(' ');

  if (!isOpen) {
    return (
      <IonModal
        isOpen={false}
        onDidDismiss={onDismiss}
        animated={false}
        className={modalClassName}
        style={modalStyle}
      />
    );
  }

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDismiss}
      animated={false}
      className={modalClassName}
      style={modalStyle}
    >
      <IonPage className="ble-modal-page">
        <IonHeader>
          <IonToolbar>
            <IonTitle>BLE接続</IonTitle>
            <ControlIconButton
              slot="end"
              className="ble-modal-close"
              aria-label="BLE接続ダイアログを閉じる"
              data-testid="ble-modal-close"
              onClick={onDismiss}
            >
              <X className="ulsa-icon" size={20} strokeWidth={1.9} aria-hidden="true" />
            </ControlIconButton>
          </IonToolbar>
        </IonHeader>

        <IonContent className="ble-modal-content">
        {/* 状態表示 */}
        <div
          className="ble-status-section"
          role="status"
          aria-label="BLE接続状態"
          aria-live="polite"
          aria-atomic="true"
        >
          <IonChip color={getStatusColor()}>
            {isBusy || isContinuingNativeSearch ? (
              <IonSpinner name="crescent" aria-hidden="true" />
            ) : (
              <RadioTower className="ulsa-icon" size={18} strokeWidth={1.8} aria-hidden="true" />
            )}
            <IonLabel>{getStatusText()}</IonLabel>
          </IonChip>
        </div>

        {/* エラー表示 */}
        {!isSupported && (
          <IonCard color="danger" role="alert">
            <IonCardContent className="ble-error-card">
              <TriangleAlert className="ulsa-icon" size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>このブラウザ/デバイスではBLEがサポートされていません</span>
            </IonCardContent>
          </IonCard>
        )}

        {error && !(isContinuingNativeSearch && error === ULSA_DEVICE_NOT_FOUND_ERROR) && (
          <IonCard color="warning" role="alert">
            <IonCardContent className="ble-error-card">
              <TriangleAlert className="ulsa-icon" size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>{error}</span>
              <ControlIconButton
                className="ble-error-dismiss"
                aria-label="接続エラーを閉じる"
                onClick={onClearError}
              >
                <X className="ulsa-icon" size={18} strokeWidth={1.9} aria-hidden="true" />
              </ControlIconButton>
            </IonCardContent>
          </IonCard>
        )}

        {/* 接続済みデバイス情報 */}
        {isConnected && connectedDevice && (
          <>
            <ConnectedDeviceCard device={connectedDevice} />

            {/* アクションボタン */}
            <div className="ble-action-buttons">
              <IonicControlButton controlSize="M44" controlVariant="destructive" tone="danger" expand="block" color="danger" onClick={onDisconnect}>
                切断
              </IonicControlButton>
            </div>
          </>
        )}

        {/* 未接続時の接続ボタン */}
        {!isConnected && (
          <div className="ble-connect-section">
            <p className="ble-instruction">
              {platformInfo?.adapterType === 'WebBluetooth'
                ? 'ボタンを押すと、ブラウザのデバイス選択画面が表示されます'
                : isContinuingNativeSearch
                  ? 'ULSA EVOを継続して捜索しています。電源を入れると一覧に表示されます'
                  : 'ボタンを押すと、デバイスを検索します。検出後、接続するULSAを一覧から選択してください'}
            </p>
            {availableDevices.length > 0 && (
              <AvailableDevicesCard
                devices={availableDevices}
                canSelectDevice={canSelectDetectedDevice}
                canIdentifyDevice={canIdentifyDevice}
                identifyingDeviceId={identifyingDeviceId}
                identifyError={error}
                onConnectToDevice={onConnectToDevice}
                onIdentifyDevice={onIdentifyDevice}
              />
            )}
          </div>
        )}
        </IonContent>
        {!isConnected && <IonFooter className="ble-modal-footer">
              <IonicControlButton
                controlSize="M44"
                controlVariant="primary"
                tone="accent"
                className={availableDevices.length > 0 ? 'ble-rescan-button' : undefined}
                expand="block"
                onClick={() => {
                  onScanAndConnect();
                }}
                disabled={!isSupported || isBusy || isContinuingNativeSearch}
              >
                <span slot="start" className="ble-button-icon" aria-hidden="true">
                  <RadioTower
                    className="ulsa-icon"
                    size={20}
                    strokeWidth={1.8}
                  />
                </span>
                {isBusy || isContinuingNativeSearch ? '検索中…' : availableDevices.length > 0 ? '再検索' : 'デバイスに接続'}
              </IonicControlButton>
        </IonFooter>}
      </IonPage>
    </IonModal>
  );
};

export default React.memo(BLEModal, areBLEModalPropsEqual);
