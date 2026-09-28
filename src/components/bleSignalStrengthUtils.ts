export type BLESignalStrengthLevel = 0 | 1 | 2 | 3 | 4;

const SIGNAL_LABELS: Record<BLESignalStrengthLevel, string> = {
  0: '取得待ち',
  1: '非常に弱い',
  2: '弱い',
  3: '良好',
  4: '非常に良好',
};

/** Converts the shared Web/Capacitor RSSI contract into a familiar four-bar UI. */
export const getBLESignalStrengthLevel = (rssi?: number): BLESignalStrengthLevel => {
  if (rssi === undefined || !Number.isFinite(rssi)) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -67) return 3;
  if (rssi >= -80) return 2;
  return 1;
};

export const getBLESignalStrengthLabel = (rssi?: number): string => (
  SIGNAL_LABELS[getBLESignalStrengthLevel(rssi)]
);
