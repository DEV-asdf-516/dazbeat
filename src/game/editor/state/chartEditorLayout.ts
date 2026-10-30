import type { Song } from '../../../data/songs.js';
import type { Lane, LaneCount } from '../../../rhythm/types.js';
import { clamp, getFraction, getProgress, lerp } from '../../../range.js';

const WORK_AREA_WIDTH_PX = 1440;
const COLUMN_GAP_PX = 24;
const VIDEO_WIDTH_PX = 384;
const VIDEO_HEIGHT_PX = 216;
const LANE_COLUMN_WIDTH_PX = 768;
const TOOLS_WIDTH_PX = 240;
const TOOLS_PADDING_PX = 16;
const TOP_BAR_HEIGHT_PX = 72;
const BOTTOM_BAR_HEIGHT_PX = 76;
const WORK_AREA_MARGIN_Y_PX = 24;
const PLAYER_TEXT_GAP_PX = 12;
const TITLE_MAX_WIDTH_PX = 400;
const TITLE_DIFFICULTY_GAP_PX = 32;
/** PAUSE 라벨 폭에도 겹치지 않는 고정값이다. */
const TIME_OFFSET_X_PX = 96;
const SEEK_OFFSET_X_PX = 288;
const PLAYHEAD_ABOVE_BOTTOM_PX = 140;
const GRID_LABEL_COLUMN_PX = 56;

export interface PxRect {
  readonly leftPx: number;
  readonly topPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface EditorLayout {
  readonly topBar: { readonly heightPx: number; readonly centerYPx: number };
  readonly bottomBar: {
    readonly topYPx: number;
    readonly heightPx: number;
    readonly centerYPx: number;
  };
  readonly video: PxRect;
  readonly playerText: {
    readonly leftPx: number;
    readonly topYPx: number;
    readonly widthPx: number;
  };
  readonly hint: { readonly leftPx: number };
  readonly laneColumn: { readonly leftPx: number; readonly widthPx: number };
  readonly title: { readonly leftPx: number; readonly maxWidthPx: number };
  readonly difficultiesLeftPx: number;
  readonly playLeftPx: number;
  readonly timeXPx: number;
  readonly seek: { readonly leftPx: number; readonly widthPx: number };
  readonly timeline: {
    readonly topYPx: number;
    readonly bottomYPx: number;
    readonly playheadYPx: number;
  };
  readonly lanes: { readonly leftPx: number; readonly widthPx: number };
  readonly gridLabelColumnPx: number;
  readonly tools: {
    readonly leftPx: number;
    readonly widthPx: number;
    readonly topYPx: number;
    readonly paddingPx: number;
  };
}

export function createEditorLayout(screenWidthPx: number, screenHeightPx: number): EditorLayout {
  const workLeftPx = (screenWidthPx - WORK_AREA_WIDTH_PX) / 2;
  const workTopYPx = TOP_BAR_HEIGHT_PX + WORK_AREA_MARGIN_Y_PX;
  const bottomBarTopYPx = screenHeightPx - BOTTOM_BAR_HEIGHT_PX;
  const timelineBottomYPx = bottomBarTopYPx - WORK_AREA_MARGIN_Y_PX;
  const laneColumnLeftPx = workLeftPx + VIDEO_WIDTH_PX + COLUMN_GAP_PX;
  const laneColumnRightPx = laneColumnLeftPx + LANE_COLUMN_WIDTH_PX;
  const lanesLeftPx = laneColumnLeftPx + GRID_LABEL_COLUMN_PX;
  const lanesWidthPx = laneColumnRightPx - lanesLeftPx;
  const seekLeftPx = laneColumnLeftPx + SEEK_OFFSET_X_PX;
  return {
    topBar: {
      heightPx: TOP_BAR_HEIGHT_PX,
      centerYPx: TOP_BAR_HEIGHT_PX / 2,
    },
    bottomBar: {
      topYPx: bottomBarTopYPx,
      heightPx: BOTTOM_BAR_HEIGHT_PX,
      centerYPx: bottomBarTopYPx + BOTTOM_BAR_HEIGHT_PX / 2,
    },
    video: {
      leftPx: workLeftPx,
      topPx: workTopYPx,
      widthPx: VIDEO_WIDTH_PX,
      heightPx: VIDEO_HEIGHT_PX,
    },
    playerText: {
      leftPx: workLeftPx,
      topYPx: workTopYPx + VIDEO_HEIGHT_PX + PLAYER_TEXT_GAP_PX,
      widthPx: VIDEO_WIDTH_PX,
    },
    hint: { leftPx: workLeftPx },
    laneColumn: {
      leftPx: laneColumnLeftPx,
      widthPx: LANE_COLUMN_WIDTH_PX,
    },
    title: {
      leftPx: laneColumnLeftPx,
      maxWidthPx: TITLE_MAX_WIDTH_PX,
    },
    difficultiesLeftPx: laneColumnLeftPx + TITLE_MAX_WIDTH_PX + TITLE_DIFFICULTY_GAP_PX,
    playLeftPx: laneColumnLeftPx,
    timeXPx: laneColumnLeftPx + TIME_OFFSET_X_PX,
    seek: {
      leftPx: seekLeftPx,
      widthPx: laneColumnRightPx - seekLeftPx,
    },
    timeline: {
      topYPx: workTopYPx,
      bottomYPx: timelineBottomYPx,
      playheadYPx: timelineBottomYPx - PLAYHEAD_ABOVE_BOTTOM_PX,
    },
    lanes: {
      leftPx: lanesLeftPx,
      widthPx: lanesWidthPx,
    },
    gridLabelColumnPx: GRID_LABEL_COLUMN_PX,
    tools: {
      leftPx: laneColumnRightPx + COLUMN_GAP_PX,
      widthPx: TOOLS_WIDTH_PX,
      topYPx: workTopYPx,
      paddingPx: TOOLS_PADDING_PX,
    },
  };
}

/** 둘 다 CSS px 이라 DPR 은 곱하지 않는다. */
export function toViewportRect(
  rect: PxRect,
  canvasBounds: PxRect,
  gameWidthPx: number,
  gameHeightPx: number,
): PxRect {
  return {
    leftPx: canvasBounds.leftPx + (rect.leftPx * canvasBounds.widthPx) / gameWidthPx,
    topPx: canvasBounds.topPx + (rect.topPx * canvasBounds.heightPx) / gameHeightPx,
    widthPx: (rect.widthPx * canvasBounds.widthPx) / gameWidthPx,
    heightPx: (rect.heightPx * canvasBounds.heightPx) / gameHeightPx,
  };
}
export function getLaneWidthPx(layout: EditorLayout, laneCount: LaneCount): number {
  return layout.lanes.widthPx / laneCount;
}

export function getLaneCenterXPx(layout: EditorLayout, laneCount: LaneCount, lane: Lane): number {
  const laneWidthPx = getLaneWidthPx(layout, laneCount);
  return layout.lanes.leftPx + laneWidthPx * lane + laneWidthPx / 2;
}

export function getLaneAtXPx(layout: EditorLayout, laneCount: LaneCount, xPx: number): Lane {
  const laneWidthPx = getLaneWidthPx(layout, laneCount);
  return clamp(Math.floor((xPx - layout.lanes.leftPx) / laneWidthPx), 0, laneCount - 1);
}

export function getSeekXPx(
  layout: EditorLayout,
  timeMs: number,
  song: Pick<Song, 'gameStartMs' | 'gameEndMs'>,
): number {
  const { leftPx, widthPx } = layout.seek;
  return lerp(leftPx, leftPx + widthPx, getFraction(timeMs, song.gameStartMs, song.gameEndMs));
}

/** 반올림은 기존 `seek()` 가 한다. */
export function getSeekTimeMs(
  layout: EditorLayout,
  xPx: number,
  song: Pick<Song, 'gameStartMs' | 'gameEndMs'>,
): number {
  const { leftPx, widthPx } = layout.seek;
  return lerp(song.gameStartMs, song.gameEndMs, getProgress(xPx, leftPx, leftPx + widthPx));
}
