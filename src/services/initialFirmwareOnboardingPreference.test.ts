import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INITIAL_FIRMWARE_ONBOARDING_OPEN_EVENT,
  INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY,
  isInitialFirmwareOnboardingHidden,
  requestInitialFirmwareOnboarding,
  storeInitialFirmwareOnboardingHidden,
} from './initialFirmwareOnboardingPreference';

describe('initial firmware onboarding preference', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows by default and persists only an explicit hide choice', () => {
    expect(isInitialFirmwareOnboardingHidden(window.localStorage)).toBe(false);

    storeInitialFirmwareOnboardingHidden(window.localStorage, true);
    expect(window.localStorage.getItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY)).toBe('hidden');
    expect(isInitialFirmwareOnboardingHidden(window.localStorage)).toBe(true);

    storeInitialFirmwareOnboardingHidden(window.localStorage, false);
    expect(window.localStorage.getItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY)).toBeNull();
  });

  it('fails open when device storage is unavailable', () => {
    expect(isInitialFirmwareOnboardingHidden({
      getItem: vi.fn(() => { throw new Error('blocked'); }),
    })).toBe(false);

    expect(() => storeInitialFirmwareOnboardingHidden({
      setItem: vi.fn(() => { throw new Error('blocked'); }),
      removeItem: vi.fn(() => { throw new Error('blocked'); }),
    }, true)).not.toThrow();
  });

  it('publishes a reopen event without changing the preference', () => {
    const listener = vi.fn();
    window.addEventListener(INITIAL_FIRMWARE_ONBOARDING_OPEN_EVENT, listener);

    requestInitialFirmwareOnboarding();

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(INITIAL_FIRMWARE_ONBOARDING_OPEN_EVENT, listener);
  });
});
