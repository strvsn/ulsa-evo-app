export const INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY =
  'ulsa-evo-initial-firmware-onboarding-v1';

const HIDDEN_VALUE = 'hidden';
export const INITIAL_FIRMWARE_ONBOARDING_OPEN_EVENT =
  'ulsaInitialFirmwareOnboardingOpen';

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem' | 'removeItem'>;

export const isInitialFirmwareOnboardingHidden = (
  storage: ReadableStorage
): boolean => {
  try {
    return storage.getItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY) === HIDDEN_VALUE;
  } catch {
    return false;
  }
};

export const storeInitialFirmwareOnboardingHidden = (
  storage: WritableStorage,
  hidden: boolean
): void => {
  try {
    if (hidden) {
      storage.setItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY, HIDDEN_VALUE);
    } else {
      storage.removeItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY);
    }
  } catch {
    // Private browsing or device storage policy may disable persistence.
  }
};

export const requestInitialFirmwareOnboarding = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(INITIAL_FIRMWARE_ONBOARDING_OPEN_EVENT));
};
