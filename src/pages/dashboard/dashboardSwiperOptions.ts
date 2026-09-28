import { A11y, Keyboard, Navigation, Pagination } from 'swiper/modules';

export const DASHBOARD_SWIPER_MODULES = [Pagination, Navigation, A11y, Keyboard];

export const DASHBOARD_SWIPER_KEYBOARD = {
  enabled: true,
  onlyInViewport: true,
  pageUpDown: false,
};

export const DASHBOARD_SWIPER_A11Y = {
  enabled: true,
  containerRole: 'region',
  containerRoleDescriptionMessage: 'カルーセル',
  containerMessage: '計測表示カルーセル',
  itemRoleDescriptionMessage: 'スライド',
  slideRole: 'group',
  slideLabelMessage: '{{slidesLength}}枚中{{index}}枚目',
  paginationBulletMessage: '{{index}}枚目のスライドを表示',
  prevSlideMessage: '前のスライドを表示',
  nextSlideMessage: '次のスライドを表示',
  firstSlideMessage: '最初のスライドです',
  lastSlideMessage: '最後のスライドです',
};
