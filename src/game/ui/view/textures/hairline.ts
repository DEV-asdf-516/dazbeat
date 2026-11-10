import type Phaser from 'phaser';
import { CELESTIAL_COLORS } from '../theme.js';
import { addBrushRect } from './brushRect.js';

export const HAIRLINE_PX = 1;
const HAIRLINE_ALPHA = 0.45;

export function addHairline(
  scene: Phaser.Scene,
  leftXPx: number,
  yPx: number,
  rightXPx: number,
): Phaser.GameObjects.Image {
  return addBrushRect(scene, {
    widthPx: rightXPx - leftXPx,
    heightPx: HAIRLINE_PX,
    radiusPx: 0,
    fillColor: CELESTIAL_COLORS.border,
    fillAlpha: HAIRLINE_ALPHA,
    border: null,
  })
    .setOrigin(0, 0.5)
    .setPosition(leftXPx, yPx);
}
