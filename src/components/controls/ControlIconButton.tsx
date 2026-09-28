import { forwardRef, type ReactNode } from 'react';
import { NativeControlButton, type NativeControlButtonProps } from './NativeControlButton';

export type ControlIconButtonProps = Omit<NativeControlButtonProps, 'controlSize' | 'children'> & {
  children: ReactNode;
};

export const ControlIconButton = forwardRef<HTMLButtonElement, ControlIconButtonProps>(
  ({ children, ...props }, ref) => (
    <NativeControlButton {...props} ref={ref} controlSize="I44">
      {children}
    </NativeControlButton>
  ),
);

ControlIconButton.displayName = 'ControlIconButton';
