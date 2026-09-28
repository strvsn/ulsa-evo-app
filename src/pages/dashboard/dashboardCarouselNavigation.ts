import {
  CHART_SLIDE_INDEX,
  WIND_ROSE_SLIDE_INDEX,
} from './dashboardSensorBoundary';

type CarouselController = {
  activeIndex: number;
  destroyed: boolean;
  slideTo: (index: number) => unknown;
};

export const moveDashboardCarousel = (
  swiper: CarouselController | null,
  offset: -1 | 1,
): boolean => {
  if (!swiper || swiper.destroyed) return false;
  const targetIndex = Math.max(
    WIND_ROSE_SLIDE_INDEX,
    Math.min(CHART_SLIDE_INDEX, swiper.activeIndex + offset),
  );
  if (targetIndex === swiper.activeIndex) return false;
  swiper.slideTo(targetIndex);
  return true;
};
