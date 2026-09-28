import type { Esp32FirmwareArtifactIdentity } from './esp32FirmwareIdentity';
import type { Esp32OtaSession } from './esp32OtaTransfer';
import type { SoftApCredentials } from './nativeSoftAp';

export const INITIAL_DEMO_SOFT_AP: SoftApCredentials = {
  ssid: 'ULSA-EVO-INITIAL',
  password: 'ulsa-evo-initial',
};

export interface InitialDemoSession extends Esp32OtaSession {
  contractVersion: 1;
  purpose: 'esp32_ota';
  sessionOrigin: 'initial_setup';
  firmwareProfile: 'initial';
  targetProfile: 'demo';
  remainingSeconds: number;
}

const randomHex = (byteLength: number): string => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
};

export const createInitialDemoClientNonce = (): string => randomHex(32);

export const isInitialDemoWebFallbackAvailable = (): boolean => {
  const userAgent = globalThis.navigator?.userAgent || '';
  return !/(iPhone|iPad|iPod)/i.test(userAgent) &&
    /(Chrome|Chromium|Edg)\//i.test(userAgent);
};

export const claimInitialDemoSession = async (
  identity: Esp32FirmwareArtifactIdentity,
  clientNonce: string,
  signal?: AbortSignal
): Promise<InitialDemoSession> => {
  const request = {
    method: 'POST',
    cache: 'no-store',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contractVersion: 1,
      clientNonce,
      artifactSha256: identity.sha256,
      version: identity.version,
      revision: identity.revision,
      commit: identity.commit,
    }),
    signal,
    targetAddressSpace: 'local',
  } as RequestInit & { targetAddressSpace: 'local' };
  const response = await fetch('http://192.168.4.1/initial/ota-session', request);
  if (!response.ok) {
    throw new Error(`Initial OTA session取得に失敗しました: HTTP ${response.status}`);
  }
  const session = await response.json().catch(() => {
    throw new Error('Initial OTA session応答がJSONではありません');
  }) as InitialDemoSession;
  if (
    session.contractVersion !== 1 ||
    session.sessionOrigin !== 'initial_setup' ||
    session.firmwareProfile !== 'initial' ||
    session.targetProfile !== 'demo' ||
    session.purpose !== 'esp32_ota' ||
    session.ssid !== INITIAL_DEMO_SOFT_AP.ssid ||
    session.password !== INITIAL_DEMO_SOFT_AP.password ||
    !session.token || session.ip !== '192.168.4.1'
  ) {
    throw new Error('Initial OTA session応答が不正です');
  }
  return session;
};
