import type { CSSProperties } from 'react';
import type {
  DeviceModeStatus,
  BLECapabilitiesStatus,
  I2cConfigStatus,
  SampleMetadataStatus,
  CardLogSettingsStatus,
  CardStatus,
  Stm32FirmwareVersionStatus,
} from '../../types/ble';
import type { BLEConnectionState, BLEDataState } from '../../hooks/useBLE';
import { formatI2cAddress } from '../../services/ble';
import {
  STM32_MIN_REVISION,
  STM32_VERSION_CODE_MARKER,
} from '../../services/ota/stm32FirmwareVersion';

export type BadgeColor = 'success' | 'warning' | 'danger' | 'tertiary' | 'medium';

export const getDrawerStyle = (themeGradient: string | undefined): CSSProperties => ({
  '--ble-settings-gradient': themeGradient ?? 'linear-gradient(150deg, #071019 0%, #101d29 100%)',
} as CSSProperties);

export const getCapabilityBadges = (
  status: BLECapabilitiesStatus | null
): ReadonlyArray<readonly [string, boolean]> => status
  ? [
      ['Current Time', status.currentTime],
      ['RTC Timezone', status.timezoneConfig],
      ['カード状態', status.cardStatus],
      ['カード制御', status.cardLogControl],
      ['カード詳細', status.cardLogDetail],
      ['カード設定', status.cardLogSettings],
      ['Device Mode', status.deviceMode],
      ['STM32 FW', status.stm32FirmwareVersion],
      ['I2C Config', status.i2cConfigControl],
      ['Sample Meta', status.sampleMetadata],
      ['Health', status.deviceHealth],
      ['LED Identify', status.deviceIdentify],
      ['LED Brightness', status.ledBrightness],
      ['Wind Reactive LED', status.ledWindReactive],
      ['OTA Control', status.otaControl],
      ['Reset Control', status.resetControl],
    ]
  : [];

export const getConnectionStatusText = (
  connectionState: BLEConnectionState,
  dataState: BLEDataState
): string => {
  if (connectionState === 'connected' && dataState === 'waiting') return 'データ待ち';
  if (connectionState === 'connected' && dataState === 'stale') return 'データ停止';
  switch (connectionState) {
    case 'scanning':
      return 'デバイスを検索中...';
    case 'connecting':
      return '接続中...';
    case 'connected':
      return '接続済み';
    default:
      return '未接続';
  }
};

export const getConnectionStatusColor = (
  connectionState: BLEConnectionState,
  dataState: BLEDataState
): 'warning' | 'success' | 'medium' | 'danger' => {
  if (connectionState === 'connected' && dataState === 'stale') return 'danger';
  switch (connectionState) {
    case 'scanning':
    case 'connecting':
      return 'warning';
    case 'connected':
      return 'success';
    default:
      return 'medium';
  }
};

export const formatStorageMB = (value: number): string => `${value.toFixed(0)} MB`;

export const formatCardType = (status: CardStatus): string => {
  switch (status.cardType) {
    case 'none':
      return 'None';
    case 'mmc':
      return 'MMC';
    case 'card':
      return 'カード';
    case 'cardhc':
      return 'カードHC / カードXC';
    default:
      return 'Unknown';
  }
};

export const formatStm32FirmwareVersion = (status: Stm32FirmwareVersionStatus | null): string => {
  if (!status) return '-';
  if (!status.i2cClientPresent) return '未対応';
  if (!status.detected) return '未検出';
  if (!status.readOk) {
    if (status.localError === 5) {
      return `旧FW / 更新情報未対応 (REG ${formatByte(status.regVersion)})`;
    }
    if (status.localError !== 0) return `読取NG: ${formatI2cLocalError(status.localError)}`;
    if (status.regVersion < 0x0b) {
      return `旧FW / 更新情報未対応 (REG ${formatByte(status.regVersion)})`;
    }
    if ((status.firmwareVersionRaw & 0xff000000) !== STM32_VERSION_CODE_MARKER) {
      return '旧形式FW / SemVer markerなし';
    }
    if ((status.firmwareRevision ?? 0) < STM32_MIN_REVISION) return '更新情報未確認';
    return 'STM32 identity確認失敗';
  }
  return status.firmwareVersion ?? String(status.firmwareVersionRaw || '-');
};

const formatU32 = (value: number): string =>
  `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;

export const formatStm32FirmwareIdentityDiagnostic = (
  status: Stm32FirmwareVersionStatus | null,
  lastReadAt: number | null,
): string => {
  if (!status) return '-';
  const marker = (status.firmwareVersionRaw & 0xff000000) === STM32_VERSION_CODE_MARKER
    ? 'SemVer marker OK'
    : 'SemVer markerなし';
  return [
    `protocol ${status.protocolVersion}`,
    `flags ${formatByte(status.flags)}`,
    `client ${status.i2cClientPresent ? 'yes' : 'no'}`,
    `detected ${status.detected ? 'yes' : 'no'}`,
    `readOk ${status.readOk ? 'yes' : 'no'}`,
    `REG_VERSION ${formatByte(status.regVersion)}`,
    `local ${formatI2cLocalError(status.localError)}`,
    `versionCode ${formatU32(status.firmwareVersionRaw)} (${marker})`,
    `FWREV ${status.firmwareRevision ?? '-'}`,
    `最終取得 ${formatReadTime(lastReadAt)}`,
  ].join(' / ');
};

export const formatReadTime = (timestamp: number | null): string => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const formatRtcDateTime = (date: Date | null): string => {
  if (!date) return '-';
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const formatRtcOffset = (
  offsetMs: number | null,
  assessment: import('../../services/ble/rtcOffsetEvaluation').RtcOffsetAssessment = 'single',
): string => {
  if (offsetMs === null) return '-';
  if (assessment !== 'stable' && Math.abs(offsetMs) <= 1000) return '秒精度内（ほぼ一致）';
  if (Math.abs(offsetMs) < 1000) return '秒精度内（ほぼ一致）';
  const seconds = Math.abs(offsetMs / 1000).toFixed(0);
  return offsetMs > 0 ? `ULSAが${seconds}秒進み` : `ULSAが${seconds}秒遅れ`;
};

export const getRtcOffsetColor = (
  offsetMs: number | null,
  assessment: import('../../services/ble/rtcOffsetEvaluation').RtcOffsetAssessment = 'single',
): BadgeColor => {
  if (offsetMs === null) return 'medium';
  const abs = Math.abs(offsetMs);
  if (assessment !== 'stable' && abs <= 1000) return 'success';
  if (abs < 1000) return 'success';
  if (abs < 5000) return 'warning';
  return 'danger';
};

export const formatByte = (value: number): string =>
  `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;

export const parseI2cAddressInput = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = trimmed.toLowerCase().startsWith('0x')
    ? Number.parseInt(trimmed.slice(2), 16)
    : Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

export const getI2cResultLabel = (status: I2cConfigStatus): string => {
  if (status.result === 'ok' && status.localI2cError !== 0) {
    return '設定値確認済み（診断取得失敗）';
  }
  if (status.result === 'ok') return 'OK';
  if (status.result === 'queued') return '処理待ち';
  if (status.result === 'busy') return '他の操作を処理中';
  if (status.result === 'unsupported') return '非対応';
  if (status.result === 'unavailable') return '未検出';
  if (status.result === 'i2cFailed') return 'I2C通信確認失敗';
  if (status.result === 'invalidLength') return '要求形式エラー';
  if (status.result === 'invalidOp') return '未対応の操作';
  return '不明な結果';
};

const I2C_LOCAL_ERROR_LABELS: Record<number, string> = {
  0: 'NONE',
  1: 'NO_WIRE',
  2: 'NACK',
  3: 'SHORT_READ',
  4: 'INVALID_WHOAMI',
  5: 'UNSUPPORTED_VERSION',
  6: 'DATA_NOT_READY',
  7: 'INVALID_DATA',
  8: 'DIAG_UNSUPPORTED',
  9: 'BACKOFF',
  10: 'CONFIG_UNSUPPORTED',
  11: 'INVALID_CONFIG_VALUE',
  12: 'COMMAND_FAILED',
  13: 'COMMAND_TIMEOUT',
  14: 'SUSPENDED',
};

const I2C_REMOTE_COMMAND_LABELS: Record<number, string> = {
  0: 'OK',
  1: 'BUSY',
  2: 'LOCKED',
  3: 'INVALID_REGISTER',
  4: 'INVALID_VALUE',
  5: 'INVALID_COMMAND',
  6: 'EEPROM_BUSY',
  7: 'ERROR',
  8: 'REBOOT_REQUIRED',
  255: 'DIAGNOSTIC_UNAVAILABLE',
};

const I2C_REMOTE_ERROR_LABELS: Record<number, string> = {
  0: 'NONE',
  1: 'READ_TIMEOUT',
  2: 'UNSUPPORTED_WRITE',
  3: 'GENERAL_CALL',
  4: 'BUS_ERROR',
  5: 'ARBITRATION_LOST',
  6: 'OVERRUN',
  7: 'TIMEOUT',
  8: 'BACKEND_INIT',
  9: 'INVALID_REGISTER',
  10: 'INVALID_VALUE',
  11: 'LOCKED',
  12: 'WRITE_QUEUE_FULL',
  13: 'EEPROM_SAVE',
  14: 'BOOT_EEPROM_READ',
  15: 'BOOT_CRYPTO',
  16: 'BOOT_IDENTITY',
  255: 'DIAGNOSTIC_UNAVAILABLE',
};

const formatI2cDiagnostic = (value: number, labels: Record<number, string>): string =>
  `${labels[value] ?? 'UNKNOWN'} (${formatByte(value)})`;

export const formatI2cLocalError = (value: number): string =>
  formatI2cDiagnostic(value, I2C_LOCAL_ERROR_LABELS);

export const formatI2cRemoteCommandStatus = (value: number): string =>
  formatI2cDiagnostic(value, I2C_REMOTE_COMMAND_LABELS);

export const formatI2cRemoteError = (value: number): string =>
  formatI2cDiagnostic(value, I2C_REMOTE_ERROR_LABELS);

export const getI2cBootFaultMessage = (registerVersion: number, error: number): string | null => {
  if (registerVersion < 0x0d) return null;
  if (error === 0x0e) return '計測部の起動異常: EEPROMを読み取れません。計測値は無効です。保守接続でretryまたはrebootを実行してください。';
  if (error === 0x0f) return '計測部の起動異常: EEPROM暗号形式または鍵を確認できません。データは保持されています。保守対応が必要です。';
  if (error === 0x10) return '計測部の起動異常: ファームウェア識別情報を安全に適用できません。データは保持されています。保守対応が必要です。';
  return null;
};

export const getI2cSupportMessage = (status: I2cConfigStatus | null): string | null => {
  if (!status) {
    return 'I2C設定ステータスは未取得です。ESP32 firmwareがI2C Config Control Characteristicを公開しているか、更新で確認してください。';
  }
  if (!status.detected) {
    return `STM32 I2C slaveを検出できていません。Target ${formatI2cAddress(status.currentTargetI2cAddress)}、local error ${status.localI2cError} を確認してください。`;
  }
  if (!status.configWriteSupported) {
    return `STM32 I2C REG_VERSION ${status.remoteRegisterVersion} は設定write非対応です。設定writeには REG_VERSION 6 以上が必要です。`;
  }
  return null;
};

export const getDeviceModeColor = (status: DeviceModeStatus): BadgeColor => {
  if (status.mode === 'i2cMeasure') return 'success';
  if (status.mode === 'command' || status.mode === 'uartBridge') return 'warning';
  if (status.mode === 'bootloader') return 'danger';
  if (status.mode === 'stm32Update') return 'tertiary';
  if (status.mode === 'wifiPortal') return 'tertiary';
  return 'medium';
};

export const formatSampleSource = (status: SampleMetadataStatus): string => {
  switch (status.source) {
    case 'i2c':
      return 'I2C';
    case 'uart':
      return 'UART';
    case 'simulation':
      return 'Simulation';
    default:
      return 'Unknown';
  }
};

export const formatDeviceHealthMode = (modeCode: number): string => {
  switch (modeCode) {
    case 0:
      return 'UART計測';
    case 1:
      return 'I2C計測';
    case 2:
      return 'Command';
    case 3:
      return 'UARTブリッジ';
    case 4:
      return 'WiFiポータル';
    case 5:
      return 'Bootloader';
    case 6:
      return 'STM32更新';
    default:
      return `Unknown (${formatByte(modeCode)})`;
  }
};

export const formatLastLogAge = (seconds: number | null): string => {
  if (seconds === null) return '-';
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分前`;
};

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export const formatLogInterval = (intervalMs: number): string => {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return '-';
  const seconds = intervalMs / 1000;
  if (intervalMs < 1000) {
    return `${formatCompactNumber(1000 / intervalMs)} Hz (${formatCompactNumber(seconds)}秒間隔)`;
  }
  if (intervalMs === 1000) {
    return `1 Hz / 1秒 (${formatCompactNumber(1 / 60)}分)`;
  }
  return `${formatCompactNumber(seconds)}秒 (${formatCompactNumber(seconds / 60)}分)`;
};

export type ExactCardLogRateOption = {
  intervalMs: number;
  rateHz: number;
};

export const getExactCardLogRateOptions = (
  status: CardLogSettingsStatus | null
): ExactCardLogRateOption[] => {
  const sourceIntervalMs = status?.stm32IntervalMs;
  if (!status?.stmIntervalKnown || !sourceIntervalMs || sourceIntervalMs <= 0) {
    return [];
  }

  const maxIntervalMs = Math.min(1000, status.maxIntervalMs);
  const options: ExactCardLogRateOption[] = [];
  for (let intervalMs = sourceIntervalMs; intervalMs <= maxIntervalMs; intervalMs += sourceIntervalMs) {
    const rateHz = 1000 / intervalMs;
    if (Number.isInteger(rateHz)) {
      options.push({ intervalMs, rateHz });
    }
  }
  return options;
};

export const getDraftCardLogIntervalMs = (inputMode: 'hz' | 'seconds', draftInterval: string): number | null => {
  const value = Number(draftInterval);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (inputMode === 'hz') {
    if (value < 1) return null;
    return Math.round(1000 / value);
  }
  return Math.round(value * 1000);
};

export const getCardLogSettingsValidationMessage = (
  status: CardLogSettingsStatus | null,
  inputMode: 'hz' | 'seconds',
  draftInterval: string
): string | null => {
  if (!status) return 'カードログ設定ステータスは未取得です';
  const intervalMs = getDraftCardLogIntervalMs(inputMode, draftInterval);
  if (intervalMs === null) return '有効な数値を入力してください';
  if (!status.stmIntervalKnown || !status.stm32IntervalMs) {
    return 'STM32 I2C出力周期を取得できるまで設定できません';
  }
  if (intervalMs < status.minIntervalMs) {
    return `現在のI2C出力周期では ${formatLogInterval(status.minIntervalMs)} より速く設定できません`;
  }
  if (intervalMs > status.maxIntervalMs) {
    return `最大は ${formatLogInterval(status.maxIntervalMs)} です`;
  }
  if (inputMode === 'seconds' && intervalMs < 1000) {
    return '1秒未満はHz指定を使用してください';
  }
  if (intervalMs % status.stm32IntervalMs !== 0) {
    return `I2C出力周期 ${formatLogInterval(status.stm32IntervalMs)} の整数倍を選択してください`;
  }
  return null;
};

export const formatStopReason = (reasonCode: number): string => {
  switch (reasonCode) {
    case 0:
      return 'None';
    case 1:
      return 'カード未検出';
    case 2:
      return 'Slow Write';
    case 3:
      return 'Write Error';
    case 4:
      return 'File Error';
    case 5:
      return 'User Stop';
    case 6:
      return '容量不足';
    case 7:
      return '自動復旧できません';
    default:
      return `Unknown (${formatByte(reasonCode)})`;
  }
};
