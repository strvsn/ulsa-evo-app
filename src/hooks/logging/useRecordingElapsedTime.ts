import { useEffect, useMemo, useState } from 'react';
import { formatLogRecordingElapsed } from './logRecordingVisuals';

export const useRecordingElapsedTime = (active: boolean) => {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      setStartedAt(null);
      return;
    }

    const currentTime = Date.now();
    setStartedAt((previous) => previous ?? currentTime);
    setNow(currentTime);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  return useMemo(() => {
    const elapsedSeconds = startedAt === null
      ? 0
      : Math.floor((now - startedAt) / 1000);
    return { elapsedSeconds, elapsedLabel: formatLogRecordingElapsed(elapsedSeconds) };
  }, [now, startedAt]);
};
