import { describe, expect, it } from 'vitest';
import type {
  I2cConfigStatus,
  CardLogSettingsStatus,
  CardStatus,
  Stm32FirmwareVersionStatus,
} from '../../types/ble';
import {
  formatByte,
  formatI2cLocalError,
  formatI2cRemoteCommandStatus,
  formatI2cRemoteError,
  getI2cBootFaultMessage,
  formatCompactNumber,
  formatDeviceHealthMode,
  formatLastLogAge,
  formatLogInterval,
  formatRtcOffset,
  formatCardType,
  formatStm32FirmwareIdentityDiagnostic,
  formatStm32FirmwareVersion,
  getExactCardLogRateOptions,
  getDraftCardLogIntervalMs,
  getI2cResultLabel,
  getI2cSupportMessage,
  getRtcOffsetColor,
  getCardLogSettingsValidationMessage,
  parseI2cAddressInput,
} from './formatters';

const cardStatus = (cardType: CardStatus['cardType']): CardStatus => ({
  cardState: 3,
  usagePercent: 0,
  freeSpaceMB: 0,
  totalSpaceMB: 0,
  usedSpaceMB: 0,
  cardTypeCode: 0,
  cardType,
});

const i2cStatus = (overrides: Partial<I2cConfigStatus>): I2cConfigStatus => ({
  protocolVersion: 1,
  lastOpCode: 0,
  lastOp: 'read',
  resultCode: 0,
  result: 'ok',
  remoteCommandStatus: 0,
  remoteLastError: 0,
  configFlags: 0,
  nodeId: 1,
  avgCycle: 4,
  windDirInstallMode: 0,
  i2cAddress: 0x42,
  i2cSlaveEnabled: true,
  measurementIntervalMs: 100,
  localI2cError: 0,
  remoteRegisterVersion: 6,
  currentTargetI2cAddress: 0x42,
  rebootRequired: false,
  detected: true,
  configWriteSupported: true,
  ...overrides,
});

const cardLogSettingsStatus = (overrides: Partial<CardLogSettingsStatus> = {}): CardLogSettingsStatus => ({
  protocolVersion: 1,
  lastOpCode: 0,
  lastOp: 'read',
  resultCode: 0,
  result: 'ok',
  flags: 0,
  persisted: true,
  stmIntervalKnown: true,
  defaultInterval: true,
  autoStartEnabled: false,
  currentIntervalMs: 1000,
  minIntervalMs: 100,
  maxIntervalMs: 600000,
  stm32IntervalMs: 100,
  ...overrides,
});

const stm32VersionStatus = (
  overrides: Partial<Stm32FirmwareVersionStatus> = {},
): Stm32FirmwareVersionStatus => ({
  protocolVersion: 2,
  flags: 0x07,
  i2cClientPresent: true,
  detected: true,
  readOk: false,
  localError: 0,
  regVersion: 0x0b,
  firmwareVersionRaw: 0x7e010000,
  firmwareVersion: null,
  firmwareRevision: 1,
  ...overrides,
});

describe('BLE settings formatters', () => {
  it('preserves byte, compact number, and interval display formats', () => {
    expect(formatByte(15)).toBe('0x0F');
    expect(formatCompactNumber(2)).toBe('2');
    expect(formatCompactNumber(1.25)).toBe('1.25');
    expect(formatCompactNumber(Number.NaN)).toBe('');
    expect(formatLogInterval(100)).toBe('10 Hz (0.1秒間隔)');
    expect(formatLogInterval(1000)).toBe('1 Hz / 1秒 (0.017分)');
    expect(formatLogInterval(120000)).toBe('120秒 (2分)');
  });

  it('preserves device, card, and RTC labels', () => {
    expect(formatCardType(cardStatus('cardhc'))).toBe('カードHC / カードXC');
    expect(formatCardType(cardStatus('none'))).toBe('None');
    expect(formatDeviceHealthMode(3)).toBe('UARTブリッジ');
    expect(formatDeviceHealthMode(6)).toBe('STM32更新');
    expect(formatDeviceHealthMode(99)).toBe('Unknown (0x63)');
    expect(formatLastLogAge(null)).toBe('-');
    expect(formatLastLogAge(59)).toBe('59秒前');
    expect(formatLastLogAge(120)).toBe('2分前');
    expect(formatRtcOffset(null)).toBe('-');
    expect(formatRtcOffset(999)).toBe('秒精度内（ほぼ一致）');
    expect(formatRtcOffset(-1000)).toBe('秒精度内（ほぼ一致）');
    expect(formatRtcOffset(-1000, 'stable')).toBe('ULSAが1秒遅れ');
    expect(formatRtcOffset(5000)).toBe('ULSAが5秒進み');
    expect(formatRtcOffset(-5000)).toBe('ULSAが5秒遅れ');
    expect(getRtcOffsetColor(null)).toBe('medium');
    expect(getRtcOffsetColor(999)).toBe('success');
    expect(getRtcOffsetColor(4999)).toBe('warning');
    expect(getRtcOffsetColor(5000)).toBe('danger');
  });

  it('preserves STM32 firmware and I2C status labels', () => {
    expect(formatStm32FirmwareVersion(null)).toBe('-');
    expect(formatStm32FirmwareVersion(stm32VersionStatus({ i2cClientPresent: false }))).toBe('未対応');
    expect(formatStm32FirmwareVersion(stm32VersionStatus({ detected: false }))).toBe('未検出');
    expect(formatStm32FirmwareVersion(stm32VersionStatus({ localError: 3, regVersion: 0 })))
      .toBe('読取NG: SHORT_READ (0x03)');
    expect(formatStm32FirmwareVersion(stm32VersionStatus({ localError: 5, regVersion: 10 })))
      .toBe('旧FW / 更新情報未対応 (REG 0x0A)');
    expect(formatStm32FirmwareVersion(stm32VersionStatus({ firmwareVersionRaw: 123 })))
      .toBe('旧形式FW / SemVer markerなし');
    expect(formatStm32FirmwareVersion(stm32VersionStatus({ firmwareRevision: 0 })))
      .toBe('更新情報未確認');
    expect(formatStm32FirmwareIdentityDiagnostic(stm32VersionStatus(), null))
      .toContain('protocol 2 / flags 0x07 / client yes / detected yes / readOk no');
    expect(formatStm32FirmwareIdentityDiagnostic(stm32VersionStatus(), null))
      .toContain('versionCode 0x7E010000 (SemVer marker OK) / FWREV 1');
    expect(getI2cResultLabel(i2cStatus({ result: 'busy' }))).toBe('他の操作を処理中');
    expect(getI2cResultLabel(i2cStatus({ result: 'i2cFailed' }))).toBe('I2C通信確認失敗');
    expect(getI2cResultLabel(i2cStatus({ localI2cError: 3 }))).toBe('設定値確認済み（診断取得失敗）');
    expect(formatI2cLocalError(12)).toBe('COMMAND_FAILED (0x0C)');
    expect(formatI2cLocalError(13)).toBe('COMMAND_TIMEOUT (0x0D)');
    expect(formatI2cLocalError(14)).toBe('SUSPENDED (0x0E)');
    expect(formatI2cRemoteCommandStatus(1)).toBe('BUSY (0x01)');
    expect(formatI2cRemoteError(12)).toBe('WRITE_QUEUE_FULL (0x0C)');
    expect(formatI2cRemoteError(14)).toBe('BOOT_EEPROM_READ (0x0E)');
    expect(formatI2cRemoteError(15)).toBe('BOOT_CRYPTO (0x0F)');
    expect(formatI2cRemoteError(16)).toBe('BOOT_IDENTITY (0x10)');
    expect(getI2cBootFaultMessage(0x0d, 0x0e)).toContain('EEPROMを読み取れません');
    expect(getI2cBootFaultMessage(0x0c, 0x0e)).toBeNull();
    expect(formatI2cRemoteCommandStatus(0xff)).toBe('DIAGNOSTIC_UNAVAILABLE (0xFF)');
    expect(formatI2cRemoteError(0xff)).toBe('DIAGNOSTIC_UNAVAILABLE (0xFF)');
    expect(getI2cSupportMessage(null)).toContain('I2C設定ステータスは未取得です');
    expect(getI2cSupportMessage(i2cStatus({ detected: false, currentTargetI2cAddress: 0x42, localI2cError: 3 })))
      .toBe('STM32 I2C slaveを検出できていません。Target 0x42、local error 3 を確認してください。');
    expect(getI2cSupportMessage(i2cStatus({ configWriteSupported: false, remoteRegisterVersion: 5 })))
      .toBe('STM32 I2C REG_VERSION 5 は設定write非対応です。設定writeには REG_VERSION 6 以上が必要です。');
  });

  it('preserves I2C address and カードログ interval validation', () => {
    expect(parseI2cAddressInput('0x42')).toBe(0x42);
    expect(parseI2cAddressInput('66')).toBe(66);
    expect(parseI2cAddressInput('')).toBeNull();
    expect(getDraftCardLogIntervalMs('hz', '10')).toBe(100);
    expect(getDraftCardLogIntervalMs('hz', '0.5')).toBeNull();
    expect(getDraftCardLogIntervalMs('seconds', '2.5')).toBe(2500);
    expect(getExactCardLogRateOptions(cardLogSettingsStatus()).map((option) => option.intervalMs))
      .toEqual([100, 200, 500, 1000]);
    expect(getExactCardLogRateOptions(cardLogSettingsStatus({ stm32IntervalMs: 20 }))
      .every((option) => Number.isInteger(option.rateHz))).toBe(true);
    expect(getCardLogSettingsValidationMessage(null, 'hz', '10')).toBe('カードログ設定ステータスは未取得です');
    expect(getCardLogSettingsValidationMessage(cardLogSettingsStatus(), 'hz', '20'))
      .toBe('現在のI2C出力周期では 10 Hz (0.1秒間隔) より速く設定できません');
    expect(getCardLogSettingsValidationMessage(cardLogSettingsStatus({ maxIntervalMs: 2000 }), 'seconds', '3'))
      .toBe('最大は 2秒 (0.033分) です');
    expect(getCardLogSettingsValidationMessage(cardLogSettingsStatus({ minIntervalMs: 100 }), 'seconds', '0.5'))
      .toBe('1秒未満はHz指定を使用してください');
    expect(getCardLogSettingsValidationMessage(cardLogSettingsStatus(), 'seconds', '2')).toBeNull();
    expect(getCardLogSettingsValidationMessage(cardLogSettingsStatus(), 'hz', '6.6666667'))
      .toBe('I2C出力周期 10 Hz (0.1秒間隔) の整数倍を選択してください');
    expect(getCardLogSettingsValidationMessage(cardLogSettingsStatus({ stmIntervalKnown: false, stm32IntervalMs: null }), 'hz', '10'))
      .toBe('STM32 I2C出力周期を取得できるまで設定できません');
  });
});
