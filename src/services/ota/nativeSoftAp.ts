import { Capacitor, registerPlugin } from '@capacitor/core';
export interface SoftApCredentials {
  ssid: string;
  password: string;
}

export interface NativeSoftApJoinResult {
  ssid: string;
  connected: boolean;
  alreadyAssociated?: boolean;
  reason?: string;
  message?: string;
  errorDomain?: string;
  errorCode?: number;
}

export interface NativeInitialPortalProbeResult {
  reachable: boolean;
  reason?: string;
  errorCode?: number;
  httpStatus?: number;
}

interface NativeSoftApPlugin {
  connect(options: {
    ssid: string;
    password?: string;
    joinOnce?: boolean;
  }): Promise<NativeSoftApJoinResult>;
  probeInitialPortal(): Promise<NativeInitialPortalProbeResult>;
  removeConfiguration(options: { ssid: string }): Promise<{ ssid: string; removed: boolean }>;
}

const UlsaSoftAp = registerPlugin<NativeSoftApPlugin>('UlsaSoftAp');
let nativeJoinInFlight = false;

export const isNativeSoftApJoinAvailable = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

export const connectToEsp32SoftAp = async (
  session: SoftApCredentials
): Promise<NativeSoftApJoinResult> => {
  if (!isNativeSoftApJoinAvailable()) {
    return {
      ssid: session.ssid,
      connected: false,
      reason: 'unsupported',
      message: 'Wi-Fi auto-join is only available in the iOS Capacitor app.',
    };
  }

  if (nativeJoinInFlight) {
    return {
      ssid: session.ssid,
      connected: false,
      reason: 'pending',
      message: '別のWi-Fi接続要求を処理中です。完了後に再試行してください。',
    };
  }

  nativeJoinInFlight = true;
  try {
    return await UlsaSoftAp.connect({
      ssid: session.ssid,
      password: session.password || undefined,
      joinOnce: true,
    });
  } catch (error) {
    return {
      ssid: session.ssid,
      connected: false,
      reason: 'pluginError',
      message: error instanceof Error ? error.message : 'iOS Wi-Fi接続pluginが応答しませんでした。',
    };
  } finally {
    nativeJoinInFlight = false;
  }
};

// The iOS callback can remain pending even while the device's SoftAP is visible.
// Bound the Initial setup UI wait without starting a second native join request.
export const connectToInitialSoftApWithTimeout = async (
  session: SoftApCredentials,
  timeoutMs = 20_000,
): Promise<NativeSoftApJoinResult> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      connectToEsp32SoftAp(session),
      new Promise<NativeSoftApJoinResult>((resolve) => {
        timeoutId = setTimeout(() => resolve({
          ssid: session.ssid,
          connected: false,
          reason: 'timeout',
        }), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
};

export const probeInitialPortalFromIos = async (): Promise<NativeInitialPortalProbeResult> => {
  if (!isNativeSoftApJoinAvailable()) return { reachable: false, reason: 'unsupported' };
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      UlsaSoftAp.probeInitialPortal().catch(() => ({ reachable: false, reason: 'probePluginError' })),
      new Promise<NativeInitialPortalProbeResult>((resolve) => {
        timeoutId = setTimeout(() => resolve({ reachable: false, reason: 'probeTimeout' }), 7_000);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
};

const joinDiagnostic = (result: NativeSoftApJoinResult): string => {
  const parts = [
    result.reason,
    result.errorDomain,
    typeof result.errorCode === 'number' ? `code ${result.errorCode}` : undefined,
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? `（${parts.join(' / ')}）` : '';
};

export const describeNativeSoftApJoinFailure = (
  result: NativeSoftApJoinResult,
  initialSetup = false,
): string => {
  const diagnostic = joinDiagnostic(result);
  const retryInstruction = initialSetup
    ? 'この画面の「接続を再確認」から再試行してください'
    : 'Step 2から再試行してください';
  const restartInstruction = initialSetup
    ? '本体を緑点滅へ戻して初回セットアップからやり直してください'
    : 'BLE接続から更新準備をやり直してください';
  switch (result.reason) {
    case 'timeout':
      return `iOSのWi-Fi接続確認が一定時間応答しませんでした。本体が白点灯し「${result.ssid}」がWi-Fi設定に表示される場合は、手動で接続してから${retryInstruction}`;
    case 'userDenied':
      return `iOSのWi-Fi接続確認がキャンセルされました。${retryInstruction}${diagnostic}`;
    case 'pending':
      return `iOSが別のWi-Fi接続要求を処理中です。数秒待って${retryInstruction}${diagnostic}`;
    case 'applicationIsNotInForeground':
      return `アプリを前面に戻して${retryInstruction}${diagnostic}`;
    case 'invalidSSID':
    case 'invalidSSIDPrefix':
    case 'invalidWPAPassphrase':
    case 'joinOnceNotSupported':
    case 'invalid':
      return `更新用Wi-Fi情報が不正です。${restartInstruction}${diagnostic}`;
    case 'systemDenied':
    case 'userUnauthorized':
      return `iOSがこのアプリのWi-Fi設定を許可していません。アプリを前面で再起動して${retryInstruction}${diagnostic}`;
    default: {
      const systemMessage = result.message?.trim();
      const detail = systemMessage ? ` iOS: ${systemMessage}` : '';
      return `iOSが「${result.ssid}」へ参加できませんでした${diagnostic}。本体が白表示なら${retryInstruction}。Wi-Fi設定にSSIDが見つからない場合は、${restartInstruction}。${detail}`;
    }
  }
};

const RETRYABLE_NATIVE_JOIN_REASONS = new Set([
  'pending',
  'systemConfiguration',
  'internal',
  'unknown',
]);

export const shouldRetryNativeSoftApJoin = (
  result: NativeSoftApJoinResult,
): boolean => !result.connected && Boolean(
  result.reason && RETRYABLE_NATIVE_JOIN_REASONS.has(result.reason)
);

export const removeEsp32SoftApConfiguration = async (
  session: SoftApCredentials
): Promise<void> => {
  if (!isNativeSoftApJoinAvailable()) return;
  await UlsaSoftAp.removeConfiguration({ ssid: session.ssid });
};
