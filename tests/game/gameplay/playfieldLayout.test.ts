import { describe, expect, it } from 'vitest';
import { getPlayfieldLayout } from '../../../src/game/gameplay/playfieldLayout.js';

const SCREEN_WIDTH_PX = 1920;

describe('getPlayfieldLayout', () => {
  it('keeps the 4K playfield at its existing position', () => {
    const layout = getPlayfieldLayout(SCREEN_WIDTH_PX, 4);

    expect(layout.leftPx).toBe(720);
    expect(layout.widthPx).toBe(480);
    expect(layout.centerXPx).toBe(960);
  });

  it.each([
    [4, 480],
    [5, 600],
    [6, 720],
  ] as const)('centers %iK lanes of 120px on the screen', (laneCount, widthPx) => {
    const layout = getPlayfieldLayout(SCREEN_WIDTH_PX, laneCount);

    expect(layout.centerXPx).toBe(960);
    expect(layout.widthPx).toBe(widthPx);
    expect(layout.laneCenterXPx).toHaveLength(laneCount);
    layout.laneCenterXPx.slice(1).forEach((xPx, index) => {
      expect(xPx - (layout.laneCenterXPx[index] ?? Number.NaN)).toBe(120);
    });
    expect(layout.laneCenterXPx.at(-1)).toBe(layout.leftPx + layout.widthPx - 60);
  });
});
