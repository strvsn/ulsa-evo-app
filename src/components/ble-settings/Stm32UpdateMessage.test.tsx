import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stm32UpdateMessage } from './Stm32UpdateMessage';
import { stm32AlertMessage, stm32StatusMessage } from './stm32UpdatePanelHelpers';

describe('Stm32UpdateMessage', () => {
  it('announces progress and completion politely', () => {
    render(<Stm32UpdateMessage message={stm32StatusMessage('更新が完了しました')} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('announces failures assertively', () => {
    render(<Stm32UpdateMessage message={stm32AlertMessage('更新に失敗しました')} />);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  it('renders nothing when there is no message', () => {
    const { container } = render(<Stm32UpdateMessage message={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
