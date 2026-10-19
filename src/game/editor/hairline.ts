import type Phaser from 'phaser';
import type { EditorLayout } from './chartEditorLayout.js';
import { CELESTIAL_COLORS } from '../ui/theme.js';

export const HAIRLINE_PX = 1;
const HAIRLINE_ALPHA = 0.45;

export function addHairline(
  scene: Phaser.Scene,
  leftXPx: number,
  yPx: number,
  rightXPx: number,
): void {
  scene.add
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

export function addBarHairlines(scene: Phaser.Scene, layout: EditorLayout, widthPx: number): void {
  addHairline(scene, 0, layout.topBar.heightPx, widthPx);
  addHairline(scene, 0, layout.bottomBar.topYPx, widthPx);
}
