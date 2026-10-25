import { getLanes } from '../../rhythm/lanes.js';
import type { LaneCount } from '../../rhythm/types.js';

// 모든 모드에 같은 레인 폭을 써서 4K 는 기존 위치(왼쪽 720px, 폭 480px)를 유지한다.
const LANE_WIDTH_PX = 120;

export interface PlayfieldLayout {
  readonly leftPx: number;
  readonly widthPx: number;
  readonly laneWidthPx: number;
  readonly centerXPx: number;
  readonly laneCenterXPx: readonly number[];
}

export function getPlayfieldLayout(screenWidthPx: number, laneCount: LaneCount): PlayfieldLayout {
  const widthPx = LANE_WIDTH_PX * laneCount;
  const leftPx = (screenWidthPx - widthPx) / 2;
  return {
    leftPx,
    widthPx,
    laneWidthPx: LANE_WIDTH_PX,
    centerXPx: leftPx + widthPx / 2,
    laneCenterXPx: getLanes(laneCount).map(
      (lane) => leftPx + LANE_WIDTH_PX * lane + LANE_WIDTH_PX / 2,
    ),
  };
}
