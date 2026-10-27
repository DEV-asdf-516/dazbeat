import { getLanes } from '../../rhythm/lanes.js';
import type { Lane, LaneCount } from '../../rhythm/types.js';
import { requireDefined } from '../../invariant.js';
import { lerp } from '../../range.js';

const JUDGE_LINE_Y_PX = 920;
// 레인은 화면 위끝에서 판정선 폭의 이 비율까지 좁아지는 사다리꼴이다.
const TOP_WIDTH_RATIO = 0.3;
const JUDGE_LINE_WIDTH_PX: Readonly<Record<LaneCount, number>> = {
  4: 920,
  5: 980,
  6: 1040,
};
const NOTE_PLATE_WIDTH_RATIO = 0.8;
const NOTE_PLATE_JUDGE_THICKNESS_PX = 34;
const NOTE_PLATE_MIN_THICKNESS_PX = 7;
const HOLD_RIBBON_WIDTH_RATIO = 0.72;
// 판 텍스처를 그리는 기준 크기로, 4레인 판정선 위 판 하나다.
export const REFERENCE_NOTE_PLATE = {
  widthPx: (JUDGE_LINE_WIDTH_PX[4] / 4) * NOTE_PLATE_WIDTH_RATIO,
  heightPx: NOTE_PLATE_JUDGE_THICKNESS_PX,
} as const;
// 폭이 0 이 되는 소실점 y. 판정선에서 위끝까지 폭이 TOP_WIDTH_RATIO 로 줄어들도록 정한다.
const VANISHING_Y_PX = (-TOP_WIDTH_RATIO * JUDGE_LINE_Y_PX) / (1 - TOP_WIDTH_RATIO);

export interface PlayfieldLayout {
  readonly judgeLineYPx: number;
  readonly leftPx: number;
  readonly widthPx: number;
  readonly laneWidthPx: number;
  readonly centerXPx: number;
  readonly laneCenterXPx: readonly number[];
}

export interface Trapezoid {
  readonly topYPx: number;
  readonly bottomYPx: number;
  readonly topLeftXPx: number;
  readonly topRightXPx: number;
  readonly bottomLeftXPx: number;
  readonly bottomRightXPx: number;
}

export function getPlayfieldLayout(screenWidthPx: number, laneCount: LaneCount): PlayfieldLayout {
  const widthPx = JUDGE_LINE_WIDTH_PX[laneCount];
  const laneWidthPx = widthPx / laneCount;
  const centerXPx = screenWidthPx / 2;
  const leftPx = centerXPx - widthPx / 2;
  return {
    judgeLineYPx: JUDGE_LINE_Y_PX,
    leftPx,
    widthPx,
    laneWidthPx,
    centerXPx,
    laneCenterXPx: getLanes(laneCount).map((lane) => leftPx + laneWidthPx * lane + laneWidthPx / 2),
  };
}

// 등속으로 내려오는 평면 y 를 원근 y 로 바꾼다. 프로젝트 세카이(Sonolus pjsekai engine 의 approach)처럼
// 소실점 거리 비율을 남은 시간에 대해 지수로 키워 판정선에 가까울수록 빨라지고 간격이 벌어지게 한다.
// 평면 y 0(화면 위끝)과 판정선은 그대로 두어 노트가 내려오는 총 시간은 스크롤 속도 설정을 따른다.
export function getPerspectiveYPx(layout: PlayfieldLayout, flatYPx: number): number {
  const remainingRatio = (layout.judgeLineYPx - flatYPx) / layout.judgeLineYPx;
  return lerp(VANISHING_Y_PX, layout.judgeLineYPx, TOP_WIDTH_RATIO ** remainingRatio);
}

export function getPlayfieldXAtY(layout: PlayfieldLayout, xPx: number, yPx: number): number {
  return lerp(layout.centerXPx, xPx, getWidthRatio(yPx));
}

export function getPlayfieldTrapezoid(
  layout: PlayfieldLayout,
  leftXPx: number,
  rightXPx: number,
  topYPx: number,
  bottomYPx: number,
): Trapezoid {
  return {
    topYPx,
    bottomYPx,
    topLeftXPx: getPlayfieldXAtY(layout, leftXPx, topYPx),
    topRightXPx: getPlayfieldXAtY(layout, rightXPx, topYPx),
    bottomLeftXPx: getPlayfieldXAtY(layout, leftXPx, bottomYPx),
    bottomRightXPx: getPlayfieldXAtY(layout, rightXPx, bottomYPx),
  };
}

// 플레이어는 판정선에 먼저 닿는 아랫면을 보고 누르므로 판의 아랫면을 노트 시각 위치에 둔다.
export function getNotePlate(layout: PlayfieldLayout, lane: Lane, bottomYPx: number): Trapezoid {
  const thicknessPx = Math.max(
    NOTE_PLATE_MIN_THICKNESS_PX,
    NOTE_PLATE_JUDGE_THICKNESS_PX * getWidthRatio(bottomYPx) ** 2,
  );
  return getLaneBand(layout, lane, NOTE_PLATE_WIDTH_RATIO, bottomYPx - thicknessPx, bottomYPx);
}

export function getHoldRibbonTrapezoid(
  layout: PlayfieldLayout,
  lane: Lane,
  topYPx: number,
  bottomYPx: number,
): Trapezoid {
  return getLaneBand(layout, lane, HOLD_RIBBON_WIDTH_RATIO, topYPx, bottomYPx);
}

// 판정선 아래에서는 1 을 넘는 배율이라 range.ts 의 getProgress(0~1 로 자름)를 쓰지 않는다.
function getWidthRatio(yPx: number): number {
  return (yPx - VANISHING_Y_PX) / (JUDGE_LINE_Y_PX - VANISHING_Y_PX);
}

function getLaneBand(
  layout: PlayfieldLayout,
  lane: Lane,
  widthRatio: number,
  topYPx: number,
  bottomYPx: number,
): Trapezoid {
  const centerXPx = requireDefined(layout.laneCenterXPx[lane], 'Unknown lane', lane);
  const halfWidthPx = (layout.laneWidthPx * widthRatio) / 2;
  return getPlayfieldTrapezoid(
    layout,
    centerXPx - halfWidthPx,
    centerXPx + halfWidthPx,
    topYPx,
    bottomYPx,
  );
}
