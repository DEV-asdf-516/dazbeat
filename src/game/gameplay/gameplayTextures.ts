import type Phaser from 'phaser';
import { createCanvasTexture } from '../ui/canvasTexture.js';
import { fillGradient, maskHorizontally, rgba, white } from '../ui/lightTextures.js';
import { COLORS, cssColor } from '../ui/theme.js';

const STAR_BUTTON_BODY_WIDTH_PX = 92;
const STAR_BUTTON_BODY_HEIGHT_PX = 14;
const STAR_BUTTON_PADDING_PX = 8;
const STAR_BUTTON_HALO_BLUR_PX = 5;
const STAR_BUTTON_HALO_ALPHA = 0.3;
const STAR_BUTTON_FACE_LIGHT_STOP = 0.4;
const STAR_BUTTON_GLOSS_ALPHA = 0.9;
const STAR_BUTTON_FRINGE_ALPHA = 0.75;
const STAR_BUTTON_NOTCH_INSET_PX = 6;
const STAR_BUTTON_NOTCH_OUTER_RADIUS_PX = 3;
const STAR_BUTTON_NOTCH_INNER_RADIUS_PX = 1;
const STAR_BUTTON_NOTCH_POINTS = 4;
const STAR_BUTTON_NOTCH_HIGHLIGHT_ALPHA = 0.85;
// 리본은 텍스처 폭 그대로 그려 가장자리가 번지지 않게 한다.
const HOLD_RIBBON_TEXTURE_WIDTH_PX = 76;
const HOLD_RIBBON_TEXTURE_HEIGHT_PX = 4;
const HOLD_RIBBON_EDGE_PX = 1;
// 면은 어둡고 옅게 물려 캡과 판정선보다 뒤로 물러나 보이게 하고, 가장자리만 차가운 은빛 선으로 남긴다.
const HOLD_RIBBON_FILL_COLOR = 0x82a4c0;
const HOLD_RIBBON_FILL_ALPHA = 0.24;
const HOLD_RIBBON_EDGE_COLOR = 0xcfe4f0;
const HOLD_RIBBON_EDGE_ALPHA = 0.4;
// 채움 꼬리가 너무 꺼지면 짧은 채움(위험 단계)이 읽히지 않으므로 절반 남짓만 물린다.
const STARLIGHT_FILL_TAIL_ALPHA = 0.55;
// 가는 초승달이 16px 에서도 뭉개지지 않는 두께다.
const CRESCENT_CUT_OFFSET = {
  x: 0.45,
  y: -0.2,
} as const;
const CRESCENT_CUT_RADIUS = 0.85;
const JUDGE_LINE_TEXTURE_WIDTH_PX = 480;
const JUDGE_LINE_TEXTURE_HEIGHT_PX = 2;
const JUDGE_LINE_SHOULDER = 0.3;
const JUDGE_LINE_SHOULDER_ALPHA = 0.7;

export function ensureStarButtonTexture(scene: Phaser.Scene): string {
  const key = 'light:starButton';
  createCanvasTexture(
    scene,
    key,
    STAR_BUTTON_BODY_WIDTH_PX + STAR_BUTTON_PADDING_PX * 2,
    STAR_BUTTON_BODY_HEIGHT_PX + STAR_BUTTON_PADDING_PX * 2,
    (context) => {
      const xPx = STAR_BUTTON_PADDING_PX;
      const yPx = STAR_BUTTON_PADDING_PX;
      const radiusPx = STAR_BUTTON_BODY_HEIGHT_PX / 2;
      const traceBody = (): void => {
        context.beginPath();
        context.roundRect(
          xPx,
          yPx,
          STAR_BUTTON_BODY_WIDTH_PX,
          STAR_BUTTON_BODY_HEIGHT_PX,
          radiusPx,
        );
      };
      // halo 는 면의 그림자로만 만들고, 그 위를 gradient 면으로 다시 덮어 면 안쪽에는 남지 않게 한다.
      context.save();
      context.shadowColor = rgba(COLORS.holdRibbon, STAR_BUTTON_HALO_ALPHA);
      context.shadowBlur = STAR_BUTTON_HALO_BLUR_PX;
      context.fillStyle = cssColor(COLORS.note);
      traceBody();
      context.fill();
      context.restore();

      const face = context.createLinearGradient(0, yPx, 0, yPx + STAR_BUTTON_BODY_HEIGHT_PX);
      face.addColorStop(0, white(1));
      face.addColorStop(STAR_BUTTON_FACE_LIGHT_STOP, cssColor(COLORS.note));
      face.addColorStop(1, cssColor(COLORS.noteShade));
      context.fillStyle = face;
      traceBody();
      context.fill();

      // 광택선과 fringe 는 둥근 끝을 넘지 않도록 직선 구간에만 긋는다.
      const lineWidthPx = STAR_BUTTON_BODY_WIDTH_PX - radiusPx * 2;
      context.fillStyle = white(STAR_BUTTON_GLOSS_ALPHA);
      context.fillRect(xPx + radiusPx, yPx + 1, lineWidthPx, 1);
      context.fillStyle = rgba(COLORS.holdRibbon, STAR_BUTTON_FRINGE_ALPHA);
      context.fillRect(xPx + radiusPx, yPx + STAR_BUTTON_BODY_HEIGHT_PX - 1, lineWidthPx, 1);

      // 아래로 1px 밀린 밝은 별 위에 은빛 별을 얹어 살짝 눌린 emboss 로 보이게 한다.
      const notchXPx = xPx + radiusPx + STAR_BUTTON_NOTCH_INSET_PX;
      const notchYPx = yPx + radiusPx;
      context.fillStyle = white(STAR_BUTTON_NOTCH_HIGHLIGHT_ALPHA);
      traceStar(context, notchXPx, notchYPx + 1);
      context.fill();
      context.fillStyle = cssColor(COLORS.noteShade);
      traceStar(context, notchXPx, notchYPx);
      context.fill();
    },
  );
  return key;
}

export function ensureHoldRibbonTexture(scene: Phaser.Scene): string {
  const key = 'light:holdRibbon';
  createCanvasTexture(
    scene,
    key,
    HOLD_RIBBON_TEXTURE_WIDTH_PX,
    HOLD_RIBBON_TEXTURE_HEIGHT_PX,
    (context) => {
      // 면과 가장자리를 겹치지 않게 칠해 각 열의 alpha 가 정한 값 그대로 남게 한다.
      const edgeRightXPx = HOLD_RIBBON_TEXTURE_WIDTH_PX - HOLD_RIBBON_EDGE_PX;
      context.fillStyle = rgba(HOLD_RIBBON_FILL_COLOR, HOLD_RIBBON_FILL_ALPHA);
      context.fillRect(
        HOLD_RIBBON_EDGE_PX,
        0,
        edgeRightXPx - HOLD_RIBBON_EDGE_PX,
        HOLD_RIBBON_TEXTURE_HEIGHT_PX,
      );
      context.fillStyle = rgba(HOLD_RIBBON_EDGE_COLOR, HOLD_RIBBON_EDGE_ALPHA);
      context.fillRect(0, 0, HOLD_RIBBON_EDGE_PX, HOLD_RIBBON_TEXTURE_HEIGHT_PX);
      context.fillRect(edgeRightXPx, 0, HOLD_RIBBON_EDGE_PX, HOLD_RIBBON_TEXTURE_HEIGHT_PX);
    },
  );
  return key;
}

export function ensureJudgeLineTexture(scene: Phaser.Scene): string {
  const key = 'light:judgeLine';
  createCanvasTexture(
    scene,
    key,
    JUDGE_LINE_TEXTURE_WIDTH_PX,
    JUDGE_LINE_TEXTURE_HEIGHT_PX,
    (context) => {
      fillGradient(
        context,
        context.createLinearGradient(0, 0, JUDGE_LINE_TEXTURE_WIDTH_PX, 0),
        [
          [0, cssColor(COLORS.noteShade)],
          [0.5, white(1)],
          [1, cssColor(COLORS.noteShade)],
        ],
        JUDGE_LINE_TEXTURE_WIDTH_PX,
        JUDGE_LINE_TEXTURE_HEIGHT_PX,
      );
      maskHorizontally(context, JUDGE_LINE_TEXTURE_WIDTH_PX, JUDGE_LINE_TEXTURE_HEIGHT_PX, [
        [0, 0],
        [JUDGE_LINE_SHOULDER, JUDGE_LINE_SHOULDER_ALPHA],
        [0.5, 1],
        [1 - JUDGE_LINE_SHOULDER, JUDGE_LINE_SHOULDER_ALPHA],
        [1, 0],
      ]);
    },
  );
  return key;
}

// scaleX 로 길이를 바꾸므로 그러데이션은 늘 채움 끝에서 가장 밝다.
export function ensureStarlightFillTexture(
  scene: Phaser.Scene,
  widthPx: number,
  heightPx: number,
): string {
  const key = `light:starlightFill:${widthPx}x${heightPx}`;
  createCanvasTexture(scene, key, widthPx, heightPx, (context) => {
    const gradient = context.createLinearGradient(0, 0, widthPx, 0);
    gradient.addColorStop(0, white(STARLIGHT_FILL_TAIL_ALPHA));
    gradient.addColorStop(1, white(1));
    context.fillStyle = gradient;
    context.beginPath();
    context.roundRect(0, 0, widthPx, heightPx, heightPx / 2);
    context.fill();
  });
  return key;
}

export function ensureCrescentTexture(scene: Phaser.Scene, sizePx: number): string {
  const key = `light:crescent:${sizePx}`;
  createCanvasTexture(scene, key, sizePx, sizePx, (context) => {
    const radiusPx = sizePx / 2;
    context.fillStyle = cssColor(COLORS.note);
    context.beginPath();
    context.arc(radiusPx, radiusPx, radiusPx, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = 'destination-out';
    context.beginPath();
    context.arc(
      radiusPx + radiusPx * CRESCENT_CUT_OFFSET.x,
      radiusPx + radiusPx * CRESCENT_CUT_OFFSET.y,
      radiusPx * CRESCENT_CUT_RADIUS,
      0,
      Math.PI * 2,
    );
    context.fill();
  });
  return key;
}

function traceStar(context: CanvasRenderingContext2D, centerXPx: number, centerYPx: number): void {
  const vertexCount = STAR_BUTTON_NOTCH_POINTS * 2;
  context.beginPath();
  for (let i = 0; i < vertexCount; i++) {
    const radiusPx =
      i % 2 === 0 ? STAR_BUTTON_NOTCH_OUTER_RADIUS_PX : STAR_BUTTON_NOTCH_INNER_RADIUS_PX;
    const angle = (Math.PI * i) / STAR_BUTTON_NOTCH_POINTS - Math.PI / 2;
    context.lineTo(centerXPx + radiusPx * Math.cos(angle), centerYPx + radiusPx * Math.sin(angle));
  }
  context.closePath();
}
