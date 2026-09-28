import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  BLENotSupportedError,
  getBLEAdapter,
  getBLEPlatformInfo,
  type BLEPlatformInfo,
  type IBLEAdapter,
} from '../../services/ble';
import { logBLEDebug } from '../../services/ble/bleLogger';
import { normalizeBleUserMessage } from '../../utils/normalizeBleUserMessage';

type StateSetter<T> = Dispatch<SetStateAction<T>>;

interface UseBLEInitializationOptions {
  adapterRef: MutableRefObject<IBLEAdapter | null>;
  isInitializedRef: MutableRefObject<boolean>;
  setError: StateSetter<string | null>;
  setIsSupported: StateSetter<boolean>;
  setPlatformInfo: StateSetter<BLEPlatformInfo | null>;
}

export const useBLEInitialization = ({
  adapterRef,
  isInitializedRef,
  setError,
  setIsSupported,
  setPlatformInfo,
}: UseBLEInitializationOptions): void => {
  useEffect(() => {
    const init = async () => {
      if (isInitializedRef.current) return;
      isInitializedRef.current = true;

      try {
        const info = getBLEPlatformInfo();
        setPlatformInfo(info);

        if (!info.isSupported) {
          setIsSupported(false);
          setError(normalizeBleUserMessage(info.message) || 'このブラウザ/デバイスではBLEがサポートされていません');
          return;
        }

        const adapter = getBLEAdapter();
        adapterRef.current = adapter;

        await adapter.initialize();
        setIsSupported(true);

        logBLEDebug(`BLE initialized: ${info.platform} (${info.adapterType})`);
      } catch (err) {
        console.error('BLE初期化エラー:', err);
        if (err instanceof BLENotSupportedError) {
          setError(normalizeBleUserMessage(err.message) || 'BLE初期化に失敗しました');
        } else {
          setError('BLE初期化に失敗しました');
        }
        setIsSupported(false);
      }
    };

    init();

    return () => {
      const adapter = adapterRef.current;
      if (adapter) {
        const disconnectPromise = adapter.disconnect().catch(console.error);
        void disconnectPromise;
      }
    };
  }, [adapterRef, isInitializedRef, setError, setIsSupported, setPlatformInfo]);
};
