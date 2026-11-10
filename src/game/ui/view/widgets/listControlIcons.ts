import type Phaser from 'phaser';
import { createCanvasTexture } from '../textures/canvasTexture.js';
import { ICON_GRAIN, applyGrain } from '../textures/grain.js';
import { COLORS, cssColor } from '../theme.js';

const GRID_UNITS = 24;
const LINE_WIDTH = 1.6;

export function createLineIconTexture(
  scene: Phaser.Scene,
  key: string,
  sizePx: number,
  trace: (context: CanvasRenderingContext2D) => void,
): string {
  createCanvasTexture(scene, key, sizePx, sizePx, (context) => {
    const scale = sizePx / GRID_UNITS;
    context.scale(scale, scale);
    context.strokeStyle = cssColor(COLORS.textPrimary);
    context.lineWidth = LINE_WIDTH;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    trace(context);
    context.stroke();
    applyGrain(context, sizePx, sizePx, ICON_GRAIN);
  });
  return key;
}

export function getSortIconTexture(scene: Phaser.Scene, sizePx: number): string {
  return createLineIconTexture(scene, `sort-icon:${sizePx}`, sizePx, (context) => {
    context.moveTo(7, 4.5);
    context.lineTo(7, 19.5);
    context.moveTo(3.5, 16);
    context.lineTo(7, 19.5);
    context.lineTo(10.5, 16);
    context.moveTo(13, 6);
    context.lineTo(21, 6);
    context.moveTo(13, 12);
    context.lineTo(18.5, 12);
    context.moveTo(13, 18);
    context.lineTo(16, 18);
  });
}
