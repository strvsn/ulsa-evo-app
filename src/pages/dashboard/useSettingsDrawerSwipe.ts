import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import type { BLESettingsDrawerPanelGestureHandlers } from '../../components/ble-settings/types';

type DrawerGestureMode = 'opening' | 'closing';

type VelocitySample = {
  logicalX: number;
  time: number;
};

type SettingsDrawerSwipeStart = {
  pointerId: number;
  mode: DrawerGestureMode;
  logicalX: number;
  y: number;
  drawerWidth: number;
  mirrorClientX: boolean;
  viewportWidth: number;
  hasIntent: boolean;
  lastOffsetPx: number;
  samples: VelocitySample[];
} | null;

type SettingsDrawerSwipeVisualState = {
  active: boolean;
  mode: DrawerGestureMode | null;
  offsetPx: number;
  progress: number;
  transitionMs: number;
};

const IDLE_SWIPE_STATE: SettingsDrawerSwipeVisualState = {
  active: false,
  mode: null,
  offsetPx: 0,
  progress: 0,
  transitionMs: 0,
};

// iOSのシステムedge gestureと完全に重ならないよう、Ionic Menu相当の操作帯を確保する。
const SETTINGS_DRAWER_SWIPE_EDGE_PX = 50;
const SETTINGS_DRAWER_SWIPE_INTENT_PX = 10;
const SETTINGS_DRAWER_SWIPE_MIN_FLICK_DISTANCE_PX = 24;
const SETTINGS_DRAWER_SWIPE_MAX_VERTICAL_BEFORE_INTENT_PX = 32;
const SETTINGS_DRAWER_SWIPE_OPEN_PROGRESS = 0.33;
const SETTINGS_DRAWER_SWIPE_CLOSE_PROGRESS = 0.67;
const SETTINGS_DRAWER_SWIPE_VELOCITY_PX_PER_MS = 0.45;
const SETTINGS_DRAWER_SWIPE_HORIZONTAL_INTENT_RATIO = 1.25;
const SETTINGS_DRAWER_PROJECTED_TIME_MS = 150;
const SETTINGS_DRAWER_VELOCITY_WINDOW_MS = 110;
const SETTINGS_DRAWER_SETTLE_MIN_MS = 150;
const SETTINGS_DRAWER_SETTLE_MAX_MS = 260;
const SETTINGS_DRAWER_REDUCED_SETTLE_MS = 60;
const SETTINGS_DRAWER_PROGRAMMATIC_MS = 220;
const SETTINGS_DRAWER_MOBILE_BREAKPOINT_PX = 700;
const SETTINGS_DRAWER_WIDTH_FRACTION = 0.94;
const SETTINGS_DRAWER_MAX_WIDTH_PX = 840;
const SETTINGS_DRAWER_SWIPE_IGNORE_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'summary',
  'ion-button',
  'ion-input',
  'ion-range',
  'ion-select',
  'ion-segment-button',
  '[role="button"]',
  '[data-drawer-swipe-ignore]',
  '.carousel-nav',
  '.carousel-pagination',
].join(',');

const shouldIgnoreSettingsDrawerSwipe = (target: EventTarget | null): boolean =>
  target instanceof Element && Boolean(target.closest(SETTINGS_DRAWER_SWIPE_IGNORE_SELECTOR));

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getEventPointerId = (event: PointerEvent<HTMLElement>) =>
  typeof event.pointerId === 'number' ? event.pointerId : 1;

const getViewportWidth = () => typeof window === 'undefined' ? 390 : window.innerWidth;

const getLogicalPointerX = (clientX: number, mirrorClientX: boolean, viewportWidth: number) =>
  mirrorClientX ? viewportWidth - clientX : clientX;

const getDrawerWidth = (viewportWidth: number) => viewportWidth <= SETTINGS_DRAWER_MOBILE_BREAKPOINT_PX
  ? viewportWidth
  : Math.min(viewportWidth * SETTINGS_DRAWER_WIDTH_FRACTION, SETTINGS_DRAWER_MAX_WIDTH_PX);

const prefersReducedMotion = () => typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const getSettlingDurationMs = (distancePx: number, velocityX: number) => {
  if (prefersReducedMotion()) return SETTINGS_DRAWER_REDUCED_SETTLE_MS;
  const velocity = Math.max(Math.abs(velocityX), 0.35);
  return Math.round(clamp(distancePx / velocity, SETTINGS_DRAWER_SETTLE_MIN_MS, SETTINGS_DRAWER_SETTLE_MAX_MS));
};

const getProgrammaticDurationMs = () => prefersReducedMotion()
  ? SETTINGS_DRAWER_REDUCED_SETTLE_MS
  : SETTINGS_DRAWER_PROGRAMMATIC_MS;

const appendVelocitySample = (
  samples: VelocitySample[],
  logicalX: number,
  time: number,
): VelocitySample[] => {
  const next = [...samples, { logicalX, time }];
  const cutoff = time - SETTINGS_DRAWER_VELOCITY_WINDOW_MS;
  return next.filter((sample, index) => index === next.length - 1 || sample.time >= cutoff);
};

const getReleaseVelocity = (samples: VelocitySample[]): number => {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsedMs = last.time - first.time;
  return elapsedMs >= 8 ? (last.logicalX - first.logicalX) / elapsedMs : 0;
};

export const useSettingsDrawerSwipe = ({
  enabled,
  isOpen,
  isUpsideDown,
  onOpen,
  onClose,
}: {
  enabled: boolean;
  isOpen: boolean;
  isUpsideDown: boolean;
  onOpen: () => void;
  onClose: () => void;
}) => {
  const swipeStartRef = useRef<SettingsDrawerSwipeStart>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pendingVisualStateRef = useRef<SettingsDrawerSwipeVisualState | null>(null);
  const enabledRef = useRef(enabled);
  const isOpenRef = useRef(isOpen);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const [swipeState, setSwipeState] = useState<SettingsDrawerSwipeVisualState>(IDLE_SWIPE_STATE);

  enabledRef.current = enabled;
  isOpenRef.current = isOpen;
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current === null) return;
    clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  }, []);

  const clearAnimationFrame = useCallback(() => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    pendingVisualStateRef.current = null;
  }, []);

  const resetSwipe = useCallback(() => {
    clearSettleTimer();
    clearAnimationFrame();
    swipeStartRef.current = null;
    setSwipeState(IDLE_SWIPE_STATE);
  }, [clearAnimationFrame, clearSettleTimer]);

  const scheduleVisualState = useCallback((nextState: SettingsDrawerSwipeVisualState) => {
    pendingVisualStateRef.current = nextState;
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const pendingState = pendingVisualStateRef.current;
      pendingVisualStateRef.current = null;
      if (pendingState) setSwipeState(pendingState);
    });
  }, []);

  const releasePointerCapture = useCallback((event: PointerEvent<HTMLElement>, pointerId: number) => {
    if (event.currentTarget.hasPointerCapture?.(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId);
    }
  }, []);

  const cancelCandidate = useCallback((event?: PointerEvent<HTMLElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (event && start) releasePointerCapture(event, start.pointerId);
    if (start?.hasIntent) resetSwipe();
  }, [releasePointerCapture, resetSwipe]);

  const beginGesture = useCallback((event: PointerEvent<HTMLElement>, mode: DrawerGestureMode) => {
    if (swipeStartRef.current || swipeState.active) return;
    if (event.isPrimary === false) return;
    if (event.pointerType === 'mouse' && event.buttons !== 1) return;
    if (shouldIgnoreSettingsDrawerSwipe(event.target)) return;
    if (mode === 'opening' && (!enabled || isOpen)) return;
    if (mode === 'closing' && !isOpen) return;

    const viewportWidth = getViewportWidth();
    const logicalX = getLogicalPointerX(event.clientX, isUpsideDown, viewportWidth);
    if (mode === 'opening' && logicalX > SETTINGS_DRAWER_SWIPE_EDGE_PX) return;

    clearSettleTimer();
    const measuredWidth = mode === 'closing'
      ? event.currentTarget.getBoundingClientRect?.().width
      : 0;
    const drawerWidth = measuredWidth > 0 ? measuredWidth : getDrawerWidth(viewportWidth);
    swipeStartRef.current = {
      pointerId: getEventPointerId(event),
      mode,
      logicalX,
      y: event.clientY,
      drawerWidth,
      mirrorClientX: isUpsideDown,
      viewportWidth,
      hasIntent: false,
      lastOffsetPx: mode === 'opening' ? 0 : drawerWidth,
      samples: [{ logicalX, time: event.timeStamp }],
    };
  }, [clearSettleTimer, enabled, isOpen, isUpsideDown, swipeState.active]);

  const handleSwipeMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const start = swipeStartRef.current;
    if (!start || start.pointerId !== getEventPointerId(event)) return;

    const logicalX = getLogicalPointerX(event.clientX, start.mirrorClientX, start.viewportWidth);
    const deltaX = logicalX - start.logicalX;
    const directionalTravel = start.mode === 'opening' ? deltaX : -deltaX;
    const deltaY = Math.abs(event.clientY - start.y);
    const absDeltaX = Math.abs(deltaX);

    if (!start.hasIntent) {
      if (
        directionalTravel < -SETTINGS_DRAWER_SWIPE_INTENT_PX
        || (deltaY > SETTINGS_DRAWER_SWIPE_MAX_VERTICAL_BEFORE_INTENT_PX && deltaY > absDeltaX)
      ) {
        cancelCandidate(event);
        return;
      }

      if (
        directionalTravel < SETTINGS_DRAWER_SWIPE_INTENT_PX
        || absDeltaX < deltaY * SETTINGS_DRAWER_SWIPE_HORIZONTAL_INTENT_RATIO
      ) {
        return;
      }

      start.hasIntent = true;
      event.currentTarget.setPointerCapture?.(start.pointerId);
    }

    event.preventDefault();
    const offsetPx = clamp(
      (start.mode === 'opening' ? 0 : start.drawerWidth) + deltaX,
      0,
      start.drawerWidth,
    );
    start.lastOffsetPx = offsetPx;
    start.samples = appendVelocitySample(start.samples, logicalX, event.timeStamp);
    scheduleVisualState({
      active: true,
      mode: start.mode,
      offsetPx,
      progress: offsetPx / start.drawerWidth,
      transitionMs: 0,
    });
  }, [cancelCandidate, scheduleVisualState]);

  const finishSettling = useCallback((targetOpen: boolean, transitionMs: number) => {
    clearSettleTimer();
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      setSwipeState(IDLE_SWIPE_STATE);
      if (targetOpen) {
        if (enabledRef.current && !isOpenRef.current) onOpenRef.current();
      } else if (isOpenRef.current) {
        onCloseRef.current();
      }
    }, transitionMs);
  }, [clearSettleTimer]);

  const settleSwipe = useCallback((event: PointerEvent<HTMLElement>, cancelled = false) => {
    const start = swipeStartRef.current;
    if (!start || start.pointerId !== getEventPointerId(event)) return;

    swipeStartRef.current = null;
    releasePointerCapture(event, start.pointerId);
    if (!start.hasIntent) return;

    clearAnimationFrame();
    const logicalX = getLogicalPointerX(event.clientX, start.mirrorClientX, start.viewportWidth);
    if (!cancelled) {
      start.samples = appendVelocitySample(start.samples, logicalX, event.timeStamp);
      start.lastOffsetPx = clamp(
        (start.mode === 'opening' ? 0 : start.drawerWidth) + logicalX - start.logicalX,
        0,
        start.drawerWidth,
      );
    }

    const releaseVelocityX = cancelled ? 0 : getReleaseVelocity(start.samples);
    const projectedOffsetPx = clamp(
      start.lastOffsetPx + releaseVelocityX * SETTINGS_DRAWER_PROJECTED_TIME_MS,
      0,
      start.drawerWidth,
    );
    const currentProgress = start.lastOffsetPx / start.drawerWidth;
    const projectedProgress = projectedOffsetPx / start.drawerWidth;
    const movedPx = start.mode === 'opening'
      ? start.lastOffsetPx
      : start.drawerWidth - start.lastOffsetPx;

    const targetOpen = start.mode === 'opening'
      ? cancelled
        ? currentProgress >= SETTINGS_DRAWER_SWIPE_OPEN_PROGRESS
        : movedPx >= SETTINGS_DRAWER_SWIPE_MIN_FLICK_DISTANCE_PX && (
            projectedProgress >= SETTINGS_DRAWER_SWIPE_OPEN_PROGRESS
            || releaseVelocityX >= SETTINGS_DRAWER_SWIPE_VELOCITY_PX_PER_MS
          )
      : cancelled
        ? currentProgress > SETTINGS_DRAWER_SWIPE_CLOSE_PROGRESS
        : !(movedPx >= SETTINGS_DRAWER_SWIPE_MIN_FLICK_DISTANCE_PX && (
            projectedProgress <= SETTINGS_DRAWER_SWIPE_CLOSE_PROGRESS
            || releaseVelocityX <= -SETTINGS_DRAWER_SWIPE_VELOCITY_PX_PER_MS
          ));

    const targetOffsetPx = targetOpen ? start.drawerWidth : 0;
    const transitionMs = getSettlingDurationMs(
      Math.abs(targetOffsetPx - start.lastOffsetPx),
      releaseVelocityX,
    );
    setSwipeState({
      active: true,
      mode: start.mode,
      offsetPx: targetOffsetPx,
      progress: targetOpen ? 1 : 0,
      transitionMs,
    });

    const returnedToOrigin = start.mode === 'opening' ? !targetOpen : targetOpen;
    if (returnedToOrigin) {
      clearSettleTimer();
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        setSwipeState(IDLE_SWIPE_STATE);
      }, transitionMs);
      return;
    }
    finishSettling(targetOpen, transitionMs);
  }, [clearAnimationFrame, clearSettleTimer, finishSettling, releasePointerCapture]);

  const handleSwipeCancel = useCallback((event: PointerEvent<HTMLElement>) => {
    settleSwipe(event, true);
  }, [settleSwipe]);

  const runProgrammaticTransition = useCallback((targetOpen: boolean) => {
    if (swipeStartRef.current || swipeState.active) return;
    if (targetOpen ? (!enabled || isOpen) : !isOpen) return;

    clearSettleTimer();
    clearAnimationFrame();
    const drawerWidth = getDrawerWidth(getViewportWidth());
    const initialOffsetPx = targetOpen ? 0 : drawerWidth;
    setSwipeState({
      active: true,
      mode: targetOpen ? 'opening' : 'closing',
      offsetPx: initialOffsetPx,
      progress: targetOpen ? 0 : 1,
      transitionMs: 0,
    });

    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const transitionMs = getProgrammaticDurationMs();
      setSwipeState({
        active: true,
        mode: targetOpen ? 'opening' : 'closing',
        offsetPx: targetOpen ? drawerWidth : 0,
        progress: targetOpen ? 1 : 0,
        transitionMs,
      });
      finishSettling(targetOpen, transitionMs);
    });
  }, [clearAnimationFrame, clearSettleTimer, enabled, finishSettling, isOpen, swipeState.active]);

  const requestOpen = useCallback(() => runProgrammaticTransition(true), [runProgrammaticTransition]);
  const requestClose = useCallback(() => runProgrammaticTransition(false), [runProgrammaticTransition]);

  useEffect(() => {
    if ((!enabled && !isOpen) || (isOpen && swipeState.mode === 'opening')) resetSwipe();
  }, [enabled, isOpen, resetSwipe, swipeState.mode]);

  useEffect(() => {
    const abortUnfinishedGesture = () => resetSwipe();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') abortUnfinishedGesture();
    };
    window.addEventListener('blur', abortUnfinishedGesture);
    window.addEventListener('resize', abortUnfinishedGesture);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', abortUnfinishedGesture);
      window.removeEventListener('resize', abortUnfinishedGesture);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [resetSwipe]);

  useEffect(() => () => {
    clearSettleTimer();
    clearAnimationFrame();
    swipeStartRef.current = null;
  }, [clearAnimationFrame, clearSettleTimer]);

  return {
    openHandlers: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => beginGesture(event, 'opening'),
      onPointerMove: handleSwipeMove,
      onPointerUp: settleSwipe,
      onPointerCancel: handleSwipeCancel,
      onLostPointerCapture: handleSwipeCancel,
    },
    panelHandlers: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => beginGesture(event, 'closing'),
      onPointerMove: handleSwipeMove,
      onPointerUp: settleSwipe,
      onPointerCancel: handleSwipeCancel,
      onLostPointerCapture: handleSwipeCancel,
    } satisfies BLESettingsDrawerPanelGestureHandlers,
    requestOpen,
    requestClose,
    isPresented: isOpen || swipeState.active,
    isInteracting: swipeState.active,
    interactionMode: swipeState.mode,
    progress: swipeState.active ? swipeState.progress : isOpen ? 1 : 0,
    offsetPx: swipeState.active ? swipeState.offsetPx : isOpen ? getDrawerWidth(getViewportWidth()) : 0,
    transitionMs: swipeState.transitionMs,
  };
};
