import type { Song } from '../../data/songs.js';
import { LANES } from '../../rhythm/lanes.js';
import type { Lane } from '../../rhythm/types.js';

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
/** PLAY 왼쪽에서 시간 문구까지. PAUSE 라벨 폭에도 겹치지 않는 고정값이다. */
const TIME_OFFSET_X_PX = 96;
/** PLAY 왼쪽에서 seek 시작까지. `m:ss.mmm / m:ss.mmm` 문구 뒤에 둔다. */
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
  /** 왼쪽 열 영상 미리보기. 캔버스에서 이 사각형에는 아무것도 그리지 않는다. */
  readonly video: PxRect;
  /** 영상 player 상태·오류 문구의 왼쪽 위 기준점과 줄바꿈 폭(미리보기 바로 아래). */
  readonly playerText: {
    readonly leftPx: number;
    readonly topYPx: number;
    readonly widthPx: number;
  };
  /** 키 안내의 왼쪽 x(영상 열 왼쪽). */
  readonly hint: { readonly leftPx: number };
  readonly laneColumn: { readonly leftPx: number; readonly widthPx: number };
  readonly title: { readonly leftPx: number; readonly maxWidthPx: number };
  readonly difficultiesLeftPx: number;
  /** PLAY 버튼 왼쪽 x(레인 열 왼쪽). */
  readonly playLeftPx: number;
  /** 현재 시간 문구 왼쪽 x. */
  readonly timeXPx: number;
  readonly seek: { readonly leftPx: number; readonly widthPx: number };
  readonly timeline: {
    readonly topYPx: number;
    readonly bottomYPx: number;
    readonly playheadYPx: number;
  };
  readonly lanes: {
    readonly leftPx: number;
    readonly laneWidthPx: number;
    readonly widthPx: number;
  };
  /** 레인 열 왼쪽의 시간 눈금 라벨 폭 */
  readonly gridLabelColumnPx: number;
  readonly tools: {
    readonly leftPx: number;
    readonly widthPx: number;
    readonly topYPx: number;
    readonly paddingPx: number;
  };
}

/** 가운데 작업 영역을 영상·레인·도구 3열로 나눈다. 세 열은 같은 윗선에서 시작한다. */
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
    topBar: { heightPx: TOP_BAR_HEIGHT_PX, centerYPx: TOP_BAR_HEIGHT_PX / 2 },
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
    laneColumn: { leftPx: laneColumnLeftPx, widthPx: LANE_COLUMN_WIDTH_PX },
    title: { leftPx: laneColumnLeftPx, maxWidthPx: TITLE_MAX_WIDTH_PX },
    difficultiesLeftPx: laneColumnLeftPx + TITLE_MAX_WIDTH_PX + TITLE_DIFFICULTY_GAP_PX,
    playLeftPx: laneColumnLeftPx,
    timeXPx: laneColumnLeftPx + TIME_OFFSET_X_PX,
    seek: { leftPx: seekLeftPx, widthPx: laneColumnRightPx - seekLeftPx },
    timeline: {
      topYPx: workTopYPx,
      bottomYPx: timelineBottomYPx,
      playheadYPx: timelineBottomYPx - PLAYHEAD_ABOVE_BOTTOM_PX,
    },
    lanes: {
      leftPx: lanesLeftPx,
      laneWidthPx: lanesWidthPx / LANES.length,
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

/**
 * 게임 논리 좌표의 사각형을 캔버스가 실제로 보이는 CSS px 사각형으로 옮긴다.
 * 둘 다 CSS px 이라 DPR 은 곱하지 않는다.
 */
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
/** lane 의 가운데 x. 노트 표시 위치와 lane 판정이 같은 값을 쓴다. */
export function getLaneCenterXPx(layout: EditorLayout, lane: Lane): number {
  const { leftPx, laneWidthPx } = layout.lanes;
  return leftPx + laneWidthPx * lane + laneWidthPx / 2;
}

/** seek 막대에서 시각의 x. thumb·채움·노트 분포 눈금이 쓴다. */
export function getSeekXPx(
  layout: EditorLayout,
  timeMs: number,
  song: Pick<Song, 'gameStartMs' | 'gameEndMs'>,
): number {
  const fraction = (timeMs - song.gameStartMs) / (song.gameEndMs - song.gameStartMs);
  return layout.seek.leftPx + fraction * layout.seek.widthPx;
}

/** getSeekXPx 의 역함수. 범위 밖 x 도 그대로 비례 계산하며 clamp·반올림은 기존 `seek()` 가 한다. */
export function getSeekTimeMs(
  layout: EditorLayout,
  xPx: number,
  song: Pick<Song, 'gameStartMs' | 'gameEndMs'>,
): number {
  const fraction = (xPx - layout.seek.leftPx) / layout.seek.widthPx;
  return song.gameStartMs + fraction * (song.gameEndMs - song.gameStartMs);
}
