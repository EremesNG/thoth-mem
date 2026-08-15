import { describe, expect, it } from 'vitest';

import { placeGuidedSelect } from '../../dashboard/src/components/guided-select-position.js';

const viewport = { offsetLeft: 0, offsetTop: 0, width: 1_000, height: 800 };

describe('guided selector top-layer placement', () => {
  it('aligns to the trigger start edge when there is room below', () => {
    expect(placeGuidedSelect({
      trigger: { left: 100, top: 100, right: 340, bottom: 140, width: 240, height: 40 },
      viewport,
      contentHeight: 260,
    })).toEqual({ left: 100, top: 146, width: 240, maxHeight: 646, placement: 'below' });
  });

  it('flips above and clamps horizontally inside an eight-pixel collision margin', () => {
    expect(placeGuidedSelect({
      trigger: { left: 900, top: 700, right: 1_020, bottom: 740, width: 120, height: 40 },
      viewport,
      contentHeight: 260,
    })).toEqual({ left: 782, top: 434, width: 210, maxHeight: 686, placement: 'above' });
  });

  it('uses visual viewport offsets at page zoom and bounds short-height menus', () => {
    expect(placeGuidedSelect({
      trigger: { left: 510, top: 410, right: 650, bottom: 450, width: 140, height: 40 },
      viewport: { offsetLeft: 200, offsetTop: 100, width: 360, height: 400 },
      contentHeight: 260,
    })).toEqual({ left: 342, top: 144, width: 210, maxHeight: 296, placement: 'above' });

    const short = placeGuidedSelect({
      trigger: { left: 0, top: 150, right: 120, bottom: 190, width: 120, height: 40 },
      viewport: { offsetLeft: 0, offsetTop: 0, width: 320, height: 240 },
      contentHeight: 400,
    });
    expect(short).toEqual({ left: 8, top: 8, width: 210, maxHeight: 136, placement: 'above' });
    expect(short.left).toBeGreaterThanOrEqual(8);
    expect(short.top).toBeGreaterThanOrEqual(8);
    expect(short.top + short.maxHeight).toBeLessThanOrEqual(232);
  });

  it('keeps the menu visible while a scroll container moves the trigger past an edge', () => {
    expect(placeGuidedSelect({
      trigger: { left: 24, top: -40, right: 264, bottom: 0, width: 240, height: 40 },
      viewport,
      contentHeight: 180,
    })).toEqual({ left: 24, top: 8, width: 240, maxHeight: 784, placement: 'below' });
  });
});
