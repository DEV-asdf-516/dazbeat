import { describe, expect, it } from 'vitest';
import {
  createEditorLayout,
  getLaneCenterXPx,
  getSeekTimeMs,
  getSeekXPx,
  toViewportRect,
} from '../../../src/game/editor/chartEditorLayout.js';
import { getLaneAtX } from '../../../src/game/editor/editorTimeline.js';
import { LANES } from '../../../src/rhythm/lanes.js';

const SCREEN_WIDTH_PX = 1920;
const SCREEN_HEIGHT_PX = 1080;
const layout = createEditorLayout(SCREEN_WIDTH_PX, SCREEN_HEIGHT_PX);

describe('createEditorLayout', () => {
  it('keeps both bars within their height ranges and the bottom bar at the screen bottom', () => {
    expect(layout.topBar.heightPx).toBeGreaterThanOrEqual(64);
    expect(layout.topBar.heightPx).toBeLessThanOrEqual(72);
    expect(layout.topBar.heightPx).toBeLessThanOrEqual(SCREEN_HEIGHT_PX * 0.08);
    expect(layout.bottomBar.heightPx).toBeGreaterThanOrEqual(64);
    expect(layout.bottomBar.heightPx).toBeLessThanOrEqual(80);
    expect(layout.bottomBar.heightPx).toBeLessThanOrEqual(SCREEN_HEIGHT_PX * 0.08);
    expect(layout.bottomBar.topYPx + layout.bottomBar.heightPx).toBe(SCREEN_HEIGHT_PX);
  });

  it('splits a centered 1440px work area into video, lane and tools columns', () => {
    const { video, laneColumn, tools } = layout;
    expect(video.widthPx).toBe(384);
    expect(laneColumn.widthPx).toBe(768);
    expect(tools.widthPx).toBe(240);
    expect(laneColumn.leftPx - (video.leftPx + video.widthPx)).toBe(24);
    expect(tools.leftPx - (laneColumn.leftPx + laneColumn.widthPx)).toBe(24);
    const rightEdgePx = tools.leftPx + tools.widthPx;
    expect(rightEdgePx - video.leftPx).toBe(1440);
    expect(Math.abs(video.leftPx - (SCREEN_WIDTH_PX - rightEdgePx))).toBeLessThanOrEqual(1);
  });

  it('places a 16:9 video preview on the shared work area top line', () => {
    const { video } = layout;
    expect(video.widthPx).toBe(384);
    expect(video.heightPx).toBe(216);
    expect(video.widthPx * 9).toBe(video.heightPx * 16);
    expect(video.topPx).toBe(layout.timeline.topYPx);
    expect(video.topPx).toBe(layout.tools.topYPx);
    const marginPx = video.topPx - layout.topBar.heightPx;
    expect(marginPx).toBeGreaterThanOrEqual(16);
    expect(marginPx).toBeLessThanOrEqual(24);
  });

  it('fits the lanes inside the lane column after the grid label column', () => {
    const { lanes, laneColumn } = layout;
    expect(laneColumn.leftPx + layout.gridLabelColumnPx).toBe(lanes.leftPx);
    expect(lanes.leftPx + lanes.widthPx).toBe(laneColumn.leftPx + laneColumn.widthPx);
    expect(lanes.widthPx).toBe(lanes.laneWidthPx * LANES.length);
  });

  it('places the timeline between the bars with the playhead inside it', () => {
    const { timeline } = layout;
    expect(layout.topBar.heightPx).toBeLessThanOrEqual(timeline.topYPx);
    expect(timeline.topYPx).toBeLessThan(timeline.playheadYPx);
    expect(timeline.playheadYPx).toBeLessThan(timeline.bottomYPx);
    expect(timeline.bottomYPx).toBeLessThanOrEqual(layout.bottomBar.topYPx);
    expect(layout.tools.topYPx).toBe(timeline.topYPx);
  });

  it('starts PLAY at the lane column and ends the seek bar at the lane column right edge', () => {
    const { laneColumn, seek } = layout;
    expect(layout.playLeftPx).toBe(laneColumn.leftPx);
    expect(layout.timeXPx).toBeLessThan(seek.leftPx);
    expect(seek.leftPx + seek.widthPx).toBe(laneColumn.leftPx + laneColumn.widthPx);
  });
});

describe('toViewportRect', () => {
  const rect = { leftPx: 240, topPx: 96, widthPx: 384, heightPx: 216 };

  it('keeps the rect when the canvas is shown at scale 1 without offset', () => {
    const canvas = { leftPx: 0, topPx: 0, widthPx: SCREEN_WIDTH_PX, heightPx: SCREEN_HEIGHT_PX };
    expect(toViewportRect(rect, canvas, SCREEN_WIDTH_PX, SCREEN_HEIGHT_PX)).toEqual(rect);
  });

  it('scales the rect and adds the canvas offset', () => {
    const canvas = { leftPx: 100, topPx: 20, widthPx: 960, heightPx: 540 };
    expect(toViewportRect(rect, canvas, SCREEN_WIDTH_PX, SCREEN_HEIGHT_PX)).toEqual({
      leftPx: 220,
      topPx: 68,
      widthPx: 192,
      heightPx: 108,
    });
  });

  it('does not round non-integer scales', () => {
    const canvas = { leftPx: 0, topPx: 0, widthPx: 1366, heightPx: 768 };
    const result = toViewportRect(rect, canvas, SCREEN_WIDTH_PX, SCREEN_HEIGHT_PX);
    expect(result.leftPx).toBeCloseTo((240 * 1366) / 1920);
    expect(result.topPx).toBeCloseTo((96 * 768) / 1080);
    expect(result.widthPx).toBeCloseTo((384 * 1366) / 1920);
    expect(result.heightPx).toBeCloseTo((216 * 768) / 1080);
    expect(Number.isInteger(result.widthPx)).toBe(false);
  });
});

describe('getLaneCenterXPx', () => {
  const { leftPx, laneWidthPx, widthPx } = layout.lanes;

  it('maps each lane center back to the same lane', () => {
    for (const lane of LANES) {
      expect(getLaneAtX(getLaneCenterXPx(layout, lane), leftPx, laneWidthPx)).toBe(lane);
    }
  });

  it('splits lanes exactly at inner boundaries', () => {
    for (let k = 1; k < LANES.length; k += 1) {
      const boundaryXPx = leftPx + k * laneWidthPx;
      expect(getLaneAtX(boundaryXPx, leftPx, laneWidthPx)).toBe(LANES[k]);
      expect(getLaneAtX(boundaryXPx - 1, leftPx, laneWidthPx)).toBe(LANES[k - 1]);
    }
  });

  it('clamps x outside the lanes to the edge lanes', () => {
    expect(getLaneAtX(leftPx - 1, leftPx, laneWidthPx)).toBe(0);
    expect(getLaneAtX(leftPx + widthPx, leftPx, laneWidthPx)).toBe(LANES[LANES.length - 1]);
  });
});

describe('getSeekXPx / getSeekTimeMs', () => {
  const song = { gameStartMs: 1000, gameEndMs: 61000 };
  const { leftPx, widthPx } = layout.seek;

  it('maps the song start and end to the seek bar ends', () => {
    expect(getSeekXPx(layout, song.gameStartMs, song)).toBe(leftPx);
    expect(getSeekXPx(layout, song.gameEndMs, song)).toBe(leftPx + widthPx);
    expect(getSeekTimeMs(layout, leftPx, song)).toBe(song.gameStartMs);
    expect(getSeekTimeMs(layout, leftPx + widthPx, song)).toBe(song.gameEndMs);
  });

  it('round-trips times inside the song', () => {
    for (const timeMs of [1001, 12345, 31000, 60999]) {
      expect(getSeekTimeMs(layout, getSeekXPx(layout, timeMs, song), song)).toBeCloseTo(timeMs);
    }
  });
});
