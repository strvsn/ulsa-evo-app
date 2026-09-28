import { Copy, RefreshCw } from 'lucide-react';
import type {
  Esp32OtaHttpStatus,
  Esp32OtaSession,
} from '../../services/ota/esp32OtaTransfer';
import type { NativeSoftApJoinResult } from '../../services/ota/nativeSoftAp';
import { NativeControlButton } from '../controls';
import { describeJoinResult, describeNodeIdDifference } from './otaPanelHelpers';
import { AdvancedDetails, InfoGrid } from './primitives';

type OtaSessionDetailsProps = {
  session: Esp32OtaSession;
  wifiJoinResult: NativeSoftApJoinResult | null;
  httpStatus: Esp32OtaHttpStatus | null;
  transferBusy: boolean;
  onRefreshHttpStatus: () => void | Promise<void>;
  onCopySessionValue: (label: string, value?: string) => void | Promise<void>;
};

export const OtaSessionDetails = ({
  session,
  wifiJoinResult,
  httpStatus,
  transferBusy,
  onRefreshHttpStatus,
  onCopySessionValue,
}: OtaSessionDetailsProps) => {
  const nodeDifference = describeNodeIdDifference(session.nodeId, httpStatus?.nodeId);
  return (
    <AdvancedDetails title="接続情報">
      <InfoGrid
        rows={[
          { label: 'SSID', value: session.ssid },
          { label: '更新Node', value: session.nodeId === undefined ? '-' : String(session.nodeId) },
          { label: 'PASS', value: session.password || '-' },
          { label: 'IP', value: session.ip },
          { label: 'Wi-Fi', value: describeJoinResult(wifiJoinResult) },
          { label: 'ESP32', value: httpStatus ? `${httpStatus.state} / ${httpStatus.progress}%` : '-' },
          { label: 'ESP32 Node', value: httpStatus?.nodeId === undefined ? '-' : String(httpStatus.nodeId) },
          { label: '残り', value: httpStatus ? `${httpStatus.remainingSeconds}s` : '-' },
        ]}
      />
      {nodeDifference && <p className="card-log-settings-message" role="status">{nodeDifference}</p>}
      <div className="ble-settings-inline-actions ota-session-copy-actions">
        <NativeControlButton
          controlSize="C36"
          className="ble-settings-action-button ghost"
          onClick={onRefreshHttpStatus}
          disabled={transferBusy}
        >
          <RefreshCw className="ulsa-icon" size={17} strokeWidth={1.9} aria-hidden="true" />
          状態
        </NativeControlButton>
        <NativeControlButton
          controlSize="C36"
          className="ble-settings-action-button ghost"
          onClick={() => onCopySessionValue('SSID', session.ssid)}
        >
          <Copy className="ulsa-icon" size={17} strokeWidth={1.9} aria-hidden="true" />
          SSID
        </NativeControlButton>
        <NativeControlButton
          controlSize="C36"
          className="ble-settings-action-button ghost"
          onClick={() => onCopySessionValue('PASS', session.password)}
        >
          <Copy className="ulsa-icon" size={17} strokeWidth={1.9} aria-hidden="true" />
          PASS
        </NativeControlButton>
      </div>
    </AdvancedDetails>
  );
};
