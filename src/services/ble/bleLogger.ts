const BLE_DEBUG_ENABLED = import.meta.env.DEV && import.meta.env.VITE_BLE_DEBUG === '1';

export const isBleDebugEnabled = (): boolean => BLE_DEBUG_ENABLED;

export const logBLEDebug = (...args: unknown[]): void => {
  if (BLE_DEBUG_ENABLED) {
    console.log(...args);
  }
};
