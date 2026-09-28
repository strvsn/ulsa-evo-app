import { BleClient } from '@capacitor-community/bluetooth-le';

export const CAPACITOR_BLE_SCAN_DURATION_MS = 5000;
export const CAPACITOR_BLE_SCAN_START_TIMEOUT_MS = 3000;

const SCAN_CANCELLED = Symbol('scan-cancelled');

interface ActiveScanSession {
  id: number;
  cancellation: Promise<typeof SCAN_CANCELLED>;
  cancel: () => void;
}

interface CapacitorScanResult {
  device?: { deviceId: string; name?: string | null };
  localName?: string | null;
  rssi?: number;
  serviceData?: Record<string, DataView>;
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
};

/** Owns one native scan at a time and reclaims stale CoreBluetooth scan state. */
export class CapacitorBleScanner {
  private activeSession: ActiveScanSession | null = null;
  private sequence = 0;

  private async stopNativeScan(): Promise<void> {
    await BleClient.stopLEScan().catch((error) => {
      console.warn('[BLE] stopLEScan失敗:', error);
    });
  }

  async stop(): Promise<void> {
    const activeSession = this.activeSession;
    if (activeSession) {
      this.activeSession = null;
      activeSession.cancel();
    }
    await this.stopNativeScan();
  }

  async scan(
    services: string[],
    onResult: (result: CapacitorScanResult) => void
  ): Promise<void> {
    // 前回の失敗・中断でiOS側に残ったスキャンを先に回収する。
    await this.stop();

    let resolveCancellation: ((value: typeof SCAN_CANCELLED) => void) | null = null;
    const session: ActiveScanSession = {
      id: ++this.sequence,
      cancellation: new Promise((resolve) => {
        resolveCancellation = resolve;
      }),
      cancel: () => {
        resolveCancellation?.(SCAN_CANCELLED);
        resolveCancellation = null;
      },
    };
    this.activeSession = session;

    try {
      const scanStartResult = await Promise.race([
        withTimeout(
          BleClient.requestLEScan(
            { services },
            (result) => {
              if (this.activeSession?.id === session.id) onResult(result);
            }
          ),
          CAPACITOR_BLE_SCAN_START_TIMEOUT_MS,
          'BLE検索を開始できませんでした。もう一度お試しください'
        ).then(() => undefined),
        session.cancellation,
      ]);

      if (scanStartResult === SCAN_CANCELLED) return;

      await Promise.race([
        new Promise<void>((resolve) => setTimeout(resolve, CAPACITOR_BLE_SCAN_DURATION_MS)),
        session.cancellation,
      ]);
    } finally {
      if (this.activeSession?.id === session.id) {
        this.activeSession = null;
        await this.stopNativeScan();
      }
    }
  }
}
