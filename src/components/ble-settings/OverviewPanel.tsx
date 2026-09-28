import { IonIcon, IonSpinner, } from '@ionic/react';
import { alertCircle, close } from 'ionicons/icons';
import { RadioTower, Unplug } from 'lucide-react';
import type { BLEConnectionState, BLEDataState, BLEDeviceInfo } from '../../hooks/useBLE';
import type { BLEParseErrorStats, BLEPlatformInfo } from '../../services/ble';
import { IonicControlButton } from '../controls';
import { getConnectionStatusText } from './formatters';
import { InfoGrid, SectionCard, StatusSummary } from './primitives';
type OverviewPanelProps = {
    connectionState: BLEConnectionState;
    dataState: BLEDataState;
    connectedDevice: BLEDeviceInfo | null;
    parseErrorStats: BLEParseErrorStats;
    error: string | null;
    isBusy: boolean;
    isSupported: boolean;
    platformInfo: BLEPlatformInfo | null;
    onClearError: () => void;
};
export const OverviewPanel = ({ connectionState, dataState, connectedDevice, parseErrorStats, error, isBusy, isSupported, onClearError, }: OverviewPanelProps) => (<>
    <SectionCard title="接続概要" icon={<RadioTower className="ulsa-icon" size={19} strokeWidth={1.8} aria-hidden="true"/>}>
      <StatusSummary>
        {false}
      </StatusSummary>
      <div className="ble-settings-status-line" role="status" aria-live="polite" aria-atomic="true">
        <span className="ble-settings-connection-summary">
          {isBusy
        ? <IonSpinner name="crescent"/>
        : connectionState === 'connected'
            ? <RadioTower className="ulsa-icon" size={18} strokeWidth={1.8} aria-hidden="true"/>
            : <Unplug className="ulsa-icon" size={18} strokeWidth={1.8} aria-hidden="true"/>}
          <span>{getConnectionStatusText(connectionState, dataState)}</span>
        </span>
      </div>
      {!isSupported && (<div className="ble-settings-message danger" role="alert">
          <IonIcon icon={alertCircle}/>
          <span>このブラウザ/デバイスではBLEがサポートされていません</span>
        </div>)}
      {error && (<div className="ble-settings-message warning" role="alert">
          <IonIcon icon={alertCircle}/>
          <span>{error}</span>
          <IonicControlButton fill="clear" controlSize="C36" controlVariant="ghost" onClick={onClearError} aria-label="BLEエラーを閉じる">
            <IonIcon icon={close}/>
          </IonicControlButton>
        </div>)}
      <InfoGrid rows={[
        { label: '接続デバイス', value: connectedDevice?.name || '未接続' },
        { label: 'Node ID', value: connectedDevice?.nodeId ?? '-' }
    ]}/>
      {false}
    </SectionCard>

    {parseErrorStats.count > 0 && (<SectionCard title="受信データを確認してください" icon={alertCircle}>
        <p>本体からのデータの一部を読み取れませんでした。続く場合はBLEで再接続してください。</p>
        {false}
      </SectionCard>)}
  </>);
