import { memo, useCallback, useEffect, useState } from 'react';
import type { useBLE } from '../hooks/useBLE';
import {
  INITIAL_FIRMWARE_ONBOARDING_OPEN_EVENT,
  isInitialFirmwareOnboardingHidden,
  storeInitialFirmwareOnboardingHidden,
} from '../services/initialFirmwareOnboardingPreference';
import { OtaPanel } from './ble-settings/OtaPanel';

type BLEState = ReturnType<typeof useBLE>;

type Props = {
  ble: BLEState;
  onPresent?: () => void;
};

const noop = () => undefined;

const areInitialFirmwareSetupPropsEqual = (previous: Props, next: Props): boolean => (
  previous.onPresent === next.onPresent &&
  previous.ble.connectionState === next.ble.connectionState &&
  previous.ble.capabilitiesStatus === next.ble.capabilitiesStatus &&
  previous.ble.otaControlStatus === next.ble.otaControlStatus &&
  previous.ble.otaControlBusy === next.ble.otaControlBusy &&
  previous.ble.platformInfo === next.ble.platformInfo &&
  previous.ble.refreshOtaControlStatus === next.ble.refreshOtaControlStatus &&
  previous.ble.writeOtaControl === next.ble.writeOtaControl &&
  previous.ble.verifyInstalledDemo === next.ble.verifyInstalledDemo
);

const readHiddenPreference = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return isInitialFirmwareOnboardingHidden(window.localStorage);
  } catch {
    return false;
  }
};

const InitialFirmwareSetupEntry = ({ ble, onPresent = noop }: Props) => {
  const [visible, setVisible] = useState(() => !readHiddenPreference());
  const [defaultHidden, setDefaultHidden] = useState(readHiddenPreference);
  const [presentationKey, setPresentationKey] = useState(0);

  useEffect(() => {
    const reopen = () => {
      setDefaultHidden(readHiddenPreference());
      setPresentationKey((current) => current + 1);
      setVisible(true);
    };
    window.addEventListener(INITIAL_FIRMWARE_ONBOARDING_OPEN_EVENT, reopen);
    return () => window.removeEventListener(INITIAL_FIRMWARE_ONBOARDING_OPEN_EVENT, reopen);
  }, []);

  useEffect(() => {
    if (visible) onPresent();
  }, [onPresent, visible]);

  const persistHidePreference = useCallback((hideNextTime: boolean) => {
    try {
      storeInitialFirmwareOnboardingHidden(window.localStorage, hideNextTime);
    } catch {
      // Accessing localStorage itself can be blocked by the WebView policy.
    }
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <OtaPanel
      key={presentationKey}
      presentation="initialSetup"
      initialGuideOpen={visible}
      initialGuideDefaultHidden={defaultHidden}
      onInitialGuideHideNextTimeChange={persistHidePreference}
      onInitialGuideDismiss={dismiss}
      isConnected={ble.connectionState === 'connected'}
      capabilitiesStatus={ble.capabilitiesStatus}
      otaControlStatus={ble.otaControlStatus}
      otaControlBusy={ble.otaControlBusy}
      platformInfo={ble.platformInfo}
      onRefreshOtaControlStatus={ble.refreshOtaControlStatus}
      onWriteOtaControl={ble.writeOtaControl}
      onVerifyInstalledDemo={ble.verifyInstalledDemo}
    />
  );
};

export default memo(InitialFirmwareSetupEntry, areInitialFirmwareSetupPropsEqual);
