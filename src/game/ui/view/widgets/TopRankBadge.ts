import type Phaser from 'phaser';
import type {
  CelestialCatalog,
  CelestialStaticId,
} from '../../../celestial/state/celestialCatalog.js';
import { addCelestialSprite } from '../../../celestial/view/celestialSprites.js';
import { requireDefined } from '../../../../invariant.js';
import { getTopRankTier } from '../../state/topRank.js';
import type { TopRankTier } from '../../state/topRank.js';
import { createCanvasTexture } from '../textures/canvasTexture.js';
import { rgba } from '../textures/lightTextures.js';
import { COLORS, TOP_RANK_FONT_FAMILY, TOP_RANK_COLORS, cssColor, typeStyle } from '../theme.js';
import { GlyphText } from './GlyphText.js';

/** 씬 preload 목록에 넣어 텍스처를 미리 받는다. */
export const TOP_RANK_GLINT_ID: CelestialStaticId = 'R07';

const WORD_TYPE = {
  sizePx: 16,
  weight: 600,
} as const;
const WORD_LETTER_SPACING_PX = 1;
const NUMBER_WEIGHT = 700;
const WORD_GAP_PX = 6;
const GLOW_BLUR_PX = 4;
// 빛이 글자 테두리처럼 보이지 않게 옅게만 두른다.
const GLOW_ALPHA = 0.3;
// 숫자 빛(blur)이 글자 칸 경계에서 잘리지 않을 만큼 칸 좌우를 띄운다.
const GLOW_SIDE_PADDING_PX = 6;
const GLINT_SIZE_RATIO = 0.65;
const GRADIENT_MIDDLE_STOP = 0.52;
const MEDAL_TIERS: ReadonlySet<TopRankTier> = new Set(['gold', 'silver', 'bronze']);
const TIERS: readonly TopRankTier[] = ['gold', 'silver', 'bronze', 'plain'];

interface TierNumber {
  readonly glyphs: GlyphText;
  readonly layer: Phaser.GameObjects.BitmapText;
}

function createTopRankGradient(
  context: CanvasRenderingContext2D,
  heightPx: number,
  tier: TopRankTier,
): CanvasGradient {
  const colors = TOP_RANK_COLORS[tier];
  const gradient = context.createLinearGradient(0, 0, 0, heightPx);
  gradient.addColorStop(0, cssColor(colors.top));
  gradient.addColorStop(GRADIENT_MIDDLE_STOP, cssColor(colors.middle));
  gradient.addColorStop(1, cssColor(colors.bottom));
  return gradient;
}

function getWordTextureKey(tier: TopRankTier): string {
  return `topRankWord:${tier}`;
}

function ensureWordTexture(scene: Phaser.Scene, tier: TopRankTier): void {
  const key = getWordTextureKey(tier);
  if (scene.textures.exists(key)) {
    return;
  }
  const text = scene.make.text(
    {
      x: 0,
      y: 0,
      text: 'TOP',
      style: {
        ...typeStyle(WORD_TYPE, COLORS.textPrimary),
        fontFamily: TOP_RANK_FONT_FAMILY,
        letterSpacing: WORD_LETTER_SPACING_PX,
      },
    },
    false,
  );
  text
    .setFill(createTopRankGradient(text.context, text.height, tier))
    .setShadow(0, 0, rgba(TOP_RANK_COLORS[tier].glow, GLOW_ALPHA), GLOW_BLUR_PX, false, true);
  createCanvasTexture(
    scene,
    {
      key,
      widthPx: text.canvas.width,
      heightPx: text.canvas.height,
    },
    (context) => context.drawImage(text.canvas, 0, 0),
  );
  text.destroy();
}

// 값·등급이 바뀔 때 다시 굽지 않도록 TOP 글자는 등급별 그림으로, 숫자는 등급별 GlyphText 로 미리 굽고 보임만 바꾼다.
export class TopRankBadge {
  readonly objects: readonly Phaser.GameObjects.GameObject[];
  private readonly word: Phaser.GameObjects.Image | null;
  private readonly numbers: Readonly<Record<TopRankTier, TierNumber>>;
  private readonly glint: Phaser.GameObjects.Sprite;

  constructor(
    scene: Phaser.Scene,
    celestial: CelestialCatalog,
    private readonly options: {
      readonly xPx: number;
      readonly yPx: number;
      readonly align: 'left' | 'center' | 'right';
      readonly hasWord: boolean;
      readonly numberSizePx: number;
    },
  ) {
    if (options.hasWord) {
      TIERS.forEach((tier) => ensureWordTexture(scene, tier));
    }
    this.word = options.hasWord
      ? scene.add.image(0, options.yPx, getWordTextureKey('plain')).setOrigin(0, 0.5)
      : null;
    const numberStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      ...typeStyle(
        {
          sizePx: options.numberSizePx,
          weight: NUMBER_WEIGHT,
        },
        COLORS.textPrimary,
      ),
      fontFamily: TOP_RANK_FONT_FAMILY,
      padding: {
        left: GLOW_SIDE_PADDING_PX,
        right: GLOW_SIDE_PADDING_PX,
      },
    };
    // 그라데이션은 글자 칸 높이(같은 스타일 Text 한 글자의 높이)를 기준으로 세로로 칠한다.
    const probe = scene.make.text(
      {
        x: 0,
        y: 0,
        text: '0',
        style: numberStyle,
      },
      false,
    );
    const createNumber = (tier: TopRankTier): TierNumber => {
      const glyphs = new GlyphText(scene, {
        fontKey: `topRankNumber:${tier}:${options.numberSizePx}`,
        style: {
          ...numberStyle,
          color: createTopRankGradient(probe.context, probe.height, tier),
          shadow: {
            offsetX: 0,
            offsetY: 0,
            color: rgba(TOP_RANK_COLORS[tier].glow, GLOW_ALPHA),
            blur: GLOW_BLUR_PX,
            stroke: false,
            fill: true,
          },
        },
        chars: '0123456789+',
        xPx: 0,
        yPx: options.yPx,
        originX: 0,
        originY: 0.5,
        text: '',
        depth: 0,
      });
      // 외곽선이 없는 스타일이라 레이어가 하나다.
      return {
        glyphs,
        layer: requireDefined(glyphs.layers[0], 'Missing top rank number layer', tier),
      };
    };
    this.numbers = {
      gold: createNumber('gold'),
      silver: createNumber('silver'),
      bronze: createNumber('bronze'),
      plain: createNumber('plain'),
    };
    probe.destroy();
    const glintSizePx = options.numberSizePx * GLINT_SIZE_RATIO;
    this.glint = addCelestialSprite(
      scene,
      celestial.atlasPresentations[TOP_RANK_GLINT_ID],
      0,
      0,
    ).setDisplaySize(glintSizePx, glintSizePx);
    this.objects = [
      ...(this.word === null ? [] : [this.word]),
      ...TIERS.map((tier) => this.numbers[tier].layer),
      this.glint,
    ];
    this.render(null);
  }

  getLeftXPx(): number | null {
    const shown = this.findShownLayer();
    return shown === undefined ? null : (this.word ?? shown).x;
  }

  getRightXPx(): number {
    const layer = this.findShownLayer() ?? this.numbers.plain.layer;
    return layer.x + Math.ceil(layer.getTextBounds().local.width);
  }

  render(rank: number | null): void {
    const tier = rank === null ? 'none' : getTopRankTier(rank);
    if (tier === 'none') {
      this.word?.setVisible(false);
      TIERS.forEach((numberTier) => this.numbers[numberTier].layer.setVisible(false));
      this.glint.setVisible(false);
      return;
    }
    this.show(String(rank), tier);
  }

  renderOutsideTop(rankValue: string): void {
    this.show(rankValue, 'plain');
  }

  private findShownLayer(): Phaser.GameObjects.BitmapText | undefined {
    return TIERS.map((tier) => this.numbers[tier].layer).find((layer) => layer.visible);
  }

  private show(numberText: string, tier: TopRankTier): void {
    this.word?.setTexture(getWordTextureKey(tier)).setVisible(true);
    TIERS.forEach((numberTier) => this.numbers[numberTier].layer.setVisible(numberTier === tier));
    this.glint.setVisible(MEDAL_TIERS.has(tier));
    const { glyphs, layer } = this.numbers[tier];
    glyphs.render(numberText);
    const numberWidthPx = Math.ceil(layer.getTextBounds().local.width);
    const wordWidthPx = this.word === null ? 0 : this.word.width + WORD_GAP_PX;
    const totalWidthPx = wordWidthPx + numberWidthPx;
    const { xPx, yPx, align } = this.options;
    const leftPx = {
      left: xPx,
      center: xPx - totalWidthPx / 2,
      right: xPx - totalWidthPx,
    }[align];
    this.word?.setX(leftPx);
    layer.setX(leftPx + wordWidthPx);
    this.glint.setPosition(
      leftPx + totalWidthPx,
      yPx - layer.height / 2 + this.glint.displayHeight / 2,
    );
  }
}
