import type { Stm32PanelMessage } from './stm32UpdatePanelHelpers';

type Props = {
  message: Stm32PanelMessage | null;
};

export const Stm32UpdateMessage = ({ message }: Props) => {
  if (!message) return null;
  return (
    <p
      className="card-log-settings-message"
      role={message.role}
      aria-live={message.role === 'alert' ? 'assertive' : 'polite'}
    >
      {message.text}
    </p>
  );
};
