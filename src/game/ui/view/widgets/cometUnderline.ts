import type Phaser from 'phaser';
import { lerp } from '../../../../range.js';
import { createCanvasTexture } from '../textures/canvasTexture.js';
import { white } from '../textures/lightTextures.js';
import { INDICATOR } from '../theme.js';

const TEXTURE_WIDTH_PX = 240;
const TEXTURE_PADDING_Y_PX = 1;
const TIP_LENGTH_RATIO = 7 / 3;
const EDGE_WOBBLE_RATIO = 0.02;
const EDGE_STEP_PX = 3;
// 오른쪽 끝에서만 머리 밝기로 바뀌게 하는 지점. 그 앞은 꼬리에서 불투명으로 고르게 밝아진다.
const HEAD_FADE_START = 0.85;
// 버튼 밑줄은 오른쪽으로 갈수록 살짝 가늘어지고 끝만 살짝 흐리게 끝난다.
const TEXT_UNDERLINE_HEAD_THICKNESS_PX = 1.5;
const TEXT_UNDERLINE_HEAD_ALPHA = 0.45;

export interface CometUnderlineLook {
  readonly tailThicknessPx: number;
  readonly headThicknessPx: number;
  readonly tailAlpha: number;
  readonly headAlpha: number;
}

function getCometUnderlineTexture(scene: Phaser.Scene, look: CometUnderlineLook): string {
  const { tailThicknessPx, headThicknessPx, tailAlpha, headAlpha } = look;
  const key = `comet-underline:${tailThicknessPx}:${headThicknessPx}:${tailAlpha}:${headAlpha}`;
  const heightPx = Math.ceil(Math.max(tailThicknessPx, headThicknessPx)) + TEXTURE_PADDING_Y_PX * 2;
  createCanvasTexture(scene, key, TEXTURE_WIDTH_PX, heightPx, (context) => {
    const centerYPx = heightPx / 2;
    const edgeYPx = (xPx: number, side: 1 | -1): number => {
      const thicknessPx = lerp(tailThicknessPx, headThicknessPx, xPx / TEXTURE_WIDTH_PX);
      const tip = Math.sqrt(
        Math.min(1, Math.min(xPx, TEXTURE_WIDTH_PX - xPx) / (headThicknessPx * TIP_LENGTH_RATIO)),
      );
      const wobblePx =
        headThicknessPx *
        EDGE_WOBBLE_RATIO *
        (Math.sin(xPx * 0.04 + side) + Math.sin(xPx * 0.11 + side * 2));
      return centerYPx + side * tip * (thicknessPx / 2 + wobblePx);
    };
    context.beginPath();
    context.moveTo(0, centerYPx);
    for (let xPx = 0; xPx <= TEXTURE_WIDTH_PX; xPx += EDGE_STEP_PX) {
      context.lineTo(xPx, edgeYPx(xPx, -1));
    }
    for (let xPx = TEXTURE_WIDTH_PX; xPx >= 0; xPx -= EDGE_STEP_PX) {
      context.lineTo(xPx, edgeYPx(xPx, 1));
    }
    context.closePath();
    const fade = context.createLinearGradient(0, 0, TEXTURE_WIDTH_PX, 0);
    fade.addColorStop(0, white(tailAlpha));
    fade.addColorStop(HEAD_FADE_START, white(lerp(tailAlpha, 1, HEAD_FADE_START)));
    fade.addColorStop(1, white(headAlpha));
    context.fillStyle = fade;
    context.fill();
  });
  return key;
}

export function addCometUnderline(
  scene: Phaser.Scene,
  look: CometUnderlineLook,
): Phaser.GameObjects.Image {
  return scene.add.image(0, 0, getCometUnderlineTexture(scene, look)).setOrigin(0, 0.5);
}

export function addTextUnderline(
  scene: Phaser.Scene,
  text: Phaser.GameObjects.Text,
  color: number,
): Phaser.GameObjects.Image {
  const underline = addCometUnderline(scene, {
    tailThicknessPx: INDICATOR.underlineThicknessPx,
    headThicknessPx: TEXT_UNDERLINE_HEAD_THICKNESS_PX,
    tailAlpha: 1,
    headAlpha: TEXT_UNDERLINE_HEAD_ALPHA,
  }).setTint(color);
  return placeTextUnderline(underline, text);
}

export function placeTextUnderline(
  underline: Phaser.GameObjects.Image,
  text: Phaser.GameObjects.Text,
): Phaser.GameObjects.Image {
  const bottomLeft = text.getBottomLeft();
  return underline
    .setPosition(
      bottomLeft.x,
      bottomLeft.y + INDICATOR.underlineOffsetPx + INDICATOR.underlineThicknessPx / 2,
    )
    .setDisplaySize(text.width, underline.height);
}
