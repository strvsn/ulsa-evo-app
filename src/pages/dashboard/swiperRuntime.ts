import type { Swiper } from 'swiper';

export const updateCarouselAutoHeight = (swiper: Swiper): void => {
  // App tests can render Swiper before its core params are initialized. The
  // browser instance reaches this state before the first animation frame.
  if (swiper.destroyed || !swiper.params) return;
  swiper.updateAutoHeight(0);
};

export const updateSwiperTouchRatio = (
  swiper: Swiper | null,
  touchRatio: number,
): void => {
  if (!swiper || swiper.destroyed) return;
  // Updating an orientation-dependent React key remounts stateful slides.
  // Swiper reads this live param for every pointer move, so mutate it in place.
  swiper.params.touchRatio = touchRatio;
  swiper.originalParams.touchRatio = touchRatio;
};
