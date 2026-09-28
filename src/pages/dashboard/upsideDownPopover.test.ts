import { describe, expect, it } from 'vitest';
import { createUpsideDownPopoverEvent } from './upsideDownPopover';

describe('upside-down popover positioning', () => {
  it('converts the transformed trigger rectangle back to viewport coordinates', () => {
    const event = new CustomEvent('ionPopoverWillPresent', {
      detail: {
        ionShadowTarget: {
          getBoundingClientRect: () => ({
            left: 420,
            top: 760,
            right: 580,
            bottom: 820,
            width: 160,
            height: 60,
          } as DOMRect),
        },
      },
    });

    const corrected = createUpsideDownPopoverEvent(event, 600, 1000);
    const target = (corrected as CustomEvent).detail.ionShadowTarget;
    expect(target.getBoundingClientRect()).toMatchObject({
      left: 20,
      top: 180,
      right: 180,
      bottom: 240,
      width: 160,
      height: 60,
    });
  });

  it('does not alter popovers without an Ionic shadow target', () => {
    expect(createUpsideDownPopoverEvent(new Event('ionPopoverWillPresent'), 600, 1000)).toBeNull();
  });
});
