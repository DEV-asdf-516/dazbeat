import type Phaser from 'phaser';
import type { EditorLayout } from '../state/chartEditorLayout.js';
import { addHairline } from '../../ui/view/textures/hairline.js';

export function addBarHairlines(scene: Phaser.Scene, layout: EditorLayout, widthPx: number): void {
  addHairline(scene, 0, layout.topBar.heightPx, widthPx);
  addHairline(scene, 0, layout.bottomBar.topYPx, widthPx);
}
