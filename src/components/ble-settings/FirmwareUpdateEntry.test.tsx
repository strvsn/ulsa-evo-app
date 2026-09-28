import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FirmwareUpdateEntry } from './FirmwareUpdateEntry';

const renderEntry = (target: 'ESP32' | 'STM32') => render(
  <FirmwareUpdateEntry
    target={target}
    description="更新の説明"
    releases={[]}
    selectedId={null}
    onSelect={vi.fn()}
    disabled
    busy={false}
    onOpen={vi.fn()}
    onReload={vi.fn()}
  />,
);

describe('FirmwareUpdateEntry', () => {
  it('explains the user-facing role of the STM32 module in the card heading', () => {
    renderEntry('STM32');

    expect(screen.getByText('STM32 FW更新')).toBeInTheDocument();
    expect(screen.getByText('（超音波制御モジュール）')).toBeInTheDocument();
  });

  it('does not add the STM32 module description to the ESP32 heading', () => {
    renderEntry('ESP32');

    expect(screen.getByText('ESP32 FW更新')).toBeInTheDocument();
    expect(screen.queryByText('（超音波制御モジュール）')).not.toBeInTheDocument();
  });

  it('uses an app-owned Ionic release picker instead of a native select popup', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <FirmwareUpdateEntry
        target="ESP32"
        description="更新の説明"
        releases={[
          { id: 'r1', label: 'v1.0.0 / 最新' },
          { id: 'r2', label: 'v1.1.0 / テスト版' },
        ]}
        selectedId="r1"
        onSelect={onSelect}
        disabled={false}
        busy={false}
        onOpen={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    const picker = screen.getByLabelText('ESP32の更新バージョン');
    expect(picker.tagName).toBe('ION-SELECT');
    expect(container.querySelector('select')).not.toBeInTheDocument();

    fireEvent(picker, new CustomEvent('ionChange', {
      bubbles: true,
      detail: { value: 'r2' },
    }));
    expect(onSelect).toHaveBeenCalledWith('r2');
  });

  it('keeps bilingual release notes collapsed until the user opens them', () => {
    render(
      <FirmwareUpdateEntry
        target="ESP32"
        description="更新の説明"
        releases={[{ id: 'r1', label: 'v1.0.3 / 最新' }]}
        selectedId="r1"
        selectedRelease={{ publishedAt: '2026-09-05T14:14:19.762Z', releaseNotes: {
          ja: ['日本語の変更概要'],
          en: ['English change summary'],
        } }}
        onSelect={vi.fn()}
        disabled={false}
        busy={false}
        onOpen={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    const details = screen.getByText('変更内容・更新情報').closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByText('日本語の変更概要')).toBeInTheDocument();
    expect(screen.getByText('English change summary')).toBeInTheDocument();
    expect(screen.getByText('2026/09/05')).toHaveAttribute('datetime', '2026-09-05T14:14:19.762Z');
  });

  it('shows the STM32 release date even when an older catalog has no notes', () => {
    render(
      <FirmwareUpdateEntry target="STM32" description="更新の説明"
        releases={[{ id: 'r1', label: 'v1.0.0' }]} selectedId="r1"
        selectedRelease={{ publishedAt: '2026-09-05T14:14:19.762Z' }}
        onSelect={vi.fn()} disabled={false} busy={false}
        onOpen={vi.fn()} onReload={vi.fn()} />,
    );
    expect(screen.getByText('変更内容・更新情報')).toBeInTheDocument();
    expect(screen.getByText('2026/09/05')).toBeInTheDocument();
    expect(screen.getByText('変更内容は登録されていません。')).toBeInTheDocument();
  });
});
