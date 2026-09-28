import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLongPressSlideImageShare, SLIDE_IMAGE_LONG_PRESS_MS } from './useLongPressSlideImageShare';
import { shareNativeSlideImage } from '../services/nativeSlideImageShare';

vi.mock('../services/nativeSlideImageShare', () => ({
  isNativeSlideImageShareAvailable: () => true,
  shareNativeSlideImage: vi.fn().mockResolvedValue({ completed: true }),
}));

const Target = ({ active = true }: { active?: boolean }) => {
  const imageShare = useLongPressSlideImageShare(active);
  return (
    <div data-slide-image-card data-testid="image-card">
      <div data-testid="image-target" {...imageShare.handlers}>
        <span>グラフ</span>
        <button type="button">単位</button>
        {imageShare.error && <span role="alert">{imageShare.error}</span>}
      </div>
    </div>
  );
};

const touch = (x: number, y: number) => ({ clientX: x, clientY: y });

describe('slide image long press', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(shareNativeSlideImage).mockClear();
  });

  afterEach(() => vi.useRealTimers());

  it('shares the visual target after a stationary long press', async () => {
    render(<Target />);
    const target = screen.getByTestId('image-target');
    vi.spyOn(screen.getByTestId('image-card'), 'getBoundingClientRect').mockReturnValue({
      x: 12, y: 34, width: 280, height: 240,
    } as DOMRect);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      x: 48, y: 96, width: 200, height: 100,
    } as DOMRect);

    fireEvent.touchStart(target, { touches: [touch(100, 100)] });
    act(() => vi.advanceTimersByTime(SLIDE_IMAGE_LONG_PRESS_MS - 1));
    expect(shareNativeSlideImage).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(shareNativeSlideImage).toHaveBeenCalledWith({ x: 12, y: 34, width: 280, height: 240 });
  });

  it('does not capture a swipe or a control long press', () => {
    render(<Target />);
    const target = screen.getByTestId('image-target');
    fireEvent.touchStart(target, { touches: [touch(100, 100)] });
    fireEvent.touchMove(target, { touches: [touch(115, 100)] });
    act(() => vi.advanceTimersByTime(SLIDE_IMAGE_LONG_PRESS_MS));

    fireEvent.touchStart(screen.getByRole('button', { name: '単位' }), { touches: [touch(100, 100)] });
    act(() => vi.advanceTimersByTime(SLIDE_IMAGE_LONG_PRESS_MS));
    expect(shareNativeSlideImage).not.toHaveBeenCalled();
  });

  it('cancels a pending capture when a second finger joins', () => {
    render(<Target />);
    const target = screen.getByTestId('image-target');
    fireEvent.touchStart(target, { touches: [touch(100, 100)] });
    fireEvent.touchStart(target, { touches: [touch(100, 100), touch(130, 100)] });
    act(() => vi.advanceTimersByTime(SLIDE_IMAGE_LONG_PRESS_MS));
    expect(shareNativeSlideImage).not.toHaveBeenCalled();
  });

  it('does not capture an inactive carousel slide', () => {
    render(<Target active={false} />);
    fireEvent.touchStart(screen.getByTestId('image-target'), { touches: [touch(100, 100)] });
    act(() => vi.advanceTimersByTime(SLIDE_IMAGE_LONG_PRESS_MS));
    expect(shareNativeSlideImage).not.toHaveBeenCalled();
  });
});
