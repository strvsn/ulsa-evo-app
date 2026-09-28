import type { OtaControlStatus } from '../../types/ble';
import {
  isPhysicalAuthorizationGranted,
  isPhysicalAuthorizationPending,
  validatePhysicalAuthorizationStatus,
  waitForPhysicalAuthorization,
} from './otaPanelHelpers';

type ResolveOtaAuthorizationOptions = {
  initialStatus: OtaControlStatus | null;
  readStatus: () => Promise<OtaControlStatus | null>;
  waitingMessage: string;
  describeResult: (result: OtaControlStatus['result']) => string;
  onWaiting: (message: string, seconds: number) => void;
  onFinishedWaiting: () => void;
};

export type OtaAuthorizationResolution =
  | { status: OtaControlStatus; error: null }
  | { status: OtaControlStatus | null; error: string };

export const confirmLegacyOtaMigration = (
  status: OtaControlStatus,
  message: string
): boolean => status.protocolVersion >= 3 || window.confirm(message) !== false;

export const resolveOtaAuthorization = async ({
  initialStatus,
  readStatus,
  waitingMessage,
  describeResult,
  onWaiting,
  onFinishedWaiting,
}: ResolveOtaAuthorizationOptions): Promise<OtaAuthorizationResolution> => {
  let status = initialStatus;
  const initialError = validatePhysicalAuthorizationStatus(status);
  if (initialError) return { status, error: initialError };

  if (status && isPhysicalAuthorizationPending(status)) {
    const authSeconds = Math.max(1, status.remainingSeconds || 60);
    onWaiting(waitingMessage, authSeconds);
    try {
      status = await waitForPhysicalAuthorization({
        initialStatus: status,
        timeoutSeconds: authSeconds,
        readStatus,
      });
    } finally {
      onFinishedWaiting();
    }

    const finalError = validatePhysicalAuthorizationStatus(status);
    if (finalError) return { status, error: finalError };
    if (!isPhysicalAuthorizationGranted(status)) {
      return {
        status,
        error: status
          ? describeResult(status.result)
          : '本体での許可時間が終了しました。更新準備からやり直してください',
      };
    }
  }

  if (!status || status.result !== 'ok') {
    return {
      status,
      error: status ? describeResult(status.result) : '更新用Wi-Fi情報を作成できませんでした',
    };
  }
  return { status, error: null };
};
