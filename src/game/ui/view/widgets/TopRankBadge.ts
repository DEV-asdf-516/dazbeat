import type Phaser from 'phaser';
import type {
  CelestialCatalog,
  CelestialStaticId,
} from '../../../celestial/state/celestialCatalog.js';
import { addCelestialSprite } from '../../../celestial/view/celestialSprites.js';
import { getTopRankTier } from '../../state/topRank.js';
import type { TopRankTier } from '../../state/topRank.js';
import { rgba } from '../textures/lightTextures.js';
import { COLORS, TOP_RANK_COLORS, cssColor, typeStyle } from '../theme.js';

/** 씬 preload 목록에 넣어 텍스처를 미리 받는다. */
export const TOP_RANK_GLINT_ID: CelestialStaticId = 'R07';

const WORD_TYPE = {
  sizePx: 16,
  weight: 800,
} as const;
const WORD_LETTER_SPACING_PX = 1;
const NUMBER_WEIGHT = 800;
const WORD_GAP_PX = 6;
const GLOW_BLUR_PX = 4;
// 빛이 글자 테두리처럼 보이지 않게 옅게만 두른다.
const GLOW_ALPHA = 0.3;
// 기울인 숫자의 오른쪽 끝이 글자 상자 밖으로 나가 잘리지 않게 둔다.
const ITALIC_PADDING_PX = 4;
const GLINT_SIZE_RATIO = 0.65;
const GRADIENT_MIDDLE_STOP = 0.52;
const MEDAL_TIERS: ReadonlySet<TopRankTier> = new Set(['gold', 'silver', 'bronze']);

/** 글자를 그 등급의 세로 그라데이션으로 채우고 은은한 빛을 두른다. 글자를 바꾼 뒤에 부른다. */
function fillTopRankText(text: Phaser.GameObjects.Text, tier: TopRankTier): void {
  const colors = TOP_RANK_COLORS[tier];
  const gradient = text.context.createLinearGradient(0, 0, 0, text.height);
  gradient.addColorStop(0, cssColor(colors.top));
  gradient.addColorStop(GRADIENT_MIDDLE_STOP, cssColor(colors.middle));
  gradient.addColorStop(1, cssColor(colors.bottom));
  text.setFill(gradient).setShadow(0, 0, rgba(colors.glow, GLOW_ALPHA), GLOW_BLUR_PX, false, true);
}

export class TopRankBadge {
  readonly objects: readonly Phaser.GameObjects.GameObject[];
  private readonly word: Phaser.GameObjects.Text | null;
  private readonly number: Phaser.GameObjects.Text;
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
    this.word = options.hasWord
      ? scene.add
          .text(0, options.yPx, 'TOP', {
            ...typeStyle(WORD_TYPE, COLORS.textPrimary),
            letterSpacing: WORD_LETTER_SPACING_PX,
          })
          .setOrigin(0, 0.5)
      : null;
    this.number = scene.add
      .text(0, options.yPx, '', {
        ...typeStyle(
          {
            sizePx: options.numberSizePx,
            weight: NUMBER_WEIGHT,
          },
          COLORS.textPrimary,
        ),
        fontStyle: `italic ${NUMBER_WEIGHT}`,
      })
      .setPadding(0, 0, ITALIC_PADDING_PX, 0)
      .setOrigin(0, 0.5);
    const glintSizePx = options.numberSizePx * GLINT_SIZE_RATIO;
    this.glint = addCelestialSprite(
      scene,
      celestial.atlasPresentations[TOP_RANK_GLINT_ID],
      0,
      0,
    ).setDisplaySize(glintSizePx, glintSizePx);
    this.objects = [...(this.word === null ? [] : [this.word]), this.number, this.glint];
    this.render(null);
  }

  getLeftXPx(): number | null {
    return this.number.visible ? (this.word ?? this.number).x : null;
  }

  getRightXPx(): number {
    return this.number.x + this.number.width - ITALIC_PADDING_PX;
  }

  render(rank: number | null): void {
    const tier = rank === null ? 'none' : getTopRankTier(rank);
    if (tier === 'none') {
      this.word?.setVisible(false);
      this.number.setVisible(false);
      this.glint.setVisible(false);
      return;
    }
    this.show(String(rank), tier);
  }

  renderOutsideTop(rankValue: string): void {
    this.show(rankValue, 'plain');
  }

  private show(numberText: string, tier: TopRankTier): void {
    this.word?.setVisible(true);
    this.number.setVisible(true);
    this.glint.setVisible(MEDAL_TIERS.has(tier));
    this.number.setText(numberText);
    fillTopRankText(this.number, tier);
    const wordWidthPx = this.word === null ? 0 : this.word.width + WORD_GAP_PX;
    if (this.word !== null) {
      fillTopRankText(this.word, tier);
    }
    const totalWidthPx = wordWidthPx + this.number.width;
    const { xPx, yPx, align } = this.options;
    const leftPx = {
      left: xPx,
      center: xPx - totalWidthPx / 2,
      right: xPx - totalWidthPx,
    }[align];
    this.word?.setX(leftPx);
    this.number.setX(leftPx + wordWidthPx);
    this.glint.setPosition(
      leftPx + totalWidthPx - ITALIC_PADDING_PX,
      yPx - this.number.height / 2 + this.glint.displayHeight / 2,
    );
  }
}
