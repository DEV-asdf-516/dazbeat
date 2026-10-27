import Phaser from 'phaser';
import { createCanvasTexture } from './canvasTexture.js';

export const LIGHT_TEXTURES = {
  glow: 'light:glow',
  star: 'light:star',
  ribbon: 'light:ribbon',
} as const;

export type LightTexture = (typeof LIGHT_TEXTURES)[keyof typeof LIGHT_TEXTURES];

const GLOW_SIZE_PX = 128;
const STAR_SIZE_PX = 32;
const RIBBON_WIDTH_PX = 32;
const RIBBON_HEIGHT_PX = 4;
const RIBBON_EDGE_PX = 2;
const RIBBON_CENTER_ALPHA = 0.35;

export function ensureLightTextures(scene: Phaser.Scene): void {
  createCanvasTexture(scene, LIGHT_TEXTURES.glow, GLOW_SIZE_PX, GLOW_SIZE_PX, (context) => {
    fillGradient(
      context,
      centeredRadialGradient(context, GLOW_SIZE_PX),
      [
        [0, white(1)],
        [0.4, white(0.45)],
        [1, white(0)],
      ],
      GLOW_SIZE_PX,
      GLOW_SIZE_PX,
    );
  });
  createCanvasTexture(scene, LIGHT_TEXTURES.star, STAR_SIZE_PX, STAR_SIZE_PX, (context) => {
    fillGradient(
      context,
      centeredRadialGradient(context, STAR_SIZE_PX),
      [
        [0, white(1)],
        [0.12, white(1)],
        [0.3, white(0.35)],
        [1, white(0)],
      ],
      STAR_SIZE_PX,
      STAR_SIZE_PX,
    );
  });
  createCanvasTexture(
    scene,
    LIGHT_TEXTURES.ribbon,
    RIBBON_WIDTH_PX,
    RIBBON_HEIGHT_PX,
    (context) => {
      context.fillStyle = white(RIBBON_CENTER_ALPHA);
      context.fillRect(0, 0, RIBBON_WIDTH_PX, RIBBON_HEIGHT_PX);
      context.fillStyle = white(1);
      context.fillRect(0, 0, RIBBON_EDGE_PX, RIBBON_HEIGHT_PX);
      context.fillRect(RIBBON_WIDTH_PX - RIBBON_EDGE_PX, 0, RIBBON_EDGE_PX, RIBBON_HEIGHT_PX);
    },
  );
}

export function addLight(
  scene: Phaser.Scene,
  texture: LightTexture,
  xPx: number,
  yPx: number,
): Phaser.GameObjects.Image {
  return scene.add.image(xPx, yPx, texture).setBlendMode(Phaser.BlendModes.SCREEN);
}

export function white(alpha: number): string {
  return `rgba(255, 255, 255, ${alpha})`;
}

export function rgba(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 0xff}, ${(color >> 8) & 0xff}, ${color & 0xff}, ${alpha})`;
}

function centeredRadialGradient(context: CanvasRenderingContext2D, sizePx: number): CanvasGradient {
  const center = sizePx / 2;
  return context.createRadialGradient(center, center, 0, center, center, center);
}

export function maskHorizontally(
  context: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  stops: readonly (readonly [offset: number, alpha: number])[],
): void {
  context.save();
  context.globalCompositeOperation = 'destination-in';
  fillGradient(
    context,
    context.createLinearGradient(0, 0, widthPx, 0),
    stops.map(([offset, alpha]) => [offset, white(alpha)] as const),
    widthPx,
    heightPx,
  );
  context.restore();
}

export function fillGradient(
  context: CanvasRenderingContext2D,
  gradient: CanvasGradient,
  stops: readonly (readonly [offset: number, color: string])[],
  widthPx: number,
  heightPx: number,
): void {
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  context.fillStyle = gradient;
  context.fillRect(0, 0, widthPx, heightPx);
}
