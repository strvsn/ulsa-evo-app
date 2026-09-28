import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'iframe',
  'object',
  'embed',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',');

type DrawerDialogA11yOptions = {
  active: boolean;
  panelRef: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
};

const isFocusable = (element: HTMLElement): boolean => {
  if (element.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
  if (element.tabIndex < 0) return false;
  if (element.matches(':disabled')) return false;
  return true;
};

const getFocusableElements = (panel: HTMLElement): HTMLElement[] =>
  Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(isFocusable);

const focusWithoutScrolling = (element: HTMLElement) => {
  try {
    element.focus({ preventScroll: true });
  } catch {
    // Older WebViews do not accept FocusOptions.
    element.focus();
  }
};

/**
 * Applies dialog keyboard semantics to a settings drawer without owning its UI.
 * The caller remains responsible for dialog roles, labels and visual state.
 */
export const useDrawerDialogA11y = ({
  active,
  panelRef,
  initialFocusRef,
  onDismiss,
}: DrawerDialogA11yOptions): void => {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!active || typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const animationFrameId = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;

      const requestedInitialFocus = initialFocusRef.current;
      const focusTarget = requestedInitialFocus
        && panel.contains(requestedInitialFocus)
        && isFocusable(requestedInitialFocus)
        ? requestedInitialFocus
        : getFocusableElements(panel)[0];

      if (focusTarget) focusWithoutScrolling(focusTarget);
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ionic owns the focus trap and Escape dismissal for a presented modal.
      // Do not unmount the underlying OTA controller while that modal is active.
      if (Array.from(document.querySelectorAll('ion-modal')).some((modal) => modal.isOpen)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismissRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      // Recompute on each key press because drawer controls can become enabled,
      // disabled or hidden while device settings are loading.
      const focusableElements = getFocusableElements(panel);
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const activeIndex = activeElement instanceof HTMLElement
        ? focusableElements.indexOf(activeElement)
        : -1;

      if (event.shiftKey && (activeIndex <= 0)) {
        event.preventDefault();
        focusWithoutScrolling(lastFocusable);
      } else if (!event.shiftKey && (activeIndex === -1 || activeElement === lastFocusable)) {
        event.preventDefault();
        focusWithoutScrolling(firstFocusable);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      document.removeEventListener('keydown', handleKeyDown);

      if (previouslyFocused?.isConnected) {
        focusWithoutScrolling(previouslyFocused);
      }
    };
  }, [active, initialFocusRef, panelRef]);
};

export default useDrawerDialogA11y;
