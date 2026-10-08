import Phaser from 'phaser';
import { COLORS, cssColor } from './theme.js';

export const LIGHT_TEXTURES = {
  glow: 'light:glow',
  star: 'light:star',
  shade: 'light:shade',
  column: 'light:column',
  fadeTop: 'light:fadeTop',
  ribbon: 'light:ribbon',
} as const;

export type LightTexture = (typeof LIGHT_TEXTURES)[keyof typeof LIGHT_TEXTURES];

const GLOW_SIZE_PX = 128;
const STAR_SIZE_PX = 32;
const SHADE_WIDTH_PX = 256;
const SHADE_HEIGHT_PX = 4;
const COLUMN_WIDTH_PX = 16;
const COLUMN_HEIGHT_PX = 256;
const COLUMN_SOLID_START = 0.3;
const RIBBON_WIDTH_PX = 32;
const RIBBON_HEIGHT_PX = 4;
const RIBBON_EDGE_PX = 2;
const RIBBON_CENTER_ALPHA = 0.35;
const NOTE_TEXTURE_WIDTH_PX = 108;
const NOTE_TEXTURE_HEIGHT_PX = 24;
const NOTE_EDGE_PX = 6;
const NOTE_EDGE_BLUR_PX = 8;
/** 게임플레이 TAP·HOLD head·tail 이 함께 쓰는 별단추 캡. body 는 halo 를 뺀 면의 크기다. */
const STAR_BUTTON_BODY_WIDTH_PX = 92;
const STAR_BUTTON_BODY_HEIGHT_PX = 14;
const STAR_BUTTON_PADDING_PX = 8;
const STAR_BUTTON_HALO_BLUR_PX = 5;
const STAR_BUTTON_HALO_ALPHA = 0.3;
const STAR_BUTTON_FACE_LIGHT_STOP = 0.4;
const STAR_BUTTON_GLOSS_ALPHA = 0.9;
const STAR_BUTTON_FRINGE_ALPHA = 0.75;
// 별 홈은 왼쪽 끝 둥근 부분 바로 안쪽에 둔다. 지름 약 6px 의 네 갈래 별이다.
const STAR_BUTTON_NOTCH_INSET_PX = 6;
const STAR_BUTTON_NOTCH_OUTER_RADIUS_PX = 3;
const STAR_BUTTON_NOTCH_INNER_RADIUS_PX = 1;
const STAR_BUTTON_NOTCH_POINTS = 4;
const STAR_BUTTON_NOTCH_HIGHLIGHT_ALPHA = 0.85;
// 리본은 텍스처 폭 그대로 그려 가장자리가 번지지 않게 한다. 폭은 별단추 몸체의 약 82% 다.
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
// 도려내는 원의 위치·크기(반지름 비율). 가는 초승달이 16px 에서도 뭉개지지 않는 두께다.
const CRESCENT_CUT_OFFSET = { x: 0.45, y: -0.2 } as const;
const CRESCENT_CUT_RADIUS = 0.85;
const JUDGE_LINE_TEXTURE_WIDTH_PX = 480;
const JUDGE_LINE_TEXTURE_HEIGHT_PX = 2;
const JUDGE_LINE_SHOULDER = 0.3;
const JUDGE_LINE_SHOULDER_ALPHA = 0.7;

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
  createCanvasTexture(scene, LIGHT_TEXTURES.shade, SHADE_WIDTH_PX, SHADE_HEIGHT_PX, (context) => {
    fillGradient(
      context,
      context.createLinearGradient(0, 0, SHADE_WIDTH_PX, 0),
      [
        [0, 'rgba(0, 0, 0, 1)'],
        [1, 'rgba(0, 0, 0, 0)'],
      ],
      SHADE_WIDTH_PX,
      SHADE_HEIGHT_PX,
    );
  });
  createCanvasTexture(
    scene,
    LIGHT_TEXTURES.column,
    COLUMN_WIDTH_PX,
    COLUMN_HEIGHT_PX,
    (context) => {
      fillGradient(
        context,
        context.createLinearGradient(0, COLUMN_HEIGHT_PX, 0, 0),
        [
          [0, white(1)],
          [1, white(0)],
        ],
        COLUMN_WIDTH_PX,
        COLUMN_HEIGHT_PX,
      );
      // 레인 경계에서 딱 끊기는 상자처럼 보이지 않게 좌우 끝도 감쇠한다.
      maskHorizontally(context, COLUMN_WIDTH_PX, COLUMN_HEIGHT_PX, [
        [0, 0],
        [COLUMN_SOLID_START, 1],
        [1 - COLUMN_SOLID_START, 1],
        [1, 0],
      ]);
    },
  );
  createCanvasTexture(
    scene,
    LIGHT_TEXTURES.fadeTop,
    COLUMN_WIDTH_PX,
    COLUMN_HEIGHT_PX,
    (context) => {
      fillGradient(
        context,
        context.createLinearGradient(0, 0, 0, COLUMN_HEIGHT_PX),
        [
          [0, white(0)],
          [0.3, white(0.55)],
          [0.8, white(1)],
          [1, white(1)],
        ],
        COLUMN_WIDTH_PX,
        COLUMN_HEIGHT_PX,
      );
    },
  );
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

/** 빛 텍스처는 검은 배경 위에 더해지도록 SCREEN 으로 합성한다. */
export function addLight(
  scene: Phaser.Scene,
  texture: LightTexture,
  xPx: number,
  yPx: number,
): Phaser.GameObjects.Image {
  return scene.add.image(xPx, yPx, texture).setBlendMode(Phaser.BlendModes.SCREEN);
}

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

/**
 * 게임플레이 TAP·HOLD head·tail 이 함께 쓰는 진주빛 별단추. 위가 밝고 아래가 은빛인 캡슐 면에
 * 위쪽 광택선, 아래쪽 soft cyan fringe, 얇은 halo, 왼쪽 끝의 작은 별 홈을 더한다. 곡 accent 는 쓰지 않는다.
 */
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

/**
 * HOLD body 의 반투명 리본 단면. 옅은 청회색 면 양쪽 끝에 1px 은빛 선만 둔다.
 * 세로로는 균일해 표시 높이로 늘려 쓴다.
 */
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

/** 판정선 핵. 가운데가 가장 밝은 cool-white 선이 양 끝에서 alpha 0 으로 사라진다. */
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

/**
 * STARLIGHT 채움. 흰 캡슐에 왼쪽이 옅고 끝이 밝은 가로 그러데이션을 넣어 두고, 단계색은 tint 로 입힌다.
 * scaleX 로 길이를 바꾸므로 그러데이션은 늘 채움 끝에서 가장 밝다.
 */
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

/** 진주색 초승달. 원에서 오른쪽 위로 비킨 원을 도려낸다. */
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

function createCanvasTexture(
  scene: Phaser.Scene,
  key: string,
  widthPx: number,
  heightPx: number,
  draw: (context: CanvasRenderingContext2D) => void,
): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const texture = scene.textures.createCanvas(key, widthPx, heightPx);
  if (texture === null) {
    throw new Error(`Failed to create texture: ${key}`);
  }
  draw(texture.getContext());
  texture.refresh();
}

function white(alpha: number): string {
  return `rgba(255, 255, 255, ${alpha})`;
}

function rgba(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 0xff}, ${(color >> 8) & 0xff}, ${color & 0xff}, ${alpha})`;
}

function centeredRadialGradient(context: CanvasRenderingContext2D, sizePx: number): CanvasGradient {
  const center = sizePx / 2;
  return context.createRadialGradient(center, center, 0, center, center, center);
}

/** 바깥·안쪽 꼭짓점이 번갈아 오는 작은 별 경로. 위쪽 꼭짓점에서 시작한다. */
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

/** 이미 그린 내용의 alpha 에 가로 방향 배율을 곱한다. stop 은 [offset, alpha] 이다. */
function maskHorizontally(
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

function fillGradient(
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
