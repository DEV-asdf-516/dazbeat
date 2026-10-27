import type Phaser from 'phaser';
import { createCanvasTexture } from '../ui/canvasTexture.js';
import { COLORS, cssColor } from '../ui/theme.js';

const GRID_UNITS = 24;
const LINE_WIDTH = 1.6;

export function getSignOutIconTexture(scene: Phaser.Scene, sizePx: number): string {
  const key = `sign-out-icon:${sizePx}`;
  createCanvasTexture(scene, key, sizePx, sizePx, (context) => {
    const scale = sizePx / GRID_UNITS;
    context.scale(scale, scale);
    context.strokeStyle = cssColor(COLORS.textPrimary);
    context.lineWidth = LINE_WIDTH;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    context.beginPath();
    context.moveTo(15, 10);
    context.lineTo(15, 8.5);
    context.arc(10, 8.5, 5, 0, Math.PI, true);
    context.lineTo(5, 20.5);
    context.stroke();

    context.beginPath();
    context.moveTo(15, 15.5);
    context.lineTo(15, 20.5);
    context.stroke();

    context.beginPath();
    context.moveTo(3.5, 20.5);
    context.lineTo(16.5, 20.5);
    context.stroke();

    context.beginPath();
    context.moveTo(9, 12.75);
    context.lineTo(21, 12.75);
    context.moveTo(18, 9.75);
    context.lineTo(21, 12.75);
    context.lineTo(18, 15.75);
    context.stroke();
  });
  return key;
}
