import type Phaser from 'phaser';
import { CHART_LEVELS } from '../../../data/songs.js';
import { requireDefined } from '../../../invariant.js';
import type { ChartLevel } from '../../../data/songs.js';
import type { CelestialAtlasPresentation } from '../../celestial/state/celestialCatalog.js';
import {
  addCelestialSprite,
  setCelestialLoopActive,
} from '../../celestial/view/celestialSprites.js';
import { createCanvasTexture } from '../../ui/view/textures/canvasTexture.js';
import { LEVEL_LABEL } from '../../ui/view/widgets/songDetailLayout.js';
import { fillLight, rgba } from '../../ui/view/textures/lightTextures.js';
import { CELESTIAL_COLORS, cssColor, typeStyle } from '../../ui/view/theme.js';
import {
  LEVEL_SLIDER_LAYOUT,
  getLevelHandleSpacing,
  getLevelSliderXPx,
} from '../state/songSelectState.js';
import type { LevelHandle, LevelHandleSpacing } from '../state/songSelectState.js';
import { getLevelColor } from './LevelConstellation.js';

const VALUE_TYPE = {
  sizePx: 18,
  weight: 600,
} as const;
const HANDLE_SCALE = {
  idle: 0.21,
  focused: 0.24,
} as const;
const VALUE_ORIGIN_X: Readonly<Record<LevelHandleSpacing, { min: number; max: number }>> = {
  single: {
    min: 0.5,
    max: 0.5,
  },
  adjacent: {
    min: 1,
    max: 0,
  },
  apart: {
    min: 0.5,
    max: 0.5,
  },
};
const HALO = {
  scale: 0.27,
  alpha: 0.8,
} as const;
const LINE_WIDTH_PX = {
  halo: 5,
  core: 1.5,
} as const;
const DOT_CORE_COLOR = 0xe2f4ff;
// 점의 번짐은 반지름의 3배까지 퍼진다.
const DOT_GLOW_RATIO = 3;
const DIM = {
  line: {
    core: 0.22,
    halo: 0.04,
  },
  integerDot: {
    radiusPx: 1.8,
    alpha: 0.35,
  },
  halfDot: {
    radiusPx: 1.1,
    alpha: 0.22,
  },
} as const;
const BRIGHT = {
  line: {
    core: 0.9,
    halo: 0.16,
  },
  integerDot: {
    radiusPx: 2.3,
    alpha: 0.95,
  },
  halfDot: {
    radiusPx: 1.4,
    alpha: 0.7,
  },
} as const;
// 가장 큰 점의 번짐이 잘리지 않을 만큼 레일 둘레를 둔다.
const RAIL_PADDING_PX = Math.ceil(BRIGHT.integerDot.radiusPx * DOT_GLOW_RATIO);
const RAIL_TEXTURE_KEYS = {
  dim: 'levelRangeSlider:dimRail',
  bright: 'levelRangeSlider:brightRail',
} as const;

type RailStyle = typeof DIM | typeof BRIGHT;

interface Handle {
  readonly star: Phaser.GameObjects.Sprite;
  readonly halo: Phaser.GameObjects.Sprite;
  readonly value: Phaser.GameObjects.Text;
}

function getRailTextureXPx(level: ChartLevel): number {
  return getLevelSliderXPx(level) - LEVEL_SLIDER_LAYOUT.railLeftXPx + RAIL_PADDING_PX;
}

function ensureRailTexture(
  scene: Phaser.Scene,
  key: string,
  style: RailStyle,
  getColor: (level: ChartLevel) => number,
): void {
  const { railLeftXPx, railRightXPx } = LEVEL_SLIDER_LAYOUT;
  createCanvasTexture(
    scene,
    {
      key,
      widthPx: Math.ceil(railRightXPx - railLeftXPx) + RAIL_PADDING_PX * 2,
      heightPx: RAIL_PADDING_PX * 2,
    },
    (context) => {
      const centerYPx = RAIL_PADDING_PX;
      context.lineCap = 'round';
      for (const [index, level] of CHART_LEVELS.slice(1).entries()) {
        const from = requireDefined(CHART_LEVELS[index], 'Missing previous rail level', index);
        const color = getColor(level);
        for (const [widthPx, alpha] of [
          [LINE_WIDTH_PX.halo, style.line.halo],
          [LINE_WIDTH_PX.core, style.line.core],
        ] as const) {
          context.strokeStyle = rgba(color, alpha);
          context.lineWidth = widthPx;
          context.beginPath();
          context.moveTo(getRailTextureXPx(from), centerYPx);
          context.lineTo(getRailTextureXPx(level), centerYPx);
          context.stroke();
        }
      }
      for (const level of CHART_LEVELS) {
        const { radiusPx, alpha } = Number.isInteger(level) ? style.integerDot : style.halfDot;
        const color = getColor(level);
        const xPx = getRailTextureXPx(level);
        fillLight(context, xPx, centerYPx, radiusPx * DOT_GLOW_RATIO, [
          [0, rgba(color, alpha)],
          [0.35, rgba(color, alpha * 0.35)],
          [1, rgba(color, 0)],
        ]);
        context.fillStyle = rgba(DOT_CORE_COLOR, alpha);
        context.beginPath();
        context.arc(xPx, centerYPx, radiusPx, 0, Math.PI * 2);
        context.fill();
      }
    },
  );
}

export class LevelRangeSlider {
  private readonly brightRail: Phaser.GameObjects.Image;
  private readonly handles: Readonly<Record<LevelHandle, Handle>>;

  constructor(
    scene: Phaser.Scene,
    presentations: {
      readonly handle: CelestialAtlasPresentation;
      readonly halo: CelestialAtlasPresentation;
    },
    private readonly centerYPx: number,
    labelBaselineYPx: number,
  ) {
    const { labelXPx, railLeftXPx } = LEVEL_SLIDER_LAYOUT;
    const label = scene.add
      .text(labelXPx, 0, 'Lv.', typeStyle(LEVEL_LABEL.type, CELESTIAL_COLORS.textNeutral))
      .setLetterSpacing(LEVEL_LABEL.letterSpacingPx);
    label.setY(labelBaselineYPx - label.getTextMetrics().ascent);
    ensureRailTexture(scene, RAIL_TEXTURE_KEYS.dim, DIM, () => CELESTIAL_COLORS.textNeutral);
    ensureRailTexture(scene, RAIL_TEXTURE_KEYS.bright, BRIGHT, getLevelColor);
    const railXPx = railLeftXPx - RAIL_PADDING_PX;
    scene.add.image(railXPx, centerYPx, RAIL_TEXTURE_KEYS.dim).setOrigin(0, 0.5);
    this.brightRail = scene.add
      .image(railXPx, centerYPx, RAIL_TEXTURE_KEYS.bright)
      .setOrigin(0, 0.5);
    const createHandle = (): Handle => {
      const value = scene.add
        .text(0, 0, '', typeStyle(VALUE_TYPE, CELESTIAL_COLORS.textNeutral))
        .setOrigin(0.5, 0);
      // 손잡이 위 숫자도 Lv. 와 같은 기준선에 얹는다.
      value.setY(labelBaselineYPx - value.getTextMetrics().ascent);
      return {
        halo: addCelestialSprite(scene, presentations.halo, 0, centerYPx)
          .setScale(HALO.scale)
          .setAlpha(HALO.alpha)
          .setVisible(false),
        star: addCelestialSprite(scene, presentations.handle, 0, centerYPx),
        value,
      };
    };
    this.handles = {
      min: createHandle(),
      max: createHandle(),
    };
  }

  render({
    min,
    max,
    focus,
  }: {
    readonly min: ChartLevel;
    readonly max: ChartLevel;
    readonly focus: LevelHandle | null;
  }): void {
    const spacing = getLevelHandleSpacing(min, max);
    const leftXPx = getRailTextureXPx(min);
    this.brightRail
      .setCrop(leftXPx, 0, getRailTextureXPx(max) - leftXPx, this.brightRail.height)
      .setVisible(spacing !== 'single');
    // 두 끝이 같으면 손잡이 하나가 어느 쪽 포커스든 보인다.
    this.renderHandle(
      this.handles.min,
      min,
      spacing === 'single' ? focus !== null : focus === 'min',
    );
    this.renderHandle(this.handles.max, max, focus === 'max');
    const originX = VALUE_ORIGIN_X[spacing];
    this.handles.min.value.setOrigin(originX.min, 0);
    this.handles.max.value.setOrigin(originX.max, 0);
    this.setHandleVisible(this.handles.max, spacing !== 'single');
  }

  private renderHandle(handle: Handle, level: ChartLevel, isFocused: boolean): void {
    const xPx = getLevelSliderXPx(level);
    handle.star
      .setPosition(xPx, this.centerYPx)
      .setScale(isFocused ? HANDLE_SCALE.focused : HANDLE_SCALE.idle);
    handle.halo.setPosition(xPx, this.centerYPx);
    setCelestialLoopActive(handle.halo, isFocused);
    handle.value
      .setText(String(level))
      .setX(xPx)
      .setColor(cssColor(isFocused ? CELESTIAL_COLORS.textPrimary : CELESTIAL_COLORS.textNeutral));
  }

  private setHandleVisible(handle: Handle, isVisible: boolean): void {
    handle.star.setVisible(isVisible);
    handle.value.setVisible(isVisible);
    if (!isVisible) {
      setCelestialLoopActive(handle.halo, false);
    }
  }
}
