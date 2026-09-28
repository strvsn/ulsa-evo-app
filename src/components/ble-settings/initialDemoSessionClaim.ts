import type { Esp32FirmwareArtifactIdentity } from '../../services/ota/esp32FirmwareIdentity';
import { claimInitialDemoSession, type InitialDemoSession } from '../../services/ota/initialDemoOta';
import { wait } from './otaPanelHelpers';

const CLAIM_TIMEOUT_MS = 2500;

export class InitialSessionClaimHttpError extends Error {
  constructor(readonly status: number) {
    super(`本体が初回更新要求を受け付けませんでした（応答番号 ${status}）`);
    this.name = 'InitialSessionClaimHttpError';
  }
}

export const waitForInitialDemoSession = async (
  identity: Esp32FirmwareArtifactIdentity,
  clientNonce: string,
  attempts = 8,
): Promise<InitialDemoSession> => {
  let lastHttpStatus: number | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLAIM_TIMEOUT_MS);
    try {
      return await claimInitialDemoSession(identity, clientNonce, controller.signal);
    } catch (error) {
      if (error instanceof Error &&
          /^Initial OTA session応答が(?:JSONではありません|不正です)$/.test(error.message)) {
        throw error;
      }
      const match = error instanceof Error
        ? error.message.match(/^Initial OTA session取得に失敗しました: HTTP (\d{3})$/)
        : null;
      if (match) {
        lastHttpStatus = Number(match[1]);
        if ([400, 404, 409].includes(lastHttpStatus)) {
          throw new InitialSessionClaimHttpError(lastHttpStatus);
        }
      }
      if (attempt < attempts - 1) await wait(1000);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  if (lastHttpStatus !== null) throw new InitialSessionClaimHttpError(lastHttpStatus);
  throw new Error('ULSA-EVO-INITIALへ接続できませんでした。iPhoneのWi-Fi接続先を確認し、本体が白点灯の間に接続を再確認してください');
};
