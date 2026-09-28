import type { Esp32OtaSession } from '../../services/ota/esp32OtaTransfer';
import type { Stm32FirmwareReleaseOption } from '../../services/ota/stm32FirmwareReleaseCatalog';
import type { NativeSoftApJoinResult } from '../../services/ota/nativeSoftAp';
import type { Stm32UpdateHttpStatus } from '../../services/ota/stm32OtaTransfer';
import type { Stm32FirmwareVersionStatus } from '../../types/ble';
import { describeJoinResult, describeNodeIdValues } from './otaPanelHelpers';
import { AdvancedDetails, InfoGrid } from './primitives';
import {
  describeVersionConfirmation,
  formatPackageBytes,
  formatPackageHash,
  type CachedStm32Package,
} from './stm32UpdatePanelHelpers';

type Props = {
  selectedRelease: Stm32FirmwareReleaseOption | null;
  cachedPackage: CachedStm32Package | null;
  httpStatus: Stm32UpdateHttpStatus | null;
  stm32FirmwareVersion: Stm32FirmwareVersionStatus | null;
  session: Esp32OtaSession | null;
  observedBleNodeId?: number;
  wifiJoinResult: NativeSoftApJoinResult | null;
  probeReady: boolean;
};

export const Stm32UpdateStatusDetails = ({
  selectedRelease,
  cachedPackage,
  httpStatus,
  stm32FirmwareVersion,
  session,
  observedBleNodeId,
  wifiJoinResult,
  probeReady,
}: Props) => {
  const nodeDifference = describeNodeIdValues([
    { label: 'BLE', value: observedBleNodeId },
    { label: 'session', value: session?.nodeId },
    { label: 'HTTP', value: httpStatus?.nodeId },
  ]);
  const restartResultUnknown = httpStatus?.phase === 'recovery_required' &&
    httpStatus.recoveryReason === 'restart_unknown';
  const firmwareCounter = (completedBytes: number): string => restartResultUnknown
    ? '不明（再起動前の結果未取得）'
    : `${completedBytes}/${httpStatus?.totalBytes ?? 0}`;
  const espReset = httpStatus?.espResetReasonName
    ? `${httpStatus.espResetReasonName}${httpStatus.espResetReason === undefined ? '' : ` (${httpStatus.espResetReason})`}`
    : httpStatus?.espResetReason === undefined ? '-' : String(httpStatus.espResetReason);
  return (
    <AdvancedDetails title="STM32更新状態">
      <InfoGrid
        rows={[
          { label: 'Version', value: selectedRelease?.version || httpStatus?.version || '-' },
          { label: 'Package', value: selectedRelease?.assetName || '-' },
          {
            label: 'Package size',
            value: selectedRelease
              ? `${formatPackageBytes(selectedRelease.size)} / DL ${cachedPackage ? formatPackageBytes(cachedPackage.file.size) : '-'}`
              : '-',
          },
          { label: 'Package SHA256', value: formatPackageHash(selectedRelease?.packageSha256) },
          { label: 'Target', value: selectedRelease?.target || httpStatus?.target || '-' },
          { label: 'Build', value: selectedRelease?.buildProfile || httpStatus?.buildProfile || '-' },
          { label: 'RDP', value: selectedRelease?.rdpPolicy || httpStatus?.rdpPolicy || '-' },
          { label: 'STM32 FW', value: describeVersionConfirmation(httpStatus, selectedRelease, stm32FirmwareVersion) },
          { label: 'SSID', value: session?.ssid || '-' },
          { label: 'Session Node表示', value: session?.nodeId === undefined ? '-' : String(session.nodeId) },
          { label: 'BLE Node表示', value: observedBleNodeId === undefined ? '-' : String(observedBleNodeId) },
          { label: 'HTTP Node表示', value: httpStatus?.nodeId === undefined ? '-' : String(httpStatus.nodeId) },
          { label: 'Wi-Fi', value: describeJoinResult(wifiJoinResult) },
          { label: 'Phase', value: httpStatus?.phase || '-' },
          {
            label: 'Write start pending',
            value: httpStatus?.writeStartPending === true
              ? 'yes'
              : httpStatus?.writeStartPending === false ? 'no' : '-',
          },
          { label: 'Recovery reason', value: httpStatus?.recoveryReason || '-' },
          { label: 'Recovery stage', value: httpStatus?.recoveryStage || '-' },
          { label: 'ESP reset', value: espReset },
          { label: 'ESP boot count', value: httpStatus?.espBootCount ?? '-' },
          {
            label: 'Writer stack min free',
            value: typeof httpStatus?.writerStackMinFreeBytes === 'number'
              ? `${httpStatus.writerStackMinFreeBytes} bytes`
              : '-',
          },
          { label: 'Local write gate', value: probeReady ? '非消去確認済み' : '未確認 / 再確認が必要' },
          {
            label: 'Bootloader sync',
            value: httpStatus?.bootloaderSyncOk === true
              ? 'OK'
              : httpStatus?.bootloaderSyncOk === false ? 'NG' : '-',
          },
          { label: 'Sync attempts', value: httpStatus?.bootloaderSyncAttempts ?? '-' },
          { label: 'Sync error', value: httpStatus?.bootloaderSyncError || '-' },
          { label: 'Package bytes', value: formatPackageBytes(httpStatus?.packageBytes) },
          { label: 'Verified SHA256', value: formatPackageHash(httpStatus?.packageSha256 ?? undefined) },
          { label: 'Cipher payload', value: formatPackageBytes(httpStatus?.payloadBytes) },
          { label: 'Firmware bytes', value: formatPackageBytes(httpStatus?.firmwareBytes) },
          { label: 'Write', value: httpStatus ? firmwareCounter(httpStatus.writtenBytes) : '-' },
          { label: 'Verify', value: httpStatus ? firmwareCounter(httpStatus.verifiedBytes) : '-' },
          { label: 'Error', value: httpStatus?.error || '-' },
          { label: 'Error code', value: httpStatus?.errorCode || '-' },
        ]}
      />
      {nodeDifference && <p className="card-log-settings-message" role="status">{nodeDifference}</p>}
    </AdvancedDetails>
  );
};
