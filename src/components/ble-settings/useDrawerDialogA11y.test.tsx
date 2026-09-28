import { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDrawerDialogA11y } from './useDrawerDialogA11y';

const Harness = ({
  active,
  onDismiss,
  invalidInitialFocus = false,
}: {
  active: boolean;
  onDismiss: () => void;
  invalidInitialFocus?: boolean;
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);

  useDrawerDialogA11y({ active, panelRef, initialFocusRef, onDismiss });

  return (
    <>
      <button data-testid="outside">ドロワー外</button>
      <div ref={panelRef} data-testid="panel">
        <button
          ref={initialFocusRef}
          data-testid="initial"
          tabIndex={invalidInitialFocus ? -1 : undefined}
        >
          閉じる
        </button>
        <button data-testid="disabled" disabled>無効</button>
        <button data-testid="aria-hidden" aria-hidden="true">非表示</button>
        <button data-testid="negative-tabindex" tabIndex={-1}>Tab対象外</button>
        <div aria-hidden="true">
          <button data-testid="hidden-by-parent">親が非表示</button>
        </div>
        <button data-testid="first-setting">最初の設定</button>
        <button data-testid="last-setting">最後の設定</button>
      </div>
    </>
  );
};

describe('useDrawerDialogA11y', () => {
  let queuedFrames: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let cancelAnimationFrameMock: ReturnType<typeof vi.fn>;

  const flushAnimationFrame = () => {
    const pendingFrames = [...queuedFrames.entries()];
    queuedFrames.clear();
    act(() => {
      pendingFrames.forEach(([, callback]) => callback(16));
    });
  };

  beforeEach(() => {
    queuedFrames = new Map();
    nextFrameId = 1;
    cancelAnimationFrameMock = vi.fn((id: number) => {
      queuedFrames.delete(id);
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      queuedFrames.set(id, callback);
      return id;
    }));
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('focuses the requested control on the next frame and restores the opener on close', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();

    const { rerender } = render(<Harness active onDismiss={vi.fn()} />);
    expect(document.activeElement).toBe(opener);

    flushAnimationFrame();
    expect(document.activeElement).toBe(screen.getByTestId('initial'));

    rerender(<Harness active={false} onDismiss={vi.fn()} />);
    expect(document.activeElement).toBe(opener);
    expect(cancelAnimationFrameMock).toHaveBeenCalledTimes(1);

    opener.remove();
  });

  it('dismisses on Escape without reinstalling the listener when the callback changes', () => {
    const firstDismiss = vi.fn();
    const latestDismiss = vi.fn();
    const { rerender } = render(<Harness active onDismiss={firstDismiss} />);
    flushAnimationFrame();

    rerender(<Harness active onDismiss={latestDismiss} />);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(firstDismiss).not.toHaveBeenCalled();
    expect(latestDismiss).toHaveBeenCalledTimes(1);
  });

  it('cycles Tab and Shift+Tab inside the panel while skipping unavailable controls', () => {
    render(<Harness active onDismiss={vi.fn()} />);
    flushAnimationFrame();

    const initial = screen.getByTestId('initial');
    const last = screen.getByTestId('last-setting');

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(initial);

    initial.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    screen.getByTestId('outside').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(initial);

    screen.getByTestId('outside').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('leaves keyboard ownership to an open Ionic update modal', () => {
    const onDismiss = vi.fn();
    render(<Harness active onDismiss={onDismiss} />);
    flushAnimationFrame();
    const modal = document.createElement('ion-modal');
    modal.isOpen = true;
    document.body.append(modal);
    screen.getByTestId('outside').focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByTestId('outside')).toHaveFocus();
    modal.remove();
  });

  it('falls back to the first eligible control when the requested target has tabindex -1', () => {
    render(<Harness active onDismiss={vi.fn()} invalidInitialFocus />);
    flushAnimationFrame();

    expect(document.activeElement).toBe(screen.getByTestId('first-setting'));

    screen.getByTestId('last-setting').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByTestId('first-setting'));
  });

  it('cancels pending initial focus and leaves no keyboard handler when deactivated', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Harness active onDismiss={onDismiss} />);

    rerender(<Harness active={false} onDismiss={onDismiss} />);
    flushAnimationFrame();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(cancelAnimationFrameMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('initial')).not.toHaveFocus();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('is safe to render without browser globals', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);

    expect(() => renderToString(
      <Harness active onDismiss={vi.fn()} />
    )).not.toThrow();
  });
});
