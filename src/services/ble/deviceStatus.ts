export const DEVICE_STATUS_PROTOCOL_VERSION = 3;
export const isSupportedDeviceStatusProtocol = (value?: number): boolean =>
  value === 2 || value === DEVICE_STATUS_PROTOCOL_VERSION;

export const DEVICE_ACTIVE_CAUSE_LABELS: Record<number, string> = {
  0: '正常',
  1: '上限風速',
  2: '低温警告',
  3: '高温保護',
  4: '温度センサー異常',
  5: '測定値無効',
  6: '設定異常',
  7: '起動ハードウェア異常',
  8: 'EEPROM異常',
  9: '整合性異常',
  10: '個体識別異常',
  11: '保護状態保存異常',
  12: '保存済み保護状態',
};

export const describeDeviceStatus = (
  data: {
    sensorStatus: number;
    statusProtocolVersion?: number;
    statusFlags?: number;
    serviceStatus?: number;
    activeCause?: number;
  } | null | undefined
): string | null => {
  if (!data || !isSupportedDeviceStatusProtocol(data.statusProtocolVersion)) return null;
  const activeCause = data.activeCause ?? 0;
  if (data.sensorStatus === 1) {
    return data.statusProtocolVersion === 3 && activeCause === 2
      ? DEVICE_ACTIVE_CAUSE_LABELS[2]
      : null;
  }
  if (activeCause !== 0) {
    return DEVICE_ACTIVE_CAUSE_LABELS[activeCause] ?? 'センサー異常';
  }
  if (((data.serviceStatus ?? 0) & 0x10) !== 0) return '再起動が必要';
  if (((data.statusFlags ?? 0) & 0x80) === 0) return null;
  return '計測値無効';
};
