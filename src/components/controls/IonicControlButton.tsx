import { IonButton, IonSegmentButton } from '@ionic/react';
import { forwardRef, type ComponentProps } from 'react';
import {
  getControlOperationalAttributes,
  type ControlPresentationProps,
} from './controlTypes';
import './control.css';

type IonicControlProps = ControlPresentationProps & {
  disabled?: boolean;
};

export type IonicControlButtonProps = Omit<
  ComponentProps<typeof IonButton>,
  'disabled'
> & IonicControlProps;

export const IonicControlButton = forwardRef<HTMLIonButtonElement, IonicControlButtonProps>(
  ({
    className,
    controlSize,
    controlVariant = 'secondary',
    selectionState = 'off',
    tone = 'neutral',
    operationalState = { kind: 'idle' },
    disabled,
    onClick,
    ...props
  }, ref) => {
    const { interaction, isBusy, isDisabled, disabledReason } = getControlOperationalAttributes(
      operationalState,
      disabled,
    );

    return (
      <IonButton
        {...props}
        ref={ref}
        className={['control-button', className].filter(Boolean).join(' ')}
        disabled={isDisabled || isBusy}
        onClick={(event) => {
          if (isDisabled || isBusy) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          onClick?.(event);
        }}
        aria-busy={isBusy ? 'true' : undefined}
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

IonicControlButton.displayName = 'IonicControlButton';

export type IonicControlSegmentButtonProps = ComponentProps<typeof IonSegmentButton>
  & Omit<IonicControlProps, 'disabled'>;

export const IonicControlSegmentButton = forwardRef<
  HTMLIonSegmentButtonElement,
  IonicControlSegmentButtonProps
>(({
  className,
  controlSize,
  controlVariant = 'secondary',
  selectionState = 'off',
  tone = 'neutral',
  operationalState = { kind: 'idle' },
  disabled,
  onClick,
  ...props
}, ref) => {
  const { interaction, isBusy, isDisabled, disabledReason } = getControlOperationalAttributes(
    operationalState,
    disabled,
  );

  return (
    <IonSegmentButton
      {...props}
        ref={ref}
        className={['control-button', className].filter(Boolean).join(' ')}
        disabled={isDisabled || isBusy}
        onClick={(event) => {
          if (isDisabled || isBusy) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          onClick?.(event);
        }}
        aria-busy={isBusy ? 'true' : undefined}
      data-control-size={controlSize}
      data-control-variant={controlVariant}
      data-control-selection={selectionState}
        data-control-tone={tone}
        data-control-interaction={interaction}
        data-control-disabled-reason={disabledReason}
    />
  );
});

IonicControlSegmentButton.displayName = 'IonicControlSegmentButton';
