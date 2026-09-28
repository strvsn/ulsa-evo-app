import type { Dispatch, SetStateAction } from 'react';
import { normalizeUlsaEvoDeviceName } from '../../services/ble/deviceIdentity';
import type { BLEDeviceInfo } from './types';

export const synchronizeConnectedNodeId = (
  setConnectedDevice: Dispatch<SetStateAction<BLEDeviceInfo | null>>,
  nodeId: number | undefined
): void => {
  if (nodeId === undefined) return;

  setConnectedDevice((current) => {
    if (current === null || current.nodeId === nodeId) return current;

    const name = normalizeUlsaEvoDeviceName(current.name, nodeId);
    return { ...current, name, nodeId };
  });
};
