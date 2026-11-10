import type Phaser from 'phaser';
import { LANE_COUNTS } from '../../../../rhythm/lanes.js';
import type { LaneCount } from '../../../../rhythm/types.js';
import { GAME_WIDTH } from '../../../app/config.js';
import type {
  CelestialAtlasId,
  CelestialCatalog,
} from '../../../celestial/state/celestialCatalog.js';
import { addCelestialSprite } from '../../../celestial/view/celestialSprites.js';
import { formatLaneCount } from '../../state/format.js';
import { addBrushRect } from '../textures/brushRect.js';
import { CELESTIAL_COLORS, COLORS, TYPE_SCALE, typeStyle } from '../theme.js';
import type { TextTabsLayout, TextTabsStyle } from './TextTabs.js';

// 곡 선택과 RANKING 이 같은 배치를 쓴다. 왼쪽은 목록 패널, 오른쪽은 재킷과 곡 정보다.
export const LIST_PANEL = {
  xPx: 120,
  yPx: 176,
  widthPx: 736,
  heightPx: 744,
  // 남색 위에 흰빛을 옅게 깔아 뒤 배경이 비치는 젖빛 유리처럼 보이게 한다.
  fill: CELESTIAL_COLORS.highlight,
  fillAlpha: 0.09,
} as const;
export const ROW_X_PX = LIST_PANEL.xPx + 72;
export const ROW_Y_PX = 200;
export const ROW_WIDTH_PX = 640;
export const ROW_HEIGHT_PX = 72;
export const ROWS_PER_PAGE = 9;
export const PAGE_X_PX = ROW_X_PX;
export const PAGE_Y_PX = 872;
// 바깥 여백을 넓히고 목록·자켓·정보 사이는 좁혀 화면 가운데로 한 덩어리처럼 모이게 한다.
export const DETAIL_X_PX = LIST_PANEL.xPx + LIST_PANEL.widthPx + 64;
export const JACKET_Y_PX = 228;
export const JACKET_SIZE_PX = 460;
export const INFO_X_PX = DETAIL_X_PX + JACKET_SIZE_PX + 48;
export const TITLE_Y_PX = 272;
// 오른쪽 여백을 목록 패널 왼쪽 여백과 같게 두어 한쪽으로 쏠려 보이지 않게 한다.
export const DETAIL_RIGHT_X_PX = GAME_WIDTH - LIST_PANEL.xPx;
const TITLE_MAX_WIDTH_PX = DETAIL_RIGHT_X_PX - INFO_X_PX;
// 자켓 옆 칸이 좁아 긴 제목은 이 크기까지 줄인 뒤에도 넘치면 줄을 넘긴다.
const TITLE_MIN_SIZE_PX = 40;
const TITLE_SHRINK_STEP_PX = 4;
// 줄을 넘겨도 기록 묶음이 RANDOM·PLAY 위에서 끝나게 한다.
export const TITLE_MAX_LINES = 3;
export const DIFFICULTY_Y_PX = JACKET_Y_PX + JACKET_SIZE_PX + 40;
// 선택되지 않은 탭·곡·난이도를 얇게 두어 굵은 선택 항목에 시선이 모이게 한다.
export const UNSELECTED_WEIGHT = 400;
export const DIFFICULTY_TABS_LAYOUT: TextTabsLayout = {
  xPx: DETAIL_X_PX,
  align: 'left',
  topYPx: DIFFICULTY_Y_PX,
};
export const DIFFICULTY_TABS_STYLE: TextTabsStyle = {
  type: {
    sizePx: TYPE_SCALE.primary.sizePx,
    weight: UNSELECTED_WEIGHT,
  },
  selectedWeight: 800,
  gapPx: 40,
  normalColor: CELESTIAL_COLORS.textNeutral,
};
// 별자리는 정보 아래 남는 하늘에 맞춰 줄인다. 제목이 길면 남는 하늘이 줄어든다.
export const ZODIAC_MAX_SPAN_PX = 290;
// 난이도 탭 끝(EXPERT)이 정보 열 왼쪽 선을 조금 넘어오므로 그만큼 비켜 선다.
export const ZODIAC_AREA_LEFT_X_PX = INFO_X_PX + 40;
export const ZODIAC_AREA_GAP_PX = 40;

export function fitSongTitle(text: Phaser.GameObjects.Text, title: string): void {
  let titleSizePx = TYPE_SCALE.title.sizePx;
  text.setWordWrapWidth(null).setFontSize(titleSizePx).setText(title);
  while (text.width > TITLE_MAX_WIDTH_PX && titleSizePx > TITLE_MIN_SIZE_PX) {
    titleSizePx -= TITLE_SHRINK_STEP_PX;
    text.setFontSize(titleSizePx);
  }
  text.setWordWrapWidth(TITLE_MAX_WIDTH_PX, true);
}

// 레인 수가 기록·채보를 가르므로 곡 정보 옆에 레인 수만큼 별을 놓아 글자를 읽지 않아도 바뀐 것을 알아보게 한다.
export const LANE_STAR_ID: CelestialAtlasId = 'R17';
const LANE_GROUP_GAP_PX = 28;
const LANE_STAR_STEP_PX = 16;
const LANE_TEXT_GAP_PX = 12;
const LANE_TEXT_TYPE = {
  sizePx: TYPE_SCALE.secondary.sizePx,
  weight: 800,
} as const;

export interface LaneMarks {
  readonly stars: readonly Phaser.GameObjects.Sprite[];
  readonly text: Phaser.GameObjects.Text;
}

export function addLaneMarks(scene: Phaser.Scene, celestial: CelestialCatalog): LaneMarks {
  return {
    stars: Array.from({ length: Math.max(...LANE_COUNTS) }, () =>
      addCelestialSprite(scene, celestial.atlasPresentations[LANE_STAR_ID], 0, 0).setVisible(false),
    ),
    text: scene.add
      .text(0, 0, '', typeStyle(LANE_TEXT_TYPE, COLORS.textPrimary))
      .setOrigin(0, 0.5)
      .setVisible(false),
  };
}

export function renderLaneMarks(
  marks: LaneMarks,
  categoryText: Phaser.GameObjects.Text,
  laneCount: LaneCount | null,
): void {
  if (laneCount === null) {
    marks.stars.forEach((star) => star.setVisible(false));
    marks.text.setVisible(false);
    return;
  }
  const centerYPx = categoryText.y + categoryText.height / 2;
  const firstStarXPx = categoryText.x + categoryText.width + LANE_GROUP_GAP_PX;
  marks.stars.forEach((star, index) => {
    star
      .setPosition(firstStarXPx + index * LANE_STAR_STEP_PX, centerYPx)
      .setVisible(index < laneCount);
  });
  marks.text
    .setText(formatLaneCount(laneCount))
    .setPosition(firstStarXPx + (laneCount - 1) * LANE_STAR_STEP_PX + LANE_TEXT_GAP_PX, centerYPx)
    .setVisible(true);
}

export function addGlassPanel(
  scene: Phaser.Scene,
  area: {
    readonly xPx: number;
    readonly yPx: number;
    readonly widthPx: number;
    readonly heightPx: number;
  },
  radiusPx: number,
): Phaser.GameObjects.Image {
  return addBrushRect(scene, {
    widthPx: area.widthPx,
    heightPx: area.heightPx,
    radiusPx,
    fillColor: LIST_PANEL.fill,
    fillAlpha: LIST_PANEL.fillAlpha,
    border: null,
  })
    .setOrigin(0, 0)
    .setPosition(area.xPx, area.yPx);
}
