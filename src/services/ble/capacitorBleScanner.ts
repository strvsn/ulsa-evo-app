import { BleClient } from '@capacitor-community/bluetooth-le';

export const CAPACITOR_BLE_SCAN_DURATION_MS = 5000;
export const CAPACITOR_BLE_SCAN_START_TIMEOUT_MS = 3000;

const SCAN_CANCELLED = Symbol('scan-cancelled');

interface ActiveScanSession {
  id: number;
  cancellation: Promise<typeof SCAN_CANCELLED>;
  cancel: () => void;
  stopCompletion: Promise<void> | null;
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
  private pendingNativeStop: Promise<void> | null = null;

  private stopNativeScan(): Promise<void> {
    if (this.pendingNativeStop) return this.pendingNativeStop;
    const operation = BleClient.stopLEScan().catch((error) => {
      console.warn('[BLE] stopLEScan失敗:', error);
      throw new Error('BLE検索を停止できませんでした。もう一度お試しください');
    });
    const tracked = operation.finally(() => {
      if (this.pendingNativeStop === tracked) this.pendingNativeStop = null;
    });
    this.pendingNativeStop = tracked;
    return tracked;
  }

  private cancelActiveSession(): ActiveScanSession | null {
    const session = this.activeSession;
    this.activeSession = null;
    session?.cancel();
    return session;
  }

  async stop(): Promise<void> {
    const session = this.cancelActiveSession();
    const stopCompletion = this.stopNativeScan();
    if (session) session.stopCompletion = stopCompletion;
    await stopCompletion;
  }

  async scan(
    services: string[],
    onResult: (result: CapacitorScanResult) => void
  ): Promise<void> {
    const previousSession = this.cancelActiveSession();
    let resolveCancellation: ((value: typeof SCAN_CANCELLED) => void) | null = null;
    const session: ActiveScanSession = {
      id: ++this.sequence,
      stopCompletion: null,
      cancellation: new Promise((resolve) => {
        resolveCancellation = resolve;
      }),
      cancel: () => {
        resolveCancellation?.(SCAN_CANCELLED);
        resolveCancellation = null;
      },
    };
    // Own cancellation before awaiting cleanup, including cached-card selection.
    this.activeSession = session;
    let nativeScanRequested = false;

    try {
      const reclaimCompletion = this.stopNativeScan();
      if (previousSession) previousSession.stopCompletion = reclaimCompletion;
      await reclaimCompletion;
      if (this.activeSession?.id !== session.id) return;

      nativeScanRequested = true;
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

      let durationTimer: ReturnType<typeof setTimeout> | null = null;
      try {
        await Promise.race([
          new Promise<void>((resolve) => {
            durationTimer = setTimeout(resolve, CAPACITOR_BLE_SCAN_DURATION_MS);
          }),
          session.cancellation,
        ]);
      } finally {
        if (durationTimer !== null) clearTimeout(durationTimer);
      }
    } finally {
      if (this.activeSession?.id === session.id) {
        this.activeSession = null;
        session.cancel();
        if (nativeScanRequested) await this.stopNativeScan();
      } else {
        // Cancellation is not complete until the same native stop is acknowledged.
        await session.stopCompletion;
      }
    }
  }
}
