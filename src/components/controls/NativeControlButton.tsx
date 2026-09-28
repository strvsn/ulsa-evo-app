import { forwardRef, type ButtonHTMLAttributes } from 'react';
import {
  getControlOperationalAttributes,
  type ControlPresentationProps,
} from './controlTypes';
import './control.css';

export type NativeControlButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'disabled'
> & ControlPresentationProps & {
  disabled?: boolean;
};

export const NativeControlButton = forwardRef<HTMLButtonElement, NativeControlButtonProps>(
  ({
    className,
    controlSize,
    controlVariant = 'secondary',
    selectionState = 'off',
    tone = 'neutral',
    operationalState = { kind: 'idle' },
    disabled,
    'aria-busy': ariaBusy,
    ...buttonProps
  }, ref) => {
    const { interaction, isBusy, isDisabled, disabledReason } = getControlOperationalAttributes(
      operationalState,
      disabled,
    );

    return (
      <button
        {...buttonProps}
        ref={ref}
        type="button"
        className={['control-button', className].filter(Boolean).join(' ')}
        disabled={isDisabled || isBusy}
        aria-busy={isBusy || ariaBusy === true ? true : undefined}
        data-control-size={controlSize}
        data-control-variant={controlVariant}
        data-control-selection={selectionState}
        data-control-tone={tone}
        data-control-interaction={interaction}
        data-control-disabled-reason={disabledReason}
      />
    );
  },
);

NativeControlButton.displayName = 'NativeControlButton';
