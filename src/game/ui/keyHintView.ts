import type Phaser from 'phaser';
import { parseKeyHints } from './keyHints.js';
import {
  COLORS,
  EDITOR_COLORS,
  EDITOR_TYPE_SCALE,
  RADIUS,
  SCREEN_LAYOUT,
  TYPE_SCALE,
  typeStyle,
} from './theme.js';

/** 키캡 하나와 설명의 크기·색. 화면 계열마다 하나씩 둔다. */
export interface KeyHintStyle {
  keyType: { sizePx: number; weight: number };
  labelType: { sizePx: number; weight: number };
  keyColor: number;
  labelColor: number;
  capFill: number;
  capFillAlpha: number;
  capBorder: number;
  capBorderAlpha: number;
  capHeightPx: number;
  capPaddingXPx: number;
  capMinWidthPx: number;
  capLabelGapPx: number;
  /** 가로로 늘어놓을 때 항목 사이 간격. 키·설명 간격보다 확실히 넓어야 항목이 묶여 보인다. */
  rowItemGapPx: number;
  columnRowGapPx: number;
}

/** 채보 편집 화면의 작은 남색 키캡. */
export const EDITOR_KEY_HINT_STYLE: KeyHintStyle = {
  keyType: EDITOR_TYPE_SCALE.meta,
  labelType: EDITOR_TYPE_SCALE.meta,
  keyColor: EDITOR_COLORS.textPrimary,
  labelColor: EDITOR_COLORS.textSecondary,
  capFill: EDITOR_COLORS.surface,
  capFillAlpha: 1,
  capBorder: EDITOR_COLORS.border,
  capBorderAlpha: 1,
  capHeightPx: 24,
  capPaddingXPx: 8,
  capMinWidthPx: 28,
  capLabelGapPx: 10,
  rowItemGapPx: 28,
  columnRowGapPx: 12,
};

/** 배경 그림 위에 놓이는 메뉴형 화면의 키캡. 그림이 비치지 않게 어두운 면을 깐다. */
const MENU_KEY_HINT_STYLE: KeyHintStyle = {
  keyType: { sizePx: 17, weight: 600 },
  labelType: TYPE_SCALE.meta,
  keyColor: COLORS.textPrimary,
  labelColor: COLORS.textSecondary,
  capFill: COLORS.background,
  capFillAlpha: 0.55,
  capBorder: COLORS.textMuted,
  capBorderAlpha: 0.7,
  capHeightPx: 32,
  capPaddingXPx: 10,
  capMinWidthPx: 36,
  capLabelGapPx: 12,
  rowItemGapPx: 36,
  columnRowGapPx: 12,
};

const CAP_BORDER_PX = 1;

interface KeyHintItem {
  cap: Phaser.GameObjects.Rectangle;
  key: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
}

/** 키는 키캡 안에, 설명은 그 오른쪽에 둔다. 위치는 호출한 배치 함수가 container 기준으로 정한다. */
function createItems(scene: Phaser.Scene, text: string, style: KeyHintStyle): KeyHintItem[] {
  return parseKeyHints(text).map((hint) => {
    const key = scene.add
      .text(0, 0, hint.key, typeStyle(style.keyType, style.keyColor))
      .setOrigin(0.5, 0.5);
    const cap = scene.add
      .rectangle(
        0,
        0,
        Math.max(style.capMinWidthPx, key.width + style.capPaddingXPx * 2),
        style.capHeightPx,
        style.capFill,
        style.capFillAlpha,
      )
      .setOrigin(0, 0.5)
      .setStrokeStyle(CAP_BORDER_PX, style.capBorder, style.capBorderAlpha)
      .setRounded(RADIUS.smallPx);
    const label = scene.add
      .text(0, 0, hint.label, typeStyle(style.labelType, style.labelColor))
      .setOrigin(0, 0.5);
    return { cap, key, label };
  });
}

function placeItem(item: KeyHintItem, capLeftPx: number, labelLeftPx: number, yPx: number): void {
  item.cap.setPosition(capLeftPx, yPx);
  item.key.setPosition(capLeftPx + item.cap.width / 2, yPx);
  item.label.setPosition(labelLeftPx, yPx);
}

/** container 에 키캡을 키보다 먼저 넣어 키가 키캡 위에 그려지게 한다. */
function addContainer(
  scene: Phaser.Scene,
  xPx: number,
  yPx: number,
  items: readonly KeyHintItem[],
): Phaser.GameObjects.Container {
  return scene.add.container(
    xPx,
    yPx,
    items.flatMap(({ cap, key, label }) => [cap, key, label]),
  );
}

/** 안내 문구를 한 줄로 늘어놓는다. 위치는 첫 키캡의 왼쪽과 줄의 세로 가운데다. */
export function addKeyHintRow(
  scene: Phaser.Scene,
  text: string,
  style: KeyHintStyle,
  leftPx: number,
  centerYPx: number,
): Phaser.GameObjects.Container {
  const items = createItems(scene, text, style);
  let xPx = 0;
  items.forEach((item) => {
    const labelLeftPx = xPx + item.cap.width + style.capLabelGapPx;
    placeItem(item, xPx, labelLeftPx, 0);
    xPx = labelLeftPx + item.label.width + style.rowItemGapPx;
  });
  return addContainer(scene, leftPx, centerYPx, items);
}

/** 안내 문구를 아래쪽 기준으로 한 항목씩 쌓는다. 설명은 가장 넓은 키캡 뒤 같은 x 에서 시작한다. */
export function addKeyHintColumn(
  scene: Phaser.Scene,
  text: string,
  style: KeyHintStyle,
  leftPx: number,
  bottomYPx: number,
): Phaser.GameObjects.Container {
  const items = createItems(scene, text, style);
  const labelLeftPx = Math.max(...items.map((item) => item.cap.width)) + style.capLabelGapPx;
  const rowStepPx = style.capHeightPx + style.columnRowGapPx;
  const firstYPx = -style.capHeightPx / 2 - rowStepPx * (items.length - 1);
  items.forEach((item, index) => placeItem(item, 0, labelLeftPx, firstYPx + rowStepPx * index));
  return addContainer(scene, leftPx, bottomYPx, items);
}

/** 메뉴형 화면 공용 힌트 줄. 키캡 윗선을 topYPx 에 맞추며, 기본은 공용 힌트 자리다. */
export function addMenuKeyHintRow(
  scene: Phaser.Scene,
  text: string,
  leftPx: number,
  topYPx: number = SCREEN_LAYOUT.hintYPx,
): Phaser.GameObjects.Container {
  return addKeyHintRow(
    scene,
    text,
    MENU_KEY_HINT_STYLE,
    leftPx,
    topYPx + MENU_KEY_HINT_STYLE.capHeightPx / 2,
  );
}
