import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { useBLE } from '../hooks/useBLE';
import {
  INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY,
  requestInitialFirmwareOnboarding,
} from '../services/initialFirmwareOnboardingPreference';
import InitialFirmwareSetupEntry from './InitialFirmwareSetupEntry';

const otaProps: Array<Record<string, unknown>> = [];
vi.mock('./ble-settings/OtaPanel', () => ({
  OtaPanel: (props: Record<string, unknown>) => {
    otaProps.push(props);
    return <div data-testid="initial-setup-entry" data-open={String(props.initialGuideOpen)} />;
  },
}));

const ble = {
  connectionState: 'disconnected',
  capabilitiesStatus: null,
  otaControlStatus: null,
  otaControlBusy: false,
  platformInfo: { platform: 'ios', adapterType: 'Capacitor', isSupported: true },
  refreshOtaControlStatus: vi.fn(),
  writeOtaControl: vi.fn(),
  verifyInstalledDemo: vi.fn(),
} as unknown as ReturnType<typeof useBLE>;

describe('InitialFirmwareSetupEntry', () => {
  beforeEach(() => {
    window.localStorage.clear();
    otaProps.length = 0;
  });

  it('opens on first launch and stores an explicit hide choice', () => {
    const onPresent = vi.fn();
    render(<InitialFirmwareSetupEntry ble={ble} onPresent={onPresent} />);
    expect(screen.getByTestId('initial-setup-entry')).toHaveAttribute('data-open', 'true');
    expect(otaProps.at(-1)?.presentation).toBe('initialSetup');
    expect(onPresent).toHaveBeenCalledOnce();

    act(() => {
      (otaProps.at(-1)?.onInitialGuideHideNextTimeChange as (hidden: boolean) => void)(true);
    });
    expect(window.localStorage.getItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY)).toBe('hidden');

    act(() => {
      (otaProps.at(-1)?.onInitialGuideDismiss as () => void)();
    });
    expect(screen.getByTestId('initial-setup-entry')).toHaveAttribute('data-open', 'false');
    expect(window.localStorage.getItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY)).toBe('hidden');
  });

  it('clears the persisted hide choice as soon as the user unchecks it', () => {
    render(<InitialFirmwareSetupEntry ble={ble} />);

    act(() => {
      (otaProps.at(-1)?.onInitialGuideHideNextTimeChange as (hidden: boolean) => void)(true);
    });
    expect(window.localStorage.getItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY)).toBe('hidden');

    act(() => {
      (otaProps.at(-1)?.onInitialGuideHideNextTimeChange as (hidden: boolean) => void)(false);
    });
    expect(window.localStorage.getItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY)).toBeNull();
  });

  it('stays hidden on later launches but can be reopened from settings', () => {
    window.localStorage.setItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY, 'hidden');
    render(<InitialFirmwareSetupEntry ble={ble} />);
    expect(screen.getByTestId('initial-setup-entry')).toHaveAttribute('data-open', 'false');

    act(() => requestInitialFirmwareOnboarding());
    expect(screen.getByTestId('initial-setup-entry')).toHaveAttribute('data-open', 'true');
    expect(otaProps.at(-1)?.initialGuideDefaultHidden).toBe(true);
  });
});
