import { describe, expect, it, vi } from 'vitest';
import { moveDashboardCarousel } from './dashboardCarouselNavigation';

describe('moveDashboardCarousel', () => {
  it('moves exactly one slide and refuses missing, destroyed, or boundary controllers', () => {
    expect(moveDashboardCarousel(null, 1)).toBe(false);
    const swiper = { activeIndex: 0, destroyed: false, slideTo: vi.fn() };
    expect(moveDashboardCarousel(swiper, 1)).toBe(true);
    expect(swiper.slideTo).toHaveBeenCalledWith(1);
    expect(moveDashboardCarousel(swiper, -1)).toBe(false);
    swiper.destroyed = true;
    expect(moveDashboardCarousel(swiper, 1)).toBe(false);
  });
});
