import { getLanes } from '../../../rhythm/lanes.js';
import type { LaneCount } from '../../../rhythm/types.js';
import { getFraction, lerp } from '../../../range.js';
import { PLAYFIELD_JUDGE_LINE_WIDTH_PX } from '../../ui/state/noteLook.js';

const JUDGE_LINE_Y_PX = 920;
// 레인은 화면 위끝에서 판정선 폭의 이 비율까지 좁아지는 사다리꼴이다.
const TOP_WIDTH_RATIO = 0.3;
const NOTE_PLATE_JUDGE_THICKNESS_PX = 34;
const NOTE_PLATE_MIN_THICKNESS_PX = 7;
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

export interface LaneBand {
  readonly centerXPx: number;
  readonly leftXPx: number;
  readonly rightXPx: number;
}

export function getPlayfieldLayout(screenWidthPx: number, laneCount: LaneCount): PlayfieldLayout {
  const widthPx = PLAYFIELD_JUDGE_LINE_WIDTH_PX[laneCount];
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

// 폭 비율은 판정선 아래에서 1 을 넘는 배율이라 0~1 로 자르지 않는다.
export function getPlayfieldXAtY(layout: PlayfieldLayout, xPx: number, yPx: number): number {
  return lerp(layout.centerXPx, xPx, getFraction(yPx, VANISHING_Y_PX, JUDGE_LINE_Y_PX));
}

// 레인 가운데 기준으로 laneWidthPx 의 widthRatio 만큼 차지하는 판정선 위 가로 범위. 레인마다 한 번만 구한다.
export function getLaneBands(layout: PlayfieldLayout, widthRatio: number): readonly LaneBand[] {
  const halfWidthPx = (layout.laneWidthPx * widthRatio) / 2;
  return layout.laneCenterXPx.map((centerXPx) => ({
    centerXPx,
    leftXPx: centerXPx - halfWidthPx,
    rightXPx: centerXPx + halfWidthPx,
  }));
}

export function getPlayfieldTrapezoid(
  layout: PlayfieldLayout,
  leftXPx: number,
  rightXPx: number,
  topYPx: number,
  bottomYPx: number,
): Trapezoid {
  const { centerXPx } = layout;
  const topWidthRatio = getFraction(topYPx, VANISHING_Y_PX, JUDGE_LINE_Y_PX);
  const bottomWidthRatio = getFraction(bottomYPx, VANISHING_Y_PX, JUDGE_LINE_Y_PX);
  return {
    topYPx,
    bottomYPx,
    topLeftXPx: lerp(centerXPx, leftXPx, topWidthRatio),
    topRightXPx: lerp(centerXPx, rightXPx, topWidthRatio),
    bottomLeftXPx: lerp(centerXPx, leftXPx, bottomWidthRatio),
    bottomRightXPx: lerp(centerXPx, rightXPx, bottomWidthRatio),
  };
}

// 플레이어는 판정선에 먼저 닿는 아랫면을 보고 누르므로 판의 아랫면을 노트 시각 위치에 둔다.
// 프레임당 이동량이 폭 비율에 비례하므로 두께도 같은 비율로 줄여야 위쪽에서 노트가 두 개로 끊겨 보이지 않는다.
// 노트마다 매 프레임 부르므로 사다리꼴 객체 대신 윗변 y 만 돌려주고 모서리는 getPlayfieldXAtY 로 구한다.
export function getNotePlateTopYPx(bottomYPx: number): number {
  const bottomWidthRatio = getFraction(bottomYPx, VANISHING_Y_PX, JUDGE_LINE_Y_PX);
  return (
    bottomYPx -
    Math.max(NOTE_PLATE_MIN_THICKNESS_PX, NOTE_PLATE_JUDGE_THICKNESS_PX * bottomWidthRatio)
  );
}
