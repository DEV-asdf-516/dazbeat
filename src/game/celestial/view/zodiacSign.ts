import type Phaser from 'phaser';
import type { Zodiac } from '../../../data/songs.js';
import { requireDefined } from '../../../invariant.js';
import { getProgress, lerp } from '../../../range.js';
import { ZODIAC_FIGURES, fitZodiacFigure } from '../state/zodiacFigures.js';
import type { SpectralClass } from '../state/zodiacFigures.js';
import { createCanvasTexture } from '../../ui/view/textures/canvasTexture.js';
import { fillFourPointStar } from '../../ui/view/textures/starShapes.js';
import { fillLight, rgba } from '../../ui/view/textures/lightTextures.js';
import { CELESTIAL_COLORS } from '../../ui/view/theme.js';
import { strokeCanvasLine, strokeGrainedCanvasLine } from '../../ui/view/textures/grain.js';

// 알데바란(0.85등급)이 가장 밝고 물고기자리 κ(4.9등급)가 가장 어둡다.
// 실제 등급만 따르면 어두운 별자리가 배경에 묻혀서 가장 어두운 별도 보이게 크기와 불투명도의 아래를 올려 둔다.
const BRIGHTEST_MAGNITUDE = 0.85;
const FAINTEST_MAGNITUDE = 4.9;
const STAR_SIZE_PX = {
  faint: 10,
  bright: 24,
} as const;
const STAR_ALPHA = {
  faint: 0.6,
  bright: 0.95,
} as const;
const GLOW_MIN_BRIGHTNESS = 0.45;
const GLOW_RADIUS_PX = {
  faint: 14,
  bright: 36,
} as const;
const GLOW_MAX_ALPHA = 0.16;
const STAR_CORE_COLOR = 0xffffff;
// 분광형별 실제 별빛 색을 남색 하늘 위에서 튀지 않게 흰빛 쪽으로 옅게 당긴 값.
// 별 한가운데는 실제로도 하얗게 타서 보이므로 색은 심 바깥 번짐과 빛살에만 입힌다.
const SPECTRAL_COLORS: Readonly<Record<SpectralClass, number>> = {
  B: 0xb2ccff,
  A: 0xe0eaff,
  F: 0xfff2dc,
  G: 0xffe4a8,
  K: 0xffcf9c,
  M: 0xffb48e,
};
// 으뜸별에만 십자 빛살을 둘러 별자리의 중심으로 읽히게 한다.
const SPARKLE_RADIUS_SCALE = 0.7;
// 빛살이 별 본체보다 앞서 보이지 않게 별보다 흐리게 둔다.
const SPARKLE_ALPHA_SCALE = 0.55;
const SPARKLE_WAIST = 0.1;
// 심을 너무 밝히면 아래 깔린 하늘색 번짐이 묻혀 순백으로 떠 보이고, 노트 색처럼 따뜻한 흰색은 푸른 하늘 위에서 누렇게 보인다.
const LINE = {
  coreWidthPx: 1.5,
  coreAlpha: 0.7,
  haloWidthPx: 5,
  haloAlpha: 0.2,
  // 넓고 옅은 바깥 번짐을 한 겹 더 둘러 선이 푸른빛으로 빛나 보이게 한다.
  glowWidthPx: 12,
  glowAlpha: 0.07,
} as const;
// 선을 텍스처에 구울 때 가장 넓은 번짐이 잘리지 않게 그림 둘레에 둔다.
export const ZODIAC_LINE_MARGIN_PX = LINE.glowWidthPx;

export interface ZodiacSign {
  textureKey: string;
  /** 빛 여백을 뺀 별자리 자체의 크기. 자리에 맞춰 줄일 때 이 크기를 기준으로 삼는다. 선은 줄이면 번지므로 텍스처에 넣지 않는다. */
  figureWidthPx: number;
  figureHeightPx: number;
}

export function getZodiacSign(scene: Phaser.Scene, zodiac: Zodiac, spanPx: number): ZodiacSign {
  const figure = ZODIAC_FIGURES[zodiac];
  const centered = fitZodiacFigure(figure, 0, 0, spanPx);
  const figureWidthPx = 2 * Math.max(...centered.map(([x]) => Math.abs(x)));
  const figureHeightPx = 2 * Math.max(...centered.map(([, y]) => Math.abs(y)));
  const widthPx = figureWidthPx + GLOW_RADIUS_PX.bright * 2;
  const heightPx = figureHeightPx + GLOW_RADIUS_PX.bright * 2;
  const points = fitZodiacFigure(figure, widthPx / 2, heightPx / 2, spanPx);
  const accentIndex = requireDefined(figure.accentNodeIndices[0], 'Zodiac without accent', zodiac);
  const textureKey = `zodiac-sign:${zodiac}:${spanPx}`;
  createCanvasTexture(
    scene,
    {
      key: textureKey,
      widthPx,
      heightPx,
    },
    (context) => {
      points.forEach(([x, y], index) => {
        const magnitude = requireDefined(
          figure.magnitudes[index],
          'Zodiac star without magnitude',
          index,
        );
        const color =
          SPECTRAL_COLORS[
            requireDefined(
              figure.spectralClasses[index],
              'Zodiac star without spectral class',
              index,
            )
          ];
        const brightness = getProgress(magnitude, FAINTEST_MAGNITUDE, BRIGHTEST_MAGNITUDE);
        // 겉보기 밝기 차이가 크기에서 더 벌어져 보이도록 크기는 제곱으로 키운다.
        const spread = brightness ** 2;
        if (brightness > GLOW_MIN_BRIGHTNESS) {
          fillLight(context, x, y, lerp(GLOW_RADIUS_PX.faint, GLOW_RADIUS_PX.bright, spread), [
            [0, rgba(color, GLOW_MAX_ALPHA * spread)],
            [0.4, rgba(color, GLOW_MAX_ALPHA * spread * 0.45)],
            [1, rgba(color, 0)],
          ]);
        }
        const alpha = lerp(STAR_ALPHA.faint, STAR_ALPHA.bright, brightness);
        const sizePx = lerp(STAR_SIZE_PX.faint, STAR_SIZE_PX.bright, spread);
        fillLight(context, x, y, sizePx / 2, [
          [0, rgba(STAR_CORE_COLOR, alpha)],
          [0.12, rgba(color, alpha)],
          [0.3, rgba(color, alpha * 0.35)],
          [1, rgba(color, 0)],
        ]);
        if (index === accentIndex) {
          context.fillStyle = rgba(color, alpha * SPARKLE_ALPHA_SCALE);
          fillFourPointStar(context, x, y, sizePx * SPARKLE_RADIUS_SCALE, SPARKLE_WAIST);
        }
      });
    },
  );
  return {
    textureKey,
    figureWidthPx,
    figureHeightPx,
  };
}

// 선은 텍스처를 줄이면 번지므로 표시 크기 그대로 그린다.
export function strokeZodiacLine(
  context: CanvasRenderingContext2D,
  fromXPx: number,
  fromYPx: number,
  toXPx: number,
  toYPx: number,
): void {
  const line = {
    fromXPx,
    fromYPx,
    toXPx,
    toYPx,
  };
  strokeCanvasLine(context, line, {
    widthPx: LINE.glowWidthPx,
    color: CELESTIAL_COLORS.selected,
    alpha: LINE.glowAlpha,
  });
  strokeCanvasLine(context, line, {
    widthPx: LINE.haloWidthPx,
    color: CELESTIAL_COLORS.selected,
    alpha: LINE.haloAlpha,
  });
  strokeGrainedCanvasLine(context, line, {
    widthPx: LINE.coreWidthPx,
    color: CELESTIAL_COLORS.highlight,
    alpha: LINE.coreAlpha,
  });
}

export function renderZodiacFigure(
  stars: Phaser.GameObjects.Image,
  lines: Phaser.GameObjects.Image,
  zodiac: Zodiac,
  area: {
    readonly leftXPx: number;
    readonly rightXPx: number;
    readonly topYPx: number;
    readonly bottomYPx: number;
  },
  maxSpanPx: number,
): void {
  const sign = getZodiacSign(stars.scene, zodiac, maxSpanPx);
  const scale = Math.min(
    1,
    (area.rightXPx - area.leftXPx) / sign.figureWidthPx,
    (area.bottomYPx - area.topYPx) / sign.figureHeightPx,
  );
  const centerXPx = (area.leftXPx + area.rightXPx) / 2;
  const centerYPx = (area.topYPx + area.bottomYPx) / 2;
  stars
    .setTexture(sign.textureKey)
    .setScale(scale)
    .setPosition(centerXPx, centerYPx)
    .setVisible(true);
  const figure = ZODIAC_FIGURES[zodiac];
  const spanPx = maxSpanPx * scale;
  const points = fitZodiacFigure(figure, 0, 0, spanPx);
  // 그림 중심에 origin 0.5 로 두므로 중심이 픽셀 경계에 오도록 짝수 크기로 굽는다.
  const widthPx =
    Math.ceil(Math.max(...points.map(([x]) => Math.abs(x))) + ZODIAC_LINE_MARGIN_PX) * 2;
  const heightPx =
    Math.ceil(Math.max(...points.map(([, y]) => Math.abs(y))) + ZODIAC_LINE_MARGIN_PX) * 2;
  const linesTextureKey = `zodiacLines:${zodiac}:${spanPx}`;
  createCanvasTexture(
    lines.scene,
    {
      key: linesTextureKey,
      widthPx,
      heightPx,
    },
    (context) => {
      context.translate(widthPx / 2, heightPx / 2);
      for (const [from, to] of figure.edges) {
        const [fromXPx, fromYPx] = requireDefined(
          points[from],
          'Zodiac edge outside the figure',
          from,
        );
        const [toXPx, toYPx] = requireDefined(points[to], 'Zodiac edge outside the figure', to);
        strokeZodiacLine(context, fromXPx, fromYPx, toXPx, toYPx);
      }
    },
  );
  lines.setTexture(linesTextureKey).setPosition(centerXPx, centerYPx).setVisible(true);
}
