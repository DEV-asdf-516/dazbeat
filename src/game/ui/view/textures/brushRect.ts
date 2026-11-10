import type Phaser from 'phaser';
import { createCanvasTexture } from './canvasTexture.js';
import { applyGrain } from './grain.js';
import { rgba } from './lightTextures.js';

// 밑줄의 꼬리에서 머리로 옅어지는 붓 자국처럼 왼쪽 위에서 오른쪽 아래로 옅어지게 한다.
const FILL_START_RATIO = 1.3;
const FILL_END_RATIO = 0.85;
const BORDER_END_RATIO = 0.55;
const GRAIN = {
  cellPx: 2,
  minAlpha: 0.72,
} as const;

export interface BrushRectLook {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly radiusPx: number;
  readonly fillColor: number;
  readonly fillAlpha: number;
  // 글자를 얹는 버튼 면은 입자가 끼면 지저분해 보여 단색으로 두고 테두리에만 결을 낸다.
  readonly isFillSolid?: boolean;
  readonly border: {
    readonly color: number;
    readonly alpha: number;
    readonly widthPx: number;
  } | null;
}

export function getBrushRectTexture(scene: Phaser.Scene, look: BrushRectLook): string {
  const { widthPx, heightPx, radiusPx, fillColor, fillAlpha, isFillSolid = false, border } = look;
  const borderKey = border === null ? 'none' : `${border.color}:${border.alpha}:${border.widthPx}`;
  const key = `brush-rect:${widthPx}:${heightPx}:${radiusPx}:${fillColor}:${fillAlpha}:${isFillSolid}:${borderKey}`;
  createCanvasTexture(scene, key, Math.ceil(widthPx), Math.ceil(heightPx), (context) => {
    const fill = context.createLinearGradient(0, 0, widthPx, heightPx);
    fill.addColorStop(0, rgba(fillColor, Math.min(1, fillAlpha * FILL_START_RATIO)));
    fill.addColorStop(1, rgba(fillColor, fillAlpha * FILL_END_RATIO));
    const insetPx = (border?.widthPx ?? 0) / 2;
    context.beginPath();
    context.roundRect(insetPx, insetPx, widthPx - insetPx * 2, heightPx - insetPx * 2, radiusPx);
    if (!isFillSolid) {
      context.fillStyle = fill;
      context.fill();
    }
    if (border !== null) {
      const stroke = context.createLinearGradient(0, 0, widthPx, heightPx);
      stroke.addColorStop(0, rgba(border.color, border.alpha));
      stroke.addColorStop(1, rgba(border.color, border.alpha * BORDER_END_RATIO));
      context.strokeStyle = stroke;
      context.lineWidth = border.widthPx;
      context.stroke();
    }
    applyGrain(context, widthPx, heightPx, GRAIN);
    if (isFillSolid) {
      context.globalCompositeOperation = 'destination-over';
      context.fillStyle = rgba(fillColor, fillAlpha);
      context.beginPath();
      context.roundRect(insetPx, insetPx, widthPx - insetPx * 2, heightPx - insetPx * 2, radiusPx);
      context.fill();
    }
  });
  return key;
}

export function addBrushRect(scene: Phaser.Scene, look: BrushRectLook): Phaser.GameObjects.Image {
  return scene.add.image(0, 0, getBrushRectTexture(scene, look));
}
