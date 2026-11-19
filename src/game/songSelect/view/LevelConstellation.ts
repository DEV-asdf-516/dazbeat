import Phaser from 'phaser';
import { FULL_CHART_LEVEL_RANGE } from '../../../data/songs.js';
import type { ChartLevel } from '../../../data/songs.js';
import { requireDefined } from '../../../invariant.js';
import { clamp, getProgress } from '../../../range.js';
import { createCanvasTexture } from '../../ui/view/textures/canvasTexture.js';
import { fillLight, rgba } from '../../ui/view/textures/lightTextures.js';
import { fillFourPointStar } from '../../ui/view/textures/starShapes.js';
import { CELESTIAL_COLORS, typeStyle } from '../../ui/view/theme.js';

// 목록의 "—" 는 별자리보다 4px 오른쪽, 제목 글자 왼쪽 끝 근처에서 시작한다.
const SCALE = 1.3;
const DASH = {
  type: {
    sizePx: 18,
    weight: 700,
  },
  offsetXPx: 4,
} as const;

const STAR_COUNT = 5;
const FIRST_STAR_X = 5;
const STAR_STEP_X = 11.5;
// 오른쪽 위로 오르는 고정 배치. 세로는 가운데 기준이고 위가 음수다.
const STAR_OFFSETS_Y = [3, 0.5, 1.5, -1.8, -3.2];
const STAR_SIZE_RATIOS = [0.8, 0.85, 0.9, 1, 1.15];
const STAR_RADIUS = 9;
const STAR_RADIUS_RATIO = 0.8;
const HALF_STAR_RADIUS_RATIO = 0.7;
const HALF_STAR_ALPHA_RATIO = 0.55;
const STAR_CORE_COLOR = 0xe2f4ff;
const BRIGHTNESS = {
  base: 0.8625,
  step: 0.034375,
} as const;
const SIZE_FACTOR = {
  base: 0.88,
  step: 0.06,
} as const;
const MAX_STEP = 4;
// 레벨이 오를수록 달빛 파랑에서 밝은 하늘빛으로 옮겨 간다.
const LEVEL_COLORS = {
  low: 0x8fb8e2,
  middle: 0xacd9f0,
  high: 0xd2eefc,
} as const;
const LINE = {
  halo: {
    color: 0xacd9f0,
    alpha: 0.07,
    width: 2,
  },
  core: {
    color: 0xc6e6f8,
    alpha: 0.75,
    width: 1,
  },
  halfStepRatio: 0.45,
} as const;
const SPARKLE = {
  radiusRatio: 0.7,
  waist: 0.14,
  color: 0xd6eefc,
  alpha: 0.62,
} as const;

function interpolateColor(from: number, to: number, t: number): number {
  const color = Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.ValueToColor(from),
    Phaser.Display.Color.ValueToColor(to),
    1,
    t,
  );
  return Phaser.Display.Color.GetColor(color.r, color.g, color.b);
}

export function getLevelColor(level: ChartLevel): number {
  return level <= 3
    ? interpolateColor(
        LEVEL_COLORS.low,
        LEVEL_COLORS.middle,
        getProgress(level, FULL_CHART_LEVEL_RANGE.min, 3),
      )
    : interpolateColor(
        LEVEL_COLORS.middle,
        LEVEL_COLORS.high,
        getProgress(level, 3, FULL_CHART_LEVEL_RANGE.max),
      );
}

function getStarOffsetY(index: number): number {
  return requireDefined(STAR_OFFSETS_Y[index], 'Level star outside the figure', index);
}

function ensureLevelTexture(
  scene: Phaser.Scene,
  level: ChartLevel,
): { readonly key: string; readonly paddingPx: number } {
  const scale = SCALE;
  // 가장 큰 별(레벨 5 의 끝 별)의 번짐이 잘리지 않게 둘레에 둔다.
  const paddingPx = Math.ceil(
    STAR_RADIUS *
      scale *
      Math.max(...STAR_SIZE_RATIOS) *
      STAR_RADIUS_RATIO *
      (SIZE_FACTOR.base + SIZE_FACTOR.step * MAX_STEP),
  );
  const key = `levelConstellation:${level}`;
  const lastStarX = FIRST_STAR_X + STAR_STEP_X * (STAR_COUNT - 1);
  const widthPx = Math.ceil(lastStarX * scale) + paddingPx * 2;
  // 세로 가운데에 origin 0.5 로 두므로 중심이 픽셀 경계에 오도록 짝수 크기로 굽는다.
  const heightPx =
    Math.ceil(Math.max(...STAR_OFFSETS_Y.map((offset) => Math.abs(offset))) * scale + paddingPx) *
    2;
  createCanvasTexture(
    scene,
    {
      key,
      widthPx,
      heightPx,
    },
    (context) => {
      const step = clamp(level - 1, 0, MAX_STEP);
      const brightness = BRIGHTNESS.base + BRIGHTNESS.step * step;
      const sizeFactor = SIZE_FACTOR.base + SIZE_FACTOR.step * step;
      const color = getLevelColor(level);
      const getX = (index: number): number =>
        paddingPx + (FIRST_STAR_X + STAR_STEP_X * index) * scale;
      const getY = (index: number): number => heightPx / 2 + getStarOffsetY(index) * scale;
      context.lineCap = 'round';
      // 한 캔버스에 칠한 순서가 곧 겹침 순서라, 선을 모두 그은 뒤 별을 칠해야 다음 선이 앞 별의 빛 위를 덮지 않는다.
      for (let index = 0; index < STAR_COUNT - 1; index += 1) {
        const reach = level - (index + 1);
        if (reach <= 0) {
          break;
        }
        const strength = (reach < 1 ? LINE.halfStepRatio : 1) * brightness;
        [LINE.halo, LINE.core].forEach(({ color: lineColor, alpha, width }) => {
          context.strokeStyle = rgba(lineColor, alpha * strength);
          context.lineWidth = width * scale;
          context.beginPath();
          context.moveTo(getX(index), getY(index));
          context.lineTo(getX(index + 1), getY(index + 1));
          context.stroke();
        });
      }
      for (let index = 0; index < STAR_COUNT; index += 1) {
        const fill = Math.min(1, level - index);
        if (fill <= 0) {
          break;
        }
        const isHalf = fill < 1;
        const radius =
          STAR_RADIUS *
          scale *
          requireDefined(STAR_SIZE_RATIOS[index], 'Level star outside the figure', index) *
          STAR_RADIUS_RATIO *
          sizeFactor *
          (isHalf ? HALF_STAR_RADIUS_RATIO : 1);
        const alpha = isHalf ? HALF_STAR_ALPHA_RATIO * brightness : brightness;
        fillLight(context, getX(index), getY(index), radius, [
          [0, rgba(STAR_CORE_COLOR, alpha)],
          [0.22, rgba(color, 0.95 * alpha)],
          [0.42, rgba(color, 0.12 * alpha)],
          [1, rgba(color, 0)],
        ]);
      }
      if (level === FULL_CHART_LEVEL_RANGE.max) {
        const lastIndex = STAR_COUNT - 1;
        context.fillStyle = rgba(SPARKLE.color, SPARKLE.alpha);
        fillFourPointStar(
          context,
          getX(lastIndex),
          getY(lastIndex),
          STAR_RADIUS * scale * Math.max(...STAR_SIZE_RATIOS) * SPARKLE.radiusRatio,
          SPARKLE.waist,
        );
      }
    },
  );
  return {
    key,
    paddingPx,
  };
}

/** 위치는 별자리 왼쪽 끝과 세로 가운데다. */
export class LevelConstellation extends Phaser.GameObjects.Container {
  private readonly figure: Phaser.GameObjects.Image;
  private readonly dash: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    super(scene);
    this.figure = scene.add
      .image(0, 0, '__DEFAULT')
      .setOrigin(0, 0.5)
      .setBlendMode(Phaser.BlendModes.SCREEN)
      .setVisible(false);
    this.dash = scene.add
      .text(DASH.offsetXPx, 0, '—', typeStyle(DASH.type, CELESTIAL_COLORS.textNeutral))
      .setOrigin(0, 0.5)
      .setVisible(false);
    this.add([this.figure, this.dash]);
    scene.add.existing(this);
  }

  render(level: ChartLevel | null): void {
    this.setVisible(true);
    if (level === null) {
      this.figure.setVisible(false);
      this.dash.setVisible(true);
      return;
    }
    const { key, paddingPx } = ensureLevelTexture(this.scene, level);
    this.dash.setVisible(false);
    this.figure.setTexture(key).setX(-paddingPx).setVisible(true);
  }
}
