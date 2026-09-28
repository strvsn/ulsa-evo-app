export type ControlSize = 'I44' | 'C36' | 'M44' | 'L48' | 'R56' | 'S80';

export type ControlVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export type ControlSelectionState = 'off' | 'on';

export type ControlTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export type ControlOperationalState =
  | { kind: 'idle' }
  | { kind: 'busy'; message?: string }
  | { kind: 'disabled'; reason?: string };

export interface ControlPresentationProps {
  controlSize: ControlSize;
  controlVariant?: ControlVariant;
  selectionState?: ControlSelectionState;
  tone?: ControlTone;
  operationalState?: ControlOperationalState;
}

type ControlOperationalStateInput = {
  busy?: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

/**
 * Keep the interaction state explicit at call sites without letting an
 * underlying `disabled` attribute erase the distinction between unavailable
 * and currently-processing controls.
 */
export const getControlOperationalState = ({
  busy = false,
  disabled = false,
  disabledReason,
}: ControlOperationalStateInput = {}): ControlOperationalState => {
  if (busy) return { kind: 'busy' };
  if (disabled) return { kind: 'disabled', reason: disabledReason };
  return { kind: 'idle' };
};

export const getControlOperationalAttributes = (
  operationalState: ControlOperationalState | undefined,
  disabled: boolean | undefined,
) => {
  const isBusy = operationalState?.kind === 'busy';
  const isDisabled = disabled === true || operationalState?.kind === 'disabled';

  return {
    isBusy,
    isDisabled,
    interaction: isBusy ? 'busy' : isDisabled ? 'disabled' : 'idle',
    disabledReason: operationalState?.kind === 'disabled'
      ? operationalState.reason
      : undefined,
  };
};
