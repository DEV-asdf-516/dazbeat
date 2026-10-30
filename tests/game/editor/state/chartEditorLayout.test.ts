import { describe, expect, it } from 'vitest';
import {
  createEditorLayout,
  getLaneAtXPx,
  getLaneCenterXPx,
  getLaneWidthPx,
} from '../../../src/game/editor/chartEditorLayout.js';
import type { LaneCount } from '../../../src/rhythm/types.js';

const layout = createEditorLayout(1920, 1080);
const { leftPx, widthPx } = layout.lanes;
const rightPx = leftPx + widthPx;

describe.each<LaneCount>([4, 5, 6])('%iK lanes', (laneCount) => {
  const laneWidthPx = widthPx / laneCount;
  const lastLane = laneCount - 1;

  it('splits the lane area evenly', () => {
    expect(getLaneWidthPx(layout, laneCount)).toBe(laneWidthPx);
  });

  it('centers each lane in its slot and maps the center back to the lane', () => {
    for (let lane = 0; lane < laneCount; lane += 1) {
      const centerXPx = getLaneCenterXPx(layout, laneCount, lane);
      expect(centerXPx).toBeCloseTo(leftPx + laneWidthPx * (lane + 0.5));
      expect(getLaneAtXPx(layout, laneCount, centerXPx)).toBe(lane);
    }
  });

  it('maps the inner edge of the last lane to the last lane', () => {
    expect(getLaneAtXPx(layout, laneCount, rightPx - 1)).toBe(lastLane);
  });

  it('clamps coordinates outside the lane area to the first and last lanes', () => {
    expect(getLaneAtXPx(layout, laneCount, rightPx)).toBe(lastLane);
    expect(getLaneAtXPx(layout, laneCount, rightPx + 500)).toBe(lastLane);
    expect(getLaneAtXPx(layout, laneCount, leftPx - 1)).toBe(0);
    expect(getLaneAtXPx(layout, laneCount, 0)).toBe(0);
  });
});
