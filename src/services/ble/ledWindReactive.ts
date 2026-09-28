import type {
  LEDWindReactiveConfig,
  LEDWindReactiveOp,
  LEDWindReactiveResult,
  LEDWindReactiveStatus,
  LEDWindReactiveTheme,
} from '../../types/ble';

export const LED_WIND_REACTIVE_STATUS_LENGTH = 6;
export const LED_WIND_REACTIVE_POLL_INTERVAL_MS = 80;
export const LED_WIND_REACTIVE_POLL_TIMEOUT_MS = 1500;

export const LED_WIND_REACTIVE_THEMES: ReadonlyArray<{
  id: LEDWindReactiveTheme;
  label: string;
  colors: readonly [string, string, string];
}> = [
  { id: 'tide', label: 'Tide', colors: ['#0064d2', '#00d7ca', '#ffcd4d'] },
  { id: 'cividis', label: 'Cividis', colors: ['#00204c', '#57666f', '#fae852'] },
  { id: 'viridis', label: 'Viridis', colors: ['#440154', '#21918c', '#fde725'] },
  { id: 'ember', label: 'Ember', colors: ['#1e3a8a', '#c0398f', '#ffb952'] },
  { id: 'aurora', label: 'Aurora', colors: ['#005089', '#00b8a9', '#daff62'] },
];

const OP_BY_CODE: Record<number, LEDWindReactiveOp> = {
  0: 'read',
  1: 'setConfig',
};

const RESULT_BY_CODE: Record<number, LEDWindReactiveResult> = {
  0: 'ok',
  1: 'queued',
  2: 'busy',
  3: 'invalidLength',
  4: 'invalidOp',
  5: 'invalidValue',
  6: 'failed',
};

export const ledWindReactiveThemeForCode = (code: number): LEDWindReactiveTheme => {
  const theme = LED_WIND_REACTIVE_THEMES[code];
  if (!theme) {
    throw new Error(`LED Wind Reactive theme is invalid: ${code}`);
  }
  return theme.id;
};

export const ledWindReactiveThemeCode = (theme: LEDWindReactiveTheme): number => {
  const index = LED_WIND_REACTIVE_THEMES.findIndex((entry) => entry.id === theme);
  if (index < 0) {
    throw new Error(`LED Wind Reactive theme is invalid: ${theme}`);
  }
  return index;
};

export const parseLEDWindReactiveStatus = (value: DataView): LEDWindReactiveStatus => {
  if (value.byteLength < LED_WIND_REACTIVE_STATUS_LENGTH) {
    throw new Error(`LED Wind Reactive payload too short: ${value.byteLength}`);
  }
  const flags = value.getUint8(3);
  const theme = ledWindReactiveThemeForCode(value.getUint8(4));
  const lastOpCode = value.getUint8(1);
  const resultCode = value.getUint8(2);
  return {
    protocolVersion: value.getUint8(0),
    lastOpCode,
    lastOp: OP_BY_CODE[lastOpCode] ?? 'unknown',
    resultCode,
    result: RESULT_BY_CODE[resultCode] ?? 'unknown',
    flags,
    enabled: (flags & 0x01) !== 0,
    active: (flags & 0x02) !== 0,
    persisted: (flags & 0x04) !== 0,
    theme,
  };
};

export const buildLEDWindReactiveConfigPayload = (config: LEDWindReactiveConfig): Uint8Array =>
  new Uint8Array([1, config.enabled ? 1 : 0, ledWindReactiveThemeCode(config.theme)]);

export const isLEDWindReactiveOperationComplete = (
  status: LEDWindReactiveStatus,
  requested: LEDWindReactiveConfig
): boolean => status.lastOp === 'setConfig' &&
  status.result !== 'queued' &&
  status.result !== 'busy' &&
  status.enabled === requested.enabled &&
  status.theme === requested.theme;
