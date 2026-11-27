import type Phaser from 'phaser';
import type { PointerActions } from '../input/hoverTarget.js';
import { createCanvasTexture } from '../textures/canvasTexture.js';
import { COLORS, cssColor } from '../theme.js';
import { AUXILIARY_BUTTON } from './auxiliaryButton.js';
import { Button } from './Button.js';

const GRID_UNITS = 24;
const CROSS_START = 6;
const CROSS_END = 18;
const LINE_WIDTH = 2;
const BUTTON_ICON_SIZE_PX = 24;

export function getCloseIconTexture(scene: Phaser.Scene, sizePx: number): string {
  const key = `close-icon:${sizePx}`;
  createCanvasTexture(
    scene,
    {
      key,
      widthPx: sizePx,
      heightPx: sizePx,
    },
    (context) => {
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
    },
  );
  return key;
}

export function createCloseIconButton(
  scene: Phaser.Scene,
  centerYPx: number,
  pointer: PointerActions,
): Button {
  return new Button(scene, 0, centerYPx - AUXILIARY_BUTTON.heightPx / 2, {
    ...AUXILIARY_BUTTON,
    label: '',
    pointer,
  }).setContent({
    kind: 'icon',
    textureKey: getCloseIconTexture(scene, BUTTON_ICON_SIZE_PX),
    sizePx: BUTTON_ICON_SIZE_PX,
  });
}
