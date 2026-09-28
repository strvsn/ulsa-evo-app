import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LEDWindReactiveTheme } from '../../types/ble';
import { AppearancePanel } from './AppearancePanel';
import { LedWindReactiveThemeSelector } from './LedWindReactiveThemeSelector';

const AppearanceHarness = () => {
  const [themeIndex, setThemeIndex] = useState(4);
  return <AppearancePanel currentThemeIndex={themeIndex} onThemeChange={setThemeIndex} />;
};

const LedThemeHarness = ({ disabled = false }: { disabled?: boolean }) => {
  const [theme, setTheme] = useState<LEDWindReactiveTheme>('tide');
  return (
    <LedWindReactiveThemeSelector
      value={theme}
      disabled={disabled}
      onChange={setTheme}
    />
  );
};

const expectSingleTabStop = (group: HTMLElement, expected: HTMLElement) => {
  const radios = within(group).getAllByRole('radio');
  expect(radios.filter((radio) => radio.tabIndex === 0)).toEqual([expected]);
  expect(expected).toHaveAttribute('aria-checked', 'true');
};

describe('button radiogroup keyboard navigation', () => {
  it('uses arrow keys with wrapping plus Home and End for appearance themes', () => {
    render(<AppearanceHarness />);

    const group = screen.getByRole('radiogroup', { name: '画面テーマ' });
    const slate = within(group).getByRole('radio', { name: /ULSA Slate/ });
    const graphite = within(group).getByRole('radio', { name: /ULSA Graphite/ });
    const light = within(group).getByRole('radio', { name: /ULSA Light/ });

    expectSingleTabStop(group, slate);
    slate.focus();

    fireEvent.keyDown(slate, { key: 'ArrowRight' });
    expect(graphite).toHaveFocus();
    expectSingleTabStop(group, graphite);

    fireEvent.keyDown(graphite, { key: 'ArrowDown' });
    expect(light).toHaveFocus();
    expectSingleTabStop(group, light);

    fireEvent.keyDown(light, { key: 'ArrowRight' });
    expect(slate).toHaveFocus();

    fireEvent.keyDown(slate, { key: 'ArrowLeft' });
    expect(light).toHaveFocus();

    fireEvent.keyDown(light, { key: 'ArrowUp' });
    expect(graphite).toHaveFocus();

    fireEvent.keyDown(graphite, { key: 'Home' });
    expect(slate).toHaveFocus();
    expectSingleTabStop(group, slate);

    fireEvent.keyDown(slate, { key: 'End' });
    expect(light).toHaveFocus();
    expectSingleTabStop(group, light);
  });

  it('uses the same roving behavior for LED themes', () => {
    render(<LedThemeHarness />);

    const group = screen.getByRole('radiogroup', { name: '風速連動LEDカラーテーマ' });
    const tide = within(group).getByRole('radio', { name: 'Tide' });
    const ember = within(group).getByRole('radio', { name: 'Ember' });
    const aurora = within(group).getByRole('radio', { name: 'Aurora' });

    expectSingleTabStop(group, tide);
    tide.focus();

    fireEvent.keyDown(tide, { key: 'ArrowLeft' });
    expect(aurora).toHaveFocus();
    expectSingleTabStop(group, aurora);

    fireEvent.keyDown(aurora, { key: 'ArrowUp' });
    expect(ember).toHaveFocus();

    fireEvent.keyDown(ember, { key: 'ArrowDown' });
    expect(aurora).toHaveFocus();

    fireEvent.keyDown(aurora, { key: 'ArrowRight' });
    expect(tide).toHaveFocus();

    fireEvent.keyDown(tide, { key: 'End' });
    expect(aurora).toHaveFocus();
    expectSingleTabStop(group, aurora);

    fireEvent.keyDown(aurora, { key: 'Home' });
    expect(tide).toHaveFocus();
    expectSingleTabStop(group, tide);
  });

  it('removes disabled LED themes from the tab sequence and ignores navigation', () => {
    render(<LedThemeHarness disabled />);

    const group = screen.getByRole('radiogroup', { name: '風速連動LEDカラーテーマ' });
    const radios = within(group).getAllByRole('radio');
    const tide = within(group).getByRole('radio', { name: 'Tide' });

    radios.forEach((radio) => {
      expect(radio).toBeDisabled();
      expect(radio).toHaveAttribute('tabindex', '-1');
    });

    fireEvent.keyDown(tide, { key: 'End' });
    expect(tide).toHaveAttribute('aria-checked', 'true');
    expect(radios.every((radio) => radio.tabIndex === -1)).toBe(true);
  });
});
