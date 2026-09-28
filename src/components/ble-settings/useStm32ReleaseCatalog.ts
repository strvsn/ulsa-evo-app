import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  downloadStm32FirmwarePackage,
  fetchStm32FirmwareReleases,
  type Stm32FirmwareReleaseOption,
} from '../../services/ota/stm32FirmwareReleaseCatalog';
import { getFirmwareCatalogErrorMessage } from './otaPanelHelpers';
import { getStm32WebUpdateUnavailableReason } from '../../services/ble/platformDetector';
import {
  describeNoSelectableStm32Release,
  getStm32ReleaseSelectionMode,
  isReleaseSelectableForMode,
  stm32AlertMessage,
  stm32StatusMessage,
  type CachedStm32Package,
  type Stm32PanelMessage,
} from './stm32UpdatePanelHelpers';

type Args = {
  adapterType?: string;
  connectionFlowBusy: boolean;
  transferBusy: boolean;
  onSelectionInvalidated: () => void;
  onMessage: (message: Stm32PanelMessage | null) => void;
};

export const useStm32ReleaseCatalog = ({
  adapterType,
  connectionFlowBusy,
  transferBusy,
  onSelectionInvalidated,
  onMessage,
}: Args) => {
  const [releases, setReleases] = useState<Stm32FirmwareReleaseOption[]>([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [cachedPackage, setCachedPackage] = useState<CachedStm32Package | null>(null);
  const browserUpdateUnavailableReason = adapterType === 'Capacitor'
    ? null : getStm32WebUpdateUnavailableReason();
  const browserReleaseBlocked = browserUpdateUnavailableReason !== null;
  const releaseSelectionMode = useMemo(() => getStm32ReleaseSelectionMode(), []);
  const selectedRelease = useMemo(
    () => releases.find((release) => release.id === selectedReleaseId) ?? null,
    [releases, selectedReleaseId],
  );

  const loadReleases = useCallback(async () => {
    setCatalogBusy(true);
    try {
      const nextReleases = await fetchStm32FirmwareReleases();
      const selectableReleases = nextReleases.filter((release) =>
        isReleaseSelectableForMode(release, releaseSelectionMode)
      );
      setReleases(selectableReleases);
      setSelectedReleaseId((current) =>
        selectableReleases.some((release) => release.id === current)
          ? current
          : selectableReleases[0]?.id ?? null
      );
      onMessage(selectableReleases.length > 0
        ? null
        : stm32AlertMessage(describeNoSelectableStm32Release(releaseSelectionMode)));
    } catch (error) {
      setReleases([]);
      setSelectedReleaseId(null);
      onMessage(stm32AlertMessage(
        getFirmwareCatalogErrorMessage(error, 'STM32 FW package release')
      ));
    } finally {
      setCatalogBusy(false);
    }
  }, [onMessage, releaseSelectionMode]);

  useEffect(() => {
    void loadReleases();
  }, [loadReleases]);

  useEffect(() => {
    if (!cachedPackage || cachedPackage.releaseId === selectedReleaseId) return;
    setCachedPackage(null);
    onSelectionInvalidated();
  }, [cachedPackage, onSelectionInvalidated, selectedReleaseId]);

  const clearCachedPackage = useCallback(() => setCachedPackage(null), []);

  const cacheSelectedPackage = async (): Promise<File | null> => {
    if (browserUpdateUnavailableReason) {
      onMessage(stm32AlertMessage(browserUpdateUnavailableReason));
      return null;
    }
    if (!selectedRelease) {
      onMessage(stm32AlertMessage('先にSTM32 FW package releaseを選択してください'));
      return null;
    }
    if (cachedPackage?.releaseId === selectedRelease.id) return cachedPackage.file;

    setDownloadBusy(true);
    try {
      onMessage(stm32StatusMessage('STM32 FW packageを取得しています'));
      const file = await downloadStm32FirmwarePackage(selectedRelease);
      setCachedPackage({ releaseId: selectedRelease.id, file });
      onMessage(stm32StatusMessage('STM32 FW packageを取得しました'));
      return file;
    } catch (error) {
      setCachedPackage(null);
      onMessage(stm32AlertMessage(
        error instanceof Error ? error.message : 'STM32 FW package取得に失敗しました'
      ));
      return null;
    } finally {
      setDownloadBusy(false);
    }
  };

  const selectedPackageReady = Boolean(
    selectedRelease && cachedPackage?.releaseId === selectedRelease.id
  );
  const canDownloadPackage = Boolean(
    selectedRelease && !browserReleaseBlocked && !catalogBusy && !downloadBusy &&
    !connectionFlowBusy && !transferBusy
  );

  return {
    releases,
    selectedReleaseId,
    setSelectedReleaseId,
    selectedRelease,
    catalogBusy,
    downloadBusy,
    cachedPackage,
    selectedPackageReady,
    browserReleaseBlocked,
    browserUpdateUnavailableReason,
    canDownloadPackage,
    loadReleases,
    cacheSelectedPackage,
    clearCachedPackage,
  };
};
