import { useEffect, useRef, useState } from 'react';
import {
  isNativeTrueHeadingAvailable,
  startTrueHeading,
  stopTrueHeading,
  subscribeToTrueHeading,
  subscribeToTrueNavigation,
  type TrueHeadingUpdate,
  type TrueNavigationUpdate,
} from '../services/nativeTrueHeading';
import {
  assessGnssMotion,
  GNSS_LOCATION_STALE_MS,
  type GnssMotionAssessment,
  type GnssMotionSample,
} from '../utils/trueWind';

export type WindReferenceMode = 'off' | 'compass' | 'gnss';
export type WindReferenceHeadingStatus =
  | 'off'
  | 'requesting'
  | 'ready'
  | 'lowAccuracy'
  | 'denied'
  | 'restricted'
  | 'unavailable';

type HeadingState = {
  isSupported: boolean;
  status: WindReferenceHeadingStatus;
  trueHeading: number | null;
  headingAccuracy: number | null;
  headingTimestampMs: number | null;
};

export type WindReferenceNavigationState = HeadingState & {
  mode: WindReferenceMode;
  gnssSample: GnssMotionSample;
  gnssAssessment: GnssMotionAssessment;
  gnssAgeMs: number | null;
  gnssStaleAfterMs: number;
};

export const MAX_HEADING_ACCURACY_DEGREES = 30;
export const RETAIN_MAX_HEADING_ACCURACY_DEGREES = 45;
const STALE_CHECK_INTERVAL_MS = 1_000;

const isDocumentVisible = (): boolean => (
  typeof document === 'undefined' || document.visibilityState !== 'hidden'
);

const emptyGnssSample = (supported: boolean): GnssMotionSample => ({
  speedMps: null,
  speedAccuracyMps: null,
  courseDegrees: null,
  courseAccuracyDegrees: null,
  horizontalAccuracyMeters: null,
  timestampMs: null,
  available: false,
  authorization: supported ? 'notDetermined' : 'unsupported',
  accuracyAuthorization: 'unsupported',
});

const initialHeadingState = (
  mode: WindReferenceMode,
  supported: boolean,
): HeadingState => ({
  isSupported: supported,
  status: mode === 'off' ? 'off' : supported ? 'requesting' : 'unavailable',
  trueHeading: null,
  headingAccuracy: null,
  headingTimestampMs: null,
});

const resolveHeadingState = (
  update: TrueHeadingUpdate,
  timestampMs: number | null,
  previousStatus: HeadingState['status'] = 'requesting',
): HeadingState => {
  const isSupported = update.authorization !== 'unsupported';
  if (update.authorization === 'denied') {
    return { ...initialHeadingState('compass', isSupported), status: 'denied' };
  }
  if (update.authorization === 'restricted') {
    return { ...initialHeadingState('compass', isSupported), status: 'restricted' };
  }

  const hasHeading = update.available
    && update.trueHeading !== null
    && update.headingAccuracy !== null
    && update.headingAccuracy >= 0;
  if (!hasHeading) {
    return initialHeadingState('compass', isSupported);
  }

  const headingAccuracyLimit = previousStatus === 'ready'
    ? RETAIN_MAX_HEADING_ACCURACY_DEGREES
    : MAX_HEADING_ACCURACY_DEGREES;
  return {
    isSupported,
    status: update.headingAccuracy! > headingAccuracyLimit
      ? 'lowAccuracy'
      : 'ready',
    trueHeading: update.trueHeading,
    headingAccuracy: update.headingAccuracy,
    headingTimestampMs: timestampMs,
  };
};

const navigationHeadingUpdate = (update: TrueNavigationUpdate): TrueHeadingUpdate => ({
  trueHeading: update.trueHeading,
  headingAccuracy: update.headingAccuracy,
  available: update.trueHeading !== null && update.headingAccuracy !== null,
  authorization: update.authorization,
});

const navigationMotionSample = (update: TrueNavigationUpdate): GnssMotionSample => ({
  speedMps: update.speed,
  speedAccuracyMps: update.speedAccuracy,
  courseDegrees: update.course,
  courseAccuracyDegrees: update.courseAccuracy,
  horizontalAccuracyMeters: update.horizontalAccuracy,
  timestampMs: update.locationTimestamp,
  available: update.authorization === 'authorized' && update.locationTimestamp !== null,
  authorization: update.authorization,
  accuracyAuthorization: update.accuracyAuthorization,
});

/**
 * Owns the single Core Location bridge session used by the three-state control.
 * Lifecycle operations are serialized so a previous mode cannot stop a newly
 * started mode during rapid transitions or React Strict Mode remounts.
 */
export const useWindReferenceNavigation = (
  mode: WindReferenceMode,
  isActive: boolean,
): WindReferenceNavigationState => {
  const nativeAvailable = isNativeTrueHeadingAvailable();
  const lifecycleQueue = useRef<Promise<void>>(Promise.resolve());
  const [documentVisible, setDocumentVisible] = useState(isDocumentVisible);
  const [heading, setHeading] = useState<HeadingState>(
    () => initialHeadingState(mode, nativeAvailable),
  );
  const [gnssSample, setGnssSample] = useState<GnssMotionSample>(
    () => emptyGnssSample(nativeAvailable),
  );
  const [gnssAssessment, setGnssAssessment] = useState<GnssMotionAssessment>(
    () => assessGnssMotion(emptyGnssSample(nativeAvailable), Date.now(), false),
  );
  const gnssSampleRef = useRef(gnssSample);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const updateVisibility = () => setDocumentVisible(isDocumentVisible());
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    const effectiveActive = isActive && documentVisible;
    const shouldRun = nativeAvailable && effectiveActive && mode !== 'off';
    const resetSample = emptyGnssSample(nativeAvailable);
    const resetNow = Date.now();
    setHeading(initialHeadingState(effectiveActive ? mode : 'off', nativeAvailable));
    gnssSampleRef.current = resetSample;
    setGnssSample(resetSample);
    setGnssAssessment(assessGnssMotion(
      resetSample,
      resetNow,
      mode === 'gnss' && effectiveActive,
    ));
    setNowMs(resetNow);
    if (!shouldRun) return undefined;

    let disposed = false;
    let started = false;
    let listener: Awaited<
      ReturnType<typeof subscribeToTrueHeading | typeof subscribeToTrueNavigation>
    > = null;

    const begin = async () => {
      if (disposed) return;
      if (mode === 'gnss') {
        listener = await subscribeToTrueNavigation((update) => {
          if (disposed) return;
          const receivedAt = Date.now();
          const nextSample = navigationMotionSample(update);
          setHeading((current) => resolveHeadingState(
            navigationHeadingUpdate(update),
            update.headingTimestamp,
            current.status,
          ));
          gnssSampleRef.current = nextSample;
          setGnssSample(nextSample);
          setGnssAssessment((current) => assessGnssMotion(
            nextSample,
            receivedAt,
            true,
            { previousAssessment: current },
          ));
          setNowMs(receivedAt);
        });
      } else {
        listener = await subscribeToTrueHeading((update) => {
          if (!disposed) {
            setHeading((current) => resolveHeadingState(
              update,
              Date.now(),
              current.status,
            ));
          }
        });
      }
      if (disposed) return;

      started = true;
      const initial = await startTrueHeading({ navigationMode: mode === 'gnss' });
      if (!disposed) {
        setHeading((current) => resolveHeadingState(initial, null, current.status));
      }
    };

    lifecycleQueue.current = lifecycleQueue.current
      .catch(() => undefined)
      .then(begin)
      .catch(() => {
        if (!disposed) {
          setHeading({
            ...initialHeadingState(mode, nativeAvailable),
            status: 'unavailable',
          });
        }
      });

    return () => {
      disposed = true;
      lifecycleQueue.current = lifecycleQueue.current
        .catch(() => undefined)
        .then(async () => {
          await listener?.remove();
          if (started) await stopTrueHeading();
        });
    };
  }, [documentVisible, isActive, mode, nativeAvailable]);

  useEffect(() => {
    if (!nativeAvailable || !isActive || !documentVisible || mode !== 'gnss') return undefined;
    const timer = window.setInterval(() => {
      const currentNow = Date.now();
      setNowMs(currentNow);
      setGnssAssessment((current) => assessGnssMotion(
        gnssSampleRef.current,
        currentNow,
        true,
        { previousAssessment: current },
      ));
    }, STALE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [documentVisible, isActive, mode, nativeAvailable]);

  const gnssAgeMs = gnssSample.timestampMs === null
    ? null
    : nowMs - gnssSample.timestampMs;

  return {
    mode,
    ...heading,
    gnssSample,
    gnssAssessment,
    gnssAgeMs,
    gnssStaleAfterMs: GNSS_LOCATION_STALE_MS,
  };
};
