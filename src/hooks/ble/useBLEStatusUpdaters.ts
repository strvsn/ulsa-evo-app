import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { BLECapabilitiesStatus, DeviceHealthStatus, I2cConfigStatus, LEDBrightnessStatus, SampleMetadataStatus, CardLogControlStatus, CardLogDetailStatus, CardLogSettingsStatus, CardStatus, Stm32FirmwareVersionStatus, } from '../../types/ble';
import { areCapabilitiesStatusesEqual, areDeviceHealthStatusesEqual, areI2cConfigStatusesEqual, areLEDBrightnessStatusesEqual, areSampleMetadataStatusesEqual, areCardLogControlStatusesEqual, areCardLogDetailStatusesEqual, areCardLogSettingsStatusesEqual, areCardStatusesEqual, areStm32FirmwareVersionStatusesEqual, } from './statusEquality';
type StateSetter<T> = Dispatch<SetStateAction<T>>;
interface UseBLEStatusUpdatersOptions {
    setCardStatus: StateSetter<CardStatus | null>;
    setCardLogControlStatus: StateSetter<CardLogControlStatus | null>;
    setStm32FirmwareVersion: StateSetter<Stm32FirmwareVersionStatus | null>;
    setSampleMetadataStatus: StateSetter<SampleMetadataStatus | null>;
    setDeviceHealthStatus: StateSetter<DeviceHealthStatus | null>;
    setCapabilitiesStatus: StateSetter<BLECapabilitiesStatus | null>;
    setLedBrightnessStatus: StateSetter<LEDBrightnessStatus | null>;
    setLedBrightnessSupported: StateSetter<boolean | null>;
    setCardLogDetailStatus: StateSetter<CardLogDetailStatus | null>;
    setCardLogSettingsStatus: StateSetter<CardLogSettingsStatus | null>;
    setI2cConfigStatus: StateSetter<I2cConfigStatus | null>;
}
export const useBLEStatusUpdaters = ({ setCardStatus, setCardLogControlStatus, setStm32FirmwareVersion, setSampleMetadataStatus, setDeviceHealthStatus, setCapabilitiesStatus, setLedBrightnessStatus, setLedBrightnessSupported, setCardLogDetailStatus, setCardLogSettingsStatus, setI2cConfigStatus, }: UseBLEStatusUpdatersOptions) => {
    const updateCardStatus = useCallback((status: CardStatus | null) => {
        setCardStatus((current) => {
            if (current === null || status === null) {
                return current === status ? current : status;
            }
            return areCardStatusesEqual(current, status) ? current : status;
        });
    }, [setCardStatus]);
    const updateCardLogControlStatus = useCallback((status: CardLogControlStatus | null) => {
        setCardLogControlStatus((current) => {
            if (current === null || status === null) {
                return current === status ? current : status;
            }
            return areCardLogControlStatusesEqual(current, status) ? current : status;
        });
    }, [setCardLogControlStatus]);
    const updateStm32FirmwareVersion = useCallback((status: Stm32FirmwareVersionStatus | null) => {
        setStm32FirmwareVersion((current) => {
            if (current === null || status === null) {
                return current === status ? current : status;
            }
            return areStm32FirmwareVersionStatusesEqual(current, status) ? current : status;
        });
    }, [setStm32FirmwareVersion]);
    const updateSampleMetadataStatus = useCallback((status: SampleMetadataStatus | null) => {
        setSampleMetadataStatus((current) => {
            if (current === null || status === null) {
                return current === status ? current : status;
            }
            return areSampleMetadataStatusesEqual(current, status) ? current : status;
        });
    }, [setSampleMetadataStatus]);
    const updateDeviceHealthStatus = useCallback((status: DeviceHealthStatus | null) => {
        setDeviceHealthStatus((current) => {
            if (current === null || status === null) {
                return current === status ? current : status;
            }
            return areDeviceHealthStatusesEqual(current, status) ? current : status;
        });
    }, [setDeviceHealthStatus]);
    const updateCapabilitiesStatus = useCallback((status: BLECapabilitiesStatus | null) => {
        setCapabilitiesStatus((current) => {
            if (current === null || status === null) {
                return current === status ? current : status;
            }
            return areCapabilitiesStatusesEqual(current, status) ? current : status;
        });
    }, [setCapabilitiesStatus]);
    const updateLedBrightnessStatus = useCallback((status: LEDBrightnessStatus | null) => {
        setLedBrightnessStatus((current) => {
            if (current === null || status === null) {
                return current === status ? current : status;
            }
            return areLEDBrightnessStatusesEqual(current, status) ? current : status;
        });
        setLedBrightnessSupported(status !== null);
    }, [setLedBrightnessStatus, setLedBrightnessSupported]);
    const updateCardLogDetailStatus = useCallback((status: CardLogDetailStatus | null) => {
        setCardLogDetailStatus((current) => {
            if (current === null || status === null) {
                return current === status ? current : status;
            }
            return areCardLogDetailStatusesEqual(current, status) ? current : status;
        });
    }, [setCardLogDetailStatus]);
    const updateCardLogSettingsStatus = useCallback((status: CardLogSettingsStatus | null) => {
        setCardLogSettingsStatus((current) => {
            if (current === null || status === null) {
                return current === status ? current : status;
            }
            return areCardLogSettingsStatusesEqual(current, status) ? current : status;
        });
    }, [setCardLogSettingsStatus]);
    const updateI2cConfigStatus = useCallback((status: I2cConfigStatus | null) => {
        setI2cConfigStatus((current) => {
            if (current === null || status === null) {
                return current === status ? current : status;
            }
            return areI2cConfigStatusesEqual(current, status) ? current : status;
        });
    }, [setI2cConfigStatus]);
    return {
        updateCapabilitiesStatus,
        updateDeviceHealthStatus,
        updateI2cConfigStatus,
        updateLedBrightnessStatus,
        updateSampleMetadataStatus,
        updateCardLogControlStatus,
        updateCardLogDetailStatus,
        updateCardLogSettingsStatus,
        updateCardStatus,
        updateStm32FirmwareVersion,
    };
};
