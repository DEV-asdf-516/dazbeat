import type Phaser from 'phaser';
import { CELESTIAL_COLORS } from '../theme.js';

export const HAIRLINE_PX = 1;
const HAIRLINE_ALPHA = 0.45;

export function addHairline(
  scene: Phaser.Scene,
  leftXPx: number,
  yPx: number,
  rightXPx: number,
): Phaser.GameObjects.Rectangle {
  return scene.add
    .rectangle(
      leftXPx,
      yPx,
      rightXPx - leftXPx,
      HAIRLINE_PX,
      CELESTIAL_COLORS.border,
      HAIRLINE_ALPHA,
    )
    .setOrigin(0, 0.5);
}
