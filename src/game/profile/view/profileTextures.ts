import type Phaser from 'phaser';
import { createCanvasTexture } from '../../ui/view/textures/canvasTexture.js';
import { ICON_GRAIN, applyGrain } from '../../ui/view/textures/grain.js';
import { COLORS, cssColor } from '../../ui/view/theme.js';

const CHEVRON_HALF_HEIGHT_PX = 9;
const CHEVRON_STROKE_PX = 2;
const ROW_CHEVRON_TEXTURE_KEY = 'ui:profile-row-chevron';

export function ensureRowChevronTexture(scene: Phaser.Scene): string {
  const widthPx = CHEVRON_HALF_HEIGHT_PX + CHEVRON_STROKE_PX * 2;
  const heightPx = CHEVRON_HALF_HEIGHT_PX * 2 + CHEVRON_STROKE_PX * 2;
  createCanvasTexture(
    scene,
    {
      key: ROW_CHEVRON_TEXTURE_KEY,
      widthPx,
      heightPx,
    },
    (context) => {
      context.strokeStyle = cssColor(COLORS.textSecondary);
      context.lineWidth = CHEVRON_STROKE_PX;
      context.beginPath();
      context.moveTo(CHEVRON_STROKE_PX, CHEVRON_STROKE_PX);
      context.lineTo(CHEVRON_STROKE_PX + CHEVRON_HALF_HEIGHT_PX, heightPx / 2);
      context.lineTo(CHEVRON_STROKE_PX, heightPx - CHEVRON_STROKE_PX);
      context.stroke();
      applyGrain(context, widthPx, heightPx, ICON_GRAIN);
    },
  );
  return ROW_CHEVRON_TEXTURE_KEY;
}
