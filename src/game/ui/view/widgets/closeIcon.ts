import type Phaser from 'phaser';
import { createCanvasTexture } from '../textures/canvasTexture.js';
import { COLORS, cssColor } from '../theme.js';

const GRID_UNITS = 24;
const CROSS_START = 6;
const CROSS_END = 18;
const LINE_WIDTH = 2;

export function getCloseIconTexture(scene: Phaser.Scene, sizePx: number): string {
  const key = `close-icon:${sizePx}`;
  createCanvasTexture(scene, key, sizePx, sizePx, (context) => {
    const scale = sizePx / GRID_UNITS;
    context.scale(scale, scale);
    context.strokeStyle = cssColor(COLORS.textPrimary);
    context.lineWidth = LINE_WIDTH;

    context.beginPath();
    context.moveTo(CROSS_START, CROSS_START);
    context.lineTo(CROSS_END, CROSS_END);
    context.moveTo(CROSS_END, CROSS_START);
    context.lineTo(CROSS_START, CROSS_END);
    context.stroke();
  });
  return key;
}
