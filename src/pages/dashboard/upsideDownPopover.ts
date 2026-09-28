type PopoverPositionTarget = {
  getBoundingClientRect: () => DOMRect;
};
type PopoverEventDetail = {
  ionShadowTarget?: PopoverPositionTarget;
};

const isEventDetail = (value: unknown): value is PopoverEventDetail => (
  typeof value === 'object' && value !== null
);

const makeRect = (left: number, top: number, width: number, height: number): DOMRect => {
  if (typeof DOMRect !== 'undefined') return new DOMRect(left, top, width, height);
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({ left, top, right: left + width, bottom: top + height, width, height }),
  } as DOMRect;
};

export const createUpsideDownPopoverEvent = (
  event: Event,
  viewportWidth: number,
  viewportHeight: number,
): Event | null => {
  const detail = 'detail' in event && isEventDetail(event.detail) ? event.detail : null;
  const target = detail?.ionShadowTarget;
  if (!target) return null;

  const rect = target.getBoundingClientRect();
  const correctedRect = makeRect(
    viewportWidth - rect.right,
    viewportHeight - rect.bottom,
    rect.width,
    rect.height,
  );
  const correctedTarget: PopoverPositionTarget = {
    getBoundingClientRect: () => correctedRect,
  };
  return new CustomEvent('ulsaUpsideDownPopoverPosition', {
    detail: { ...detail, ionShadowTarget: correctedTarget },
  });
};
