import type Phaser from 'phaser';
import { parseKeyHints } from '../../state/keyHints.js';
import { COLORS, RADIUS, TYPE_SCALE, typeStyle } from '../theme.js';

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
  /** 키·설명 간격보다 확실히 넓어야 항목이 묶여 보인다. */
  rowItemGapPx: number;
  columnRowGapPx: number;
}

/** 배경 그림이 비치지 않게 어두운 면을 깐다. */
export const MENU_KEY_HINT_STYLE: KeyHintStyle = {
  keyType: {
    sizePx: 17,
    weight: 600,
  },
  labelType: TYPE_SCALE.meta,
  keyColor: COLORS.textPrimary,
  labelColor: COLORS.textSecondary,
  capFill: COLORS.background,
  capFillAlpha: 0.55,
  capBorder: COLORS.textMuted,
  capBorderAlpha: 0.7,
  capHeightPx: 32,
  capPaddingXPx: 10,
  capMinWidthPx: 56,
  capLabelGapPx: 12,
  rowItemGapPx: 36,
  columnRowGapPx: 12,
};

const CAP_BORDER_PX = 1;

export interface KeyCap {
  readonly cap: Phaser.GameObjects.Rectangle;
  readonly key: Phaser.GameObjects.Text;
}

interface KeyHintItem extends KeyCap {
  label: Phaser.GameObjects.Text;
}

export function createKeyCap(scene: Phaser.Scene, key: string, style: KeyHintStyle): KeyCap {
  const text = scene.add
    .text(0, 0, key, typeStyle(style.keyType, style.keyColor))
    .setOrigin(0.5, 0.5);
  const cap = scene.add
    .rectangle(
      0,
      0,
      Math.max(style.capMinWidthPx, text.width + style.capPaddingXPx * 2),
      style.capHeightPx,
      style.capFill,
      style.capFillAlpha,
    )
    .setOrigin(0, 0.5)
    .setStrokeStyle(CAP_BORDER_PX, style.capBorder, style.capBorderAlpha)
    .setRounded(RADIUS.smallPx);
  return {
    cap,
    key: text,
  };
}

export function placeKeyCap(keyCap: KeyCap, capLeftPx: number, centerYPx: number): void {
  keyCap.cap.setPosition(capLeftPx, centerYPx);
  keyCap.key.setPosition(capLeftPx + keyCap.cap.width / 2, centerYPx);
}

// 키캡을 키보다 먼저 넣어 키가 키캡 위에 그려지게 한다.
export function getKeyCapObjects(
  keyCap: KeyCap,
): readonly [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Text] {
  return [keyCap.cap, keyCap.key];
}

function createItems(scene: Phaser.Scene, text: string, style: KeyHintStyle): KeyHintItem[] {
  return parseKeyHints(text).map((hint) => ({
    ...createKeyCap(scene, hint.key, style),
    label: scene.add
      .text(0, 0, hint.label, typeStyle(style.labelType, style.labelColor))
      .setOrigin(0, 0.5),
  }));
}

function placeItem(item: KeyHintItem, capLeftPx: number, labelLeftPx: number, yPx: number): void {
  placeKeyCap(item, capLeftPx, yPx);
  item.label.setPosition(labelLeftPx, yPx);
}

function addContainer(
  scene: Phaser.Scene,
  xPx: number,
  yPx: number,
  items: readonly KeyHintItem[],
): Phaser.GameObjects.Container {
  return scene.add.container(
    xPx,
    yPx,
    items.flatMap((item) => [...getKeyCapObjects(item), item.label]),
  );
}

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
