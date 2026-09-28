/**
 * 風速単位の型定義
 */
export type WindSpeedUnit = 'm/s' | 'km/h' | 'cm/s';

export const DEFAULT_WIND_SPEED_UNIT: WindSpeedUnit = 'm/s';
export const WIND_SPEED_UNIT_STORAGE_KEY = 'ulsa-evo.wind-speed-unit.v1';

export const isWindSpeedUnit = (value: unknown): value is WindSpeedUnit =>
  value === 'm/s' || value === 'km/h' || value === 'cm/s';

/**
 * 風速単位変換関数
 * m/s から指定した単位に変換する
 */
export const convertWindSpeed = (valueInMs: number, targetUnit: WindSpeedUnit): number => {
  switch (targetUnit) {
    case 'm/s':
      return valueInMs;
    case 'km/h':
      return valueInMs * 3.6;
    case 'cm/s':
      return valueInMs * 100;
  }
};

/**
 * 風速単位を次の単位に切り替える
 */
export const getNextWindSpeedUnit = (currentUnit: WindSpeedUnit): WindSpeedUnit => {
  if (currentUnit === 'm/s') return 'km/h';
  if (currentUnit === 'km/h') return 'cm/s';
  return 'm/s';
};

/** WebとCapacitor/iOSで共有する、終了後も保持される風速表示単位。 */
export const readWindSpeedUnitPreference = (): WindSpeedUnit => {
  if (typeof window === 'undefined') return DEFAULT_WIND_SPEED_UNIT;

  try {
    const storedUnit = window.localStorage.getItem(WIND_SPEED_UNIT_STORAGE_KEY);
    return isWindSpeedUnit(storedUnit) ? storedUnit : DEFAULT_WIND_SPEED_UNIT;
  } catch {
    return DEFAULT_WIND_SPEED_UNIT;
  }
};

export const storeWindSpeedUnitPreference = (unit: WindSpeedUnit): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(WIND_SPEED_UNIT_STORAGE_KEY, unit);
  } catch {
    // Storage can be unavailable under private browsing or an app policy.
    // The in-memory selection remains usable for the current session.
  }
};
