import type Phaser from 'phaser';
import { addBrushRect } from '../textures/brushRect.js';
import { CARD_PANEL, COLORS } from '../theme.js';

const DIVIDER_ALPHA = 0.7;

/** 위치는 선의 가운데다. */
export function addVerticalDivider(
  scene: Phaser.Scene,
  heightPx: number,
): Phaser.GameObjects.Image {
  return addBrushRect(scene, {
    widthPx: CARD_PANEL.borderPx,
    heightPx,
    radiusPx: 0,
    fillColor: COLORS.textSecondary,
    fillAlpha: DIVIDER_ALPHA,
    border: null,
  });
}
