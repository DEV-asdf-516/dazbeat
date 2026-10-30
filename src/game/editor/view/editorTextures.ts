import type Phaser from 'phaser';
import { createCanvasTexture } from '../ui/canvasTexture.js';
import { COLORS, cssColor } from '../ui/theme.js';

const NOTE_TEXTURE_WIDTH_PX = 108;
const NOTE_TEXTURE_HEIGHT_PX = 24;
const NOTE_EDGE_PX = 6;
const NOTE_EDGE_BLUR_PX = 8;

export function ensureNoteTexture(scene: Phaser.Scene, accentColor: number): string {
  const key = `light:note:${cssColor(accentColor)}`;
  createCanvasTexture(scene, key, NOTE_TEXTURE_WIDTH_PX, NOTE_TEXTURE_HEIGHT_PX, (context) => {
    // core 를 가장자리에서 안쪽으로 들인 뒤 accent shadow 로 번지게 해 soft edge 가 텍스처 안에 머물게 한다.
    context.shadowColor = cssColor(accentColor);
    context.shadowBlur = NOTE_EDGE_BLUR_PX;
    context.fillStyle = cssColor(COLORS.note);
    context.fillRect(
      NOTE_EDGE_PX,
      NOTE_EDGE_PX,
      NOTE_TEXTURE_WIDTH_PX - NOTE_EDGE_PX * 2,
      NOTE_TEXTURE_HEIGHT_PX - NOTE_EDGE_PX * 2,
    );
  });
  return key;
}
