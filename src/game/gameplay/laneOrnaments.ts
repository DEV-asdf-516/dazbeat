import type Phaser from 'phaser';
import { getLanes } from '../../rhythm/lanes.js';
import type { LaneCount } from '../../rhythm/types.js';
import { GAMEPLAY_DEPTH } from '../ui/theme.js';
import { getPlayfieldXAtY } from './playfieldLayout.js';
import type { PlayfieldLayout } from './playfieldLayout.js';

// 레일 텍스처는 위끝이 옅고 판정선 쪽으로 또렷해지도록 alpha 가 구워져 있어 아래끝을 판정선에 맞춘다.
const LANE_RAIL = {
  key: 'lane-rail',
  url: '/assets/ui/gameplay/lane-rail.png',
} as const;
const LANE_JUDGE_BAR = {
  key: 'lane-judge-bar',
  url: '/assets/ui/gameplay/lane-judge-bar.png',
} as const;
export const LANE_ORNAMENT_IMAGES = [LANE_RAIL, LANE_JUDGE_BAR] as const;

// 텍스처 폭 40px 가운데의 심지가 화면에서 1px 남짓으로 보이는 폭이다.
const RAIL_WIDTH_PX = 20;
// 바깥 경계는 플레이필드 테두리라 안쪽 구분선보다 밝게 둔다.
const RAIL_EDGE_ALPHA = 0.85;
const RAIL_DIVIDER_ALPHA = 0.4;
// 막대 텍스처 양끝의 별점 하나와 사라지는 끝만 레인 바깥으로 짧게 내보내는 비율이다.
const JUDGE_BAR_LANE_WIDTH_RATIO = 0.91;

// 판정선은 레인 바깥까지 뻗었다 가늘어지는 빛 막대로 깔고, 레인 경계마다 원근 경계선을 따라 기운 선을 둔다.
export function addLaneOrnaments(
  scene: Phaser.Scene,
  playfield: PlayfieldLayout,
  laneCount: LaneCount,
): readonly Phaser.GameObjects.Image[] {
  const { judgeLineYPx, leftPx, laneWidthPx, centerXPx, widthPx } = playfield;
  const judgeBar = scene.add
    .image(centerXPx, judgeLineYPx, LANE_JUDGE_BAR.key)
    .setDepth(GAMEPLAY_DEPTH.judgeLine);
  judgeBar.setScale(widthPx / JUDGE_BAR_LANE_WIDTH_RATIO / judgeBar.width);
  const rails = [...getLanes(laneCount), laneCount].map((boundary) => {
    const xPx = leftPx + laneWidthPx * boundary;
    const topOffsetXPx = getPlayfieldXAtY(playfield, xPx, 0) - xPx;
    const isEdge = boundary === 0 || boundary === laneCount;
    return scene.add
      .image(xPx, judgeLineYPx, LANE_RAIL.key)
      .setOrigin(0.5, 1)
      .setDisplaySize(RAIL_WIDTH_PX, Math.hypot(topOffsetXPx, judgeLineYPx))
      .setRotation(Math.atan2(topOffsetXPx, judgeLineYPx))
      .setAlpha(isEdge ? RAIL_EDGE_ALPHA : RAIL_DIVIDER_ALPHA)
      .setDepth(GAMEPLAY_DEPTH.laneDivider);
  });
  return [judgeBar, ...rails];
}
