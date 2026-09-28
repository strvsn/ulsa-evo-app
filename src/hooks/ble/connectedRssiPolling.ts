export const CONNECTED_RSSI_POLL_INTERVAL_MS = 5000;

/**
 * Starts a native-only RSSI polling loop. Reads never overlap, and a failed
 * read leaves the last successful UI value intact until a later retry works.
 */
export const startConnectedRssiPolling = (
  readRssi: () => Promise<number | null>,
  onRssi: (rssi: number) => void,
  intervalMs = CONNECTED_RSSI_POLL_INTERVAL_MS
): (() => void) => {
  let stopped = false;
  let readInFlight = false;

  const isVisible = () => (
    typeof document === 'undefined' || document.visibilityState !== 'hidden'
  );

  const poll = async () => {
    if (stopped || readInFlight || !isVisible()) return;
    readInFlight = true;
    try {
      const rssi = await readRssi();
      if (!stopped && rssi !== null && Number.isFinite(rssi)) {
        onRssi(rssi);
      }
    } catch {
      // RSSI is supplemental. Keep the connection and last good value.
    } finally {
      readInFlight = false;
    }
  };

  const handleVisibilityChange = () => {
    if (isVisible()) void poll();
  };

  void poll();
  const interval = setInterval(() => void poll(), intervalMs);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  return () => {
    stopped = true;
    clearInterval(interval);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
};
