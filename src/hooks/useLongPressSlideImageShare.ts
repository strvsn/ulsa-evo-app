import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { isNativeSlideImageShareAvailable, shareNativeSlideImage } from '../services/nativeSlideImageShare';

export const SLIDE_IMAGE_LONG_PRESS_MS = 650;
const CANCEL_MOVE_PX = 12;
const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, ion-button, ion-segment-button, ion-select, [role="button"], [role="tab"], [contenteditable="true"]';

type TouchStart = { x: number; y: number };

export const useLongPressSlideImageShare = (isActive: boolean) => {
  const enabled = isActive && isNativeSlideImageShareAvailable();
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<TouchStart | null>(null);
  const sharingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const cancelPending = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    startRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) cancelPending();
    return cancelPending;
  }, [cancelPending, enabled]);

  const share = useCallback(async (element: HTMLElement) => {
    if (sharingRef.current) return;
    const card = element.closest<HTMLElement>('[data-slide-image-card]');
    if (!card) {
      setError('画像化するカードが見つかりません');
      return;
    }
    const rect = card.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) {
      setError('表示中のカードを画像化できません');
      return;
    }
    sharingRef.current = true;
    try {
      await shareNativeSlideImage({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '画像共有を開始できませんでした');
    } finally {
      sharingRef.current = false;
    }
  }, []);

  const onTouchStart = useCallback((event: TouchEvent<HTMLElement>) => {
    if (event.touches.length !== 1) {
      cancelPending();
      return;
    }
    if (!enabled || sharingRef.current) return;
    if (event.nativeEvent.composedPath().some((node) => node instanceof Element && node.matches(INTERACTIVE_SELECTOR))) return;
    cancelPending();
    setError(null);
    const touch = event.touches[0];
    startRef.current = { x: touch.clientX, y: touch.clientY };
    const element = event.currentTarget;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      startRef.current = null;
      void share(element);
    }, SLIDE_IMAGE_LONG_PRESS_MS);
  }, [cancelPending, enabled, share]);

  const onTouchMove = useCallback((event: TouchEvent<HTMLElement>) => {
    if (event.touches.length !== 1) {
      cancelPending();
      return;
    }
    const start = startRef.current;
    const touch = event.touches[0];
    if (!start || !touch) return;
    if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > CANCEL_MOVE_PX) {
      cancelPending();
    }
  }, [cancelPending]);

  const onContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    if (enabled) event.preventDefault();
  }, [enabled]);

  return {
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd: cancelPending,
      onTouchCancel: cancelPending,
      onContextMenu,
    },
    error,
    clearError: () => setError(null),
  };
};
