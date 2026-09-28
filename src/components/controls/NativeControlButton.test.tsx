import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NativeControlButton } from './NativeControlButton';

describe('NativeControlButton', () => {
  it('uses the shared I44 contract while preserving native button behavior and refs', () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <NativeControlButton
        ref={ref}
        controlSize="I44"
        controlVariant="ghost"
        selectionState="on"
        tone="accent"
        aria-label="設定を開く"
        onClick={onClick}
      >
        menu
      </NativeControlButton>,
    );

    const button = screen.getByRole('button', { name: '設定を開く' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-control-size', 'I44');
    expect(button).toHaveAttribute('data-control-variant', 'ghost');
    expect(button).toHaveAttribute('data-control-selection', 'on');
    expect(button).toHaveAttribute('data-control-tone', 'accent');
    expect(button).toHaveAttribute('data-control-interaction', 'idle');
    expect(ref.current).toBe(button);

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps busy and disabled semantics distinct', () => {
    const { rerender } = render(
      <NativeControlButton
        controlSize="I44"
        aria-label="保存"
        operationalState={{ kind: 'busy' }}
      >
        save
      </NativeControlButton>,
    );

    const button = screen.getByRole('button', { name: '保存' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-control-interaction', 'busy');

    rerender(
      <NativeControlButton
        controlSize="I44"
        aria-label="保存"
        operationalState={{ kind: 'disabled', reason: '計測値待機中' }}
      >
        save
      </NativeControlButton>,
    );

    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button).toHaveAttribute('data-control-interaction', 'disabled');
    expect(button).toHaveAttribute('data-control-disabled-reason', '計測値待機中');

    rerender(
      <NativeControlButton
        controlSize="I44"
        aria-label="保存"
        disabled
      >
        save
      </NativeControlButton>,
    );

    expect(button).toHaveAttribute('data-control-interaction', 'disabled');
  });
});
