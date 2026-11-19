import type Phaser from 'phaser';
import { requireDefined } from '../../../../invariant.js';
import { getProgress, lerp } from '../../../../range.js';
import { createCanvasTexture } from './canvasTexture.js';
import { PIXEL_BYTES, PIXEL_CHANNEL } from './imagePixels.js';
import { fillGradient, maskHorizontally, rgba, white } from './lightTextures.js';
import { COLORS, cssColor } from '../theme.js';

// 사방 여백은 halo blur 가 잘리지 않을 만큼 둔다.
const STAR_BUTTON_PADDING_PX = 24;
// 밝은 MV 위에서도 노트가 떠 보이도록 면은 명암 없는 흰색으로 두고 푸른 halo 를 두 번 겹쳐 진하게 번지게 한다.
export const NOTE_GLOW_COLOR = 0x6ebeff;
const STAR_BUTTON_HALO_BLUR_PX = 22;
const STAR_BUTTON_HALO_ALPHA = 0.85;
const STAR_BUTTON_HALO_PASSES = 2;
// 별 notch 는 예전 14px 판의 모양을 판 높이에 맞춰 키운 것이다.
const STAR_BUTTON_NOTCH_BASE_HEIGHT_PX = 14;
const STAR_BUTTON_NOTCH_INSET = 6;
const STAR_BUTTON_NOTCH_OUTER_RADIUS = 3;
const STAR_BUTTON_NOTCH_POINTS = 4;
const STAR_BUTTON_NOTCH_HIGHLIGHT_ALPHA = 0.85;

const JUDGE_LINE_TEXTURE_WIDTH_PX = 480;
const JUDGE_LINE_TEXTURE_HEIGHT_PX = 2;
const JUDGE_LINE_SHOULDER = 0.3;
const JUDGE_LINE_SHOULDER_ALPHA = 0.7;

// 면은 유리처럼 가운데가 비치고 양 가장자리로 하늘빛이 차오르게 해 밝은 MV 위에서도 띠 폭이 읽히게 한다.
const HOLD_RIBBON_FILL_COLOR = 0xbee4ff;
const HOLD_RIBBON_GLASS_STOPS = [
  {
    at: 0,
    alpha: 0.42,
  },
  {
    at: 0.22,
    alpha: 0.14,
  },
  {
    at: 0.5,
    alpha: 0.06,
  },
  {
    at: 0.78,
    alpha: 0.14,
  },
  {
    at: 1,
    alpha: 0.42,
  },
] as const;
const HOLD_RIBBON_EDGE_COLOR = 0xebf6ff;
const HOLD_RIBBON_EDGE_ALPHA = 0.95;
const HOLD_RIBBON_GLOW_EDGE_PX = 2;
// 걷어낸 glow 필터(strength 2, distance 12, quality 10)의 바깥 번짐 곡선을 옮긴 값이다.
const HOLD_RIBBON_GLOW_STOPS = [
  {
    distancePx: 0,
    alpha: 0.4,
  },
  {
    distancePx: 1,
    alpha: 0.33,
  },
  {
    distancePx: 2,
    alpha: 0.25,
  },
  {
    distancePx: 4,
    alpha: 0.15,
  },
  {
    distancePx: 6,
    alpha: 0.085,
  },
  {
    distancePx: 8,
    alpha: 0.04,
  },
  {
    distancePx: 11,
    alpha: 0,
  },
] as const;
const HOLD_RIBBON_GLOW_REACH_PX = Math.max(
  ...HOLD_RIBBON_GLOW_STOPS.map(({ distancePx }) => distancePx),
);
// 선형 보간으로 이웃 부분의 색이 번져 들어오지 않게 부분 사이를 비운다.
const HOLD_RIBBON_PART_GAP_PX = 2;
const HOLD_RIBBON_GLASS_TEXTURE_WIDTH_PX = 64;
const HOLD_RIBBON_EDGE_TEXTURE_WIDTH_PX = 4;
// glow 띠는 화면 px 와 텍셀이 1:1 이 되도록 선과 양쪽 번짐 폭 그대로 굽는다.
const HOLD_RIBBON_GLOW_TEXTURE_WIDTH_PX = HOLD_RIBBON_GLOW_EDGE_PX + HOLD_RIBBON_GLOW_REACH_PX * 2;
const HOLD_RIBBON_GLASS_LEFT_PX = HOLD_RIBBON_PART_GAP_PX;
const HOLD_RIBBON_EDGE_LEFT_PX =
  HOLD_RIBBON_GLASS_LEFT_PX + HOLD_RIBBON_GLASS_TEXTURE_WIDTH_PX + HOLD_RIBBON_PART_GAP_PX;
const HOLD_RIBBON_GLOW_LEFT_PX =
  HOLD_RIBBON_EDGE_LEFT_PX + HOLD_RIBBON_EDGE_TEXTURE_WIDTH_PX + HOLD_RIBBON_PART_GAP_PX;
const HOLD_RIBBON_TEXTURE_WIDTH_PX =
  HOLD_RIBBON_GLOW_LEFT_PX + HOLD_RIBBON_GLOW_TEXTURE_WIDTH_PX + HOLD_RIBBON_PART_GAP_PX;
const HOLD_RIBBON_TEXTURE_HEIGHT_PX = 256;

// 판은 원근 사다리꼴·도움말 그림에 늘여 쓰므로 halo·별 비율이 플레이 화면과 같도록 4레인 판정선 위 판 크기로 한 번 굽는다.
const NOTE_CAP_PLATE: NotePlate = {
  widthPx: 184,
  heightPx: 34,
};

export interface StarButtonTextures {
  readonly key: string;
  readonly drainedKey: string;
  readonly widthScale: number;
  readonly heightScale: number;
  /** 판 높이 / 판 폭. */
  readonly plateAspect: number;
}

interface NotePlate {
  readonly widthPx: number;
  readonly heightPx: number;
}

export function ensureStarButtonTextures(scene: Phaser.Scene): StarButtonTextures {
  const plate = NOTE_CAP_PLATE;
  const key = 'light:starButton';
  const drainedKey = 'light:starButton:drained';
  const textureWidthPx = plate.widthPx + STAR_BUTTON_PADDING_PX * 2;
  const textureHeightPx = plate.heightPx + STAR_BUTTON_PADDING_PX * 2;
  createCanvasTexture(
    scene,
    {
      key,
      widthPx: textureWidthPx,
      heightPx: textureHeightPx,
    },
    (context) => paintStarButton(context, plate),
  );
  // Mesh2D 는 타입 선언에 setTint 가 없어 miss drain 색을 nightTrace 를 곱한 텍스처로 바꿔 낸다.
  createCanvasTexture(
    scene,
    {
      key: drainedKey,
      widthPx: textureWidthPx,
      heightPx: textureHeightPx,
    },
    (context) => {
      paintStarButton(context, plate);
      const image = context.getImageData(0, 0, textureWidthPx, textureHeightPx);
      const { data } = image;
      for (let pixel = 0; pixel < data.length; pixel += PIXEL_BYTES) {
        const red = pixel + PIXEL_CHANNEL.red;
        const green = pixel + PIXEL_CHANNEL.green;
        const blue = pixel + PIXEL_CHANNEL.blue;
        const drained = drainColor(
          ((data[red] ?? 0) << 16) | ((data[green] ?? 0) << 8) | (data[blue] ?? 0),
        );
        data[red] = (drained >> 16) & 0xff;
        data[green] = (drained >> 8) & 0xff;
        data[blue] = drained & 0xff;
      }
      context.putImageData(image, 0, 0);
    },
  );
  return {
    key,
    drainedKey,
    widthScale: textureWidthPx / plate.widthPx,
    heightScale: textureHeightPx / plate.heightPx,
    plateAspect: plate.heightPx / plate.widthPx,
  };
}

export function ensureJudgeLineTexture(scene: Phaser.Scene): string {
  const key = 'light:judgeLine';
  createCanvasTexture(
    scene,
    {
      key,
      widthPx: JUDGE_LINE_TEXTURE_WIDTH_PX,
      heightPx: JUDGE_LINE_TEXTURE_HEIGHT_PX,
    },
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

export interface HoldRibbonPart {
  readonly fromU: number;
  readonly toU: number;
}

export interface HoldRibbonTextures {
  readonly key: string;
  readonly drainedKey: string;
  readonly glass: HoldRibbonPart;
  readonly edge: HoldRibbonPart;
  readonly glow: HoldRibbonPart;
  readonly glowLineWidthPx: number;
  readonly glowHalfWidthPx: number;
}

// 세로축은 alpha 단계(그림 위쪽 v = 1 이 1, 아래쪽 v = 0 이 0)라 꼭짓점 v 에 띠 구간의 alpha 를 놓으면
// GPU 보간이 구간 위아래 alpha 를 선형으로 잇는다. 가로축에는 유리 면·가장자리·glow 의 가로 모양을 나란히 둔다.
export function ensureHoldRibbonTextures(scene: Phaser.Scene): HoldRibbonTextures {
  const key = 'light:holdRibbon';
  const drainedKey = 'light:holdRibbon:drained';
  createCanvasTexture(
    scene,
    {
      key,
      widthPx: HOLD_RIBBON_TEXTURE_WIDTH_PX,
      heightPx: HOLD_RIBBON_TEXTURE_HEIGHT_PX,
    },
    (context) => paintHoldRibbon(context, HOLD_RIBBON_FILL_COLOR, HOLD_RIBBON_EDGE_COLOR, true),
  );
  // miss 때는 바랜 띠만 glow 없이 사라진다.
  createCanvasTexture(
    scene,
    {
      key: drainedKey,
      widthPx: HOLD_RIBBON_TEXTURE_WIDTH_PX,
      heightPx: HOLD_RIBBON_TEXTURE_HEIGHT_PX,
    },
    (context) =>
      paintHoldRibbon(
        context,
        drainColor(HOLD_RIBBON_FILL_COLOR),
        drainColor(HOLD_RIBBON_EDGE_COLOR),
        false,
      ),
  );
  const toU = (xPx: number): number => xPx / HOLD_RIBBON_TEXTURE_WIDTH_PX;
  const edgeCenterU = toU(HOLD_RIBBON_EDGE_LEFT_PX + HOLD_RIBBON_EDGE_TEXTURE_WIDTH_PX / 2);
  return {
    key,
    drainedKey,
    // 양 끝 텍셀 가운데에 맞춰 띠 가장자리가 빈 칸과 섞이지 않게 한다.
    glass: {
      fromU: toU(HOLD_RIBBON_GLASS_LEFT_PX + 0.5),
      toU: toU(HOLD_RIBBON_GLASS_LEFT_PX + HOLD_RIBBON_GLASS_TEXTURE_WIDTH_PX - 0.5),
    },
    edge: {
      fromU: edgeCenterU,
      toU: edgeCenterU,
    },
    glow: {
      fromU: toU(HOLD_RIBBON_GLOW_LEFT_PX),
      toU: toU(HOLD_RIBBON_GLOW_LEFT_PX + HOLD_RIBBON_GLOW_TEXTURE_WIDTH_PX),
    },
    glowLineWidthPx: HOLD_RIBBON_GLOW_EDGE_PX,
    glowHalfWidthPx: HOLD_RIBBON_GLOW_TEXTURE_WIDTH_PX / 2,
  };
}

function paintHoldRibbon(
  context: CanvasRenderingContext2D,
  fillColor: number,
  edgeColor: number,
  hasGlow: boolean,
): void {
  const heightPx = HOLD_RIBBON_TEXTURE_HEIGHT_PX;
  const glass = context.createLinearGradient(
    HOLD_RIBBON_GLASS_LEFT_PX + 0.5,
    0,
    HOLD_RIBBON_GLASS_LEFT_PX + HOLD_RIBBON_GLASS_TEXTURE_WIDTH_PX - 0.5,
    0,
  );
  HOLD_RIBBON_GLASS_STOPS.forEach(({ at, alpha }) =>
    glass.addColorStop(at, rgba(fillColor, alpha)),
  );
  context.fillStyle = glass;
  context.fillRect(HOLD_RIBBON_GLASS_LEFT_PX, 0, HOLD_RIBBON_GLASS_TEXTURE_WIDTH_PX, heightPx);
  context.fillStyle = rgba(edgeColor, HOLD_RIBBON_EDGE_ALPHA);
  context.fillRect(HOLD_RIBBON_EDGE_LEFT_PX, 0, HOLD_RIBBON_EDGE_TEXTURE_WIDTH_PX, heightPx);
  if (hasGlow) {
    // 텍셀마다 그 가운데가 선에서 떨어진 거리의 번짐 alpha 로 칠한다. 선 자리는 가장자리 색 그대로다.
    for (let column = 0; column < HOLD_RIBBON_GLOW_TEXTURE_WIDTH_PX; column += 1) {
      const offsetPx = column + 0.5 - HOLD_RIBBON_GLOW_REACH_PX;
      const distancePx = offsetPx < 0 ? -offsetPx : offsetPx - HOLD_RIBBON_GLOW_EDGE_PX;
      context.fillStyle =
        distancePx < 0
          ? rgba(edgeColor, 1)
          : rgba(NOTE_GLOW_COLOR, getHoldRibbonGlowAlpha(distancePx));
      context.fillRect(HOLD_RIBBON_GLOW_LEFT_PX + column, 0, 1, heightPx);
    }
  }
  context.save();
  context.globalCompositeOperation = 'destination-in';
  fillGradient(
    context,
    context.createLinearGradient(0, 0, 0, heightPx),
    [
      [0, white(1)],
      [1, white(0)],
    ],
    HOLD_RIBBON_TEXTURE_WIDTH_PX,
    heightPx,
  );
  context.restore();
}

function getHoldRibbonGlowAlpha(distancePx: number): number {
  const toIndex = HOLD_RIBBON_GLOW_STOPS.findIndex((stop) => stop.distancePx >= distancePx);
  const from = requireDefined(
    HOLD_RIBBON_GLOW_STOPS[toIndex - 1],
    'Glow distance outside the stops',
    distancePx,
  );
  const to = requireDefined(
    HOLD_RIBBON_GLOW_STOPS[toIndex],
    'Glow distance outside the stops',
    distancePx,
  );
  return lerp(from.alpha, to.alpha, getProgress(distancePx, from.distancePx, to.distancePx));
}

function paintStarButton(context: CanvasRenderingContext2D, plate: NotePlate): void {
  const xPx = STAR_BUTTON_PADDING_PX;
  const yPx = STAR_BUTTON_PADDING_PX;
  // 예전 판처럼 양 끝을 반원으로 둥글린다.
  const radiusPx = plate.heightPx / 2;
  const traceBody = (): void => {
    context.beginPath();
    context.roundRect(xPx, yPx, plate.widthPx, plate.heightPx, radiusPx);
  };
  for (let pass = 0; pass < STAR_BUTTON_HALO_PASSES; pass += 1) {
    context.save();
    context.shadowColor = rgba(NOTE_GLOW_COLOR, STAR_BUTTON_HALO_ALPHA);
    context.shadowBlur = STAR_BUTTON_HALO_BLUR_PX;
    context.fillStyle = white(1);
    traceBody();
    context.fill();
    context.restore();
  }

  // 아래로 1px 밀린 밝은 별 위에 은빛 별을 얹어 살짝 눌린 emboss 로 보이게 한다.
  const notchScale = plate.heightPx / STAR_BUTTON_NOTCH_BASE_HEIGHT_PX;
  const notchXPx = xPx + radiusPx + STAR_BUTTON_NOTCH_INSET * notchScale;
  const notchYPx = yPx + plate.heightPx / 2;
  context.fillStyle = white(STAR_BUTTON_NOTCH_HIGHLIGHT_ALPHA);
  traceStar(context, notchXPx, notchYPx + 1, notchScale);
  context.fill();
  context.fillStyle = cssColor(COLORS.noteShade);
  traceStar(context, notchXPx, notchYPx, notchScale);
  context.fill();
}

function traceStar(
  context: CanvasRenderingContext2D,
  centerXPx: number,
  centerYPx: number,
  scale: number,
): void {
  const vertexCount = STAR_BUTTON_NOTCH_POINTS * 2;
  context.beginPath();
  for (let i = 0; i < vertexCount; i++) {
    const radiusPx = (i % 2 === 0 ? STAR_BUTTON_NOTCH_OUTER_RADIUS : 1) * scale;
    const angle = (Math.PI * i) / STAR_BUTTON_NOTCH_POINTS - Math.PI / 2;
    context.lineTo(centerXPx + radiusPx * Math.cos(angle), centerYPx + radiusPx * Math.sin(angle));
  }
  context.closePath();
}

// miss drain 은 색을 채널마다 nightTrace 와 곱해 밤하늘 쪽으로 가라앉힌다.
function drainColor(color: number): number {
  return [16, 8, 0].reduce((product, shift) => {
    const channel = (((color >> shift) & 0xff) * ((COLORS.nightTrace >> shift) & 0xff)) / 0xff;
    return product | (Math.round(channel) << shift);
  }, 0);
}
