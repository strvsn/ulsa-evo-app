import { SERVICE_UUIDS } from './bleConstants';

export const ULSA_EVO_WEB_DEVICE_NAME_PREFIX = 'ULSA EVO #';

export const createWebBleDeviceRequestOptions = () => ({
  filters: [
    { services: [SERVICE_UUIDS.ENVIRONMENTAL_SENSING] },
    { namePrefix: ULSA_EVO_WEB_DEVICE_NAME_PREFIX },
  ],
  optionalServices: [
    SERVICE_UUIDS.ENVIRONMENTAL_SENSING,
    SERVICE_UUIDS.CURRENT_TIME,
    SERVICE_UUIDS.DEVICE_INFORMATION,
    SERVICE_UUIDS.ULSA_WIND,
  ],
});
