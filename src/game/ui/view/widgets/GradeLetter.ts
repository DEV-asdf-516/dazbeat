import Phaser from 'phaser';
import type { Rank } from '../../../../rhythm/types.js';
import { lerp } from '../../../../range.js';
import type { CelestialCatalog } from '../../../celestial/state/celestialCatalog.js';
import { addCelestialSprite } from '../../../celestial/view/celestialSprites.js';
import { rgba } from '../textures/lightTextures.js';
import {
  COLORS,
  GRADE_FILLS,
  TYPE_SCALE,
  cssColor,
  isReducedMotionPreferred,
  textStyle,
} from '../theme.js';
import type { TypeRole } from '../theme.js';
import { TOP_RANK_GLINT_ID } from './TopRankBadge.js';

const GLINT_RANK: Rank = 'S';
// 크기는 글자 높이에 비례해 어느 화면에서든 같은 모습으로 보이게 한다.
// TOP 메달 글자와 같은 세기로, 테두리처럼 보이지 않게 옅게만 두른다.
const GLOW_ALPHA = 0.7;
const GLOW_BLUR_RATIO = 0.3;
// 빛이 글자 캔버스 끝에서 잘리면 네모 상자가 드러나므로 번지는 거리보다 넉넉히 비운다.
const GLOW_PADDING_RATIO = GLOW_BLUR_RATIO * 2;
const SWEEP_MS = 1400;
const REST_MS = 700;
const BAND_HALF_WIDTH_RATIO = 1 / 3;
const BAND_ALPHA = 0.35;
const BAND_COLOR = 0xffffff;
// 등급이 바뀌어도 빛 띠가 같은 방향으로 지나가게 한 각도로 통일한다.
const BAND_ANGLE_DEG = GRADE_FILLS[GLINT_RANK].angleDeg;
const GLINT_TWINKLE_MS = 180;
const GLINT_MIN_SCALE_RATIO = 0.3;
// 빛 띠가 왼쪽 아래를 먼저 지나고 오른쪽 위를 나중에 지나는 순서에 맞춘다.
const GLINTS = [
  {
    offsetX: -0.5,
    offsetY: 0.42,
    sizeRatio: 1 / 3,
    delayMs: 350,
  },
  {
    offsetX: 0.5,
    offsetY: -0.5,
    sizeRatio: 1 / 2,
    delayMs: 735,
  },
] as const;

/** 글자 모양 범위의 크기와, 그 중심을 지나며 각도 방향으로 양 끝 모서리에 닿는 축이다. */
function getGlyphAxis(
  text: Phaser.GameObjects.Text,
  angleDeg: number,
): {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly centerXPx: number;
  readonly centerYPx: number;
  readonly directionX: number;
  readonly directionY: number;
  readonly halfLengthPx: number;
} {
  // Phaser 는 빛 여백만큼 옮긴 뒤 글자를 그리므로 좌표는 여백 안쪽 기준이다.
  // 글자 아래 여백까지 걸면 마지막 색이 글자에 닿지 않아 글자 모양 범위에만 건다.
  const glyph = text.context.measureText(text.text);
  const widthPx = glyph.actualBoundingBoxRight;
  const heightPx = glyph.actualBoundingBoxAscent;
  const directionX = Math.cos(Phaser.Math.DegToRad(angleDeg));
  const directionY = Math.sin(Phaser.Math.DegToRad(angleDeg));
  return {
    widthPx,
    heightPx,
    centerXPx: widthPx / 2,
    centerYPx: text.getTextMetrics().ascent - heightPx / 2,
    directionX,
    directionY,
    // 양 끝 색이 글자 모양 범위의 맞은편 모서리에 닿는 길이다.
    halfLengthPx: (widthPx * Math.abs(directionX) + heightPx * Math.abs(directionY)) / 2,
  };
}

/**
 * 등급마다 그라데이션으로 칠한 등급 글자. 글자 사본에 움직이는 빛만 칠해 겹쳐 모든 등급에 빛 띠가 지나가고, S 는 빛을 두르며 별이 반짝인다.
 * 씬 preload 목록에 TOP_RANK_GLINT_ID 를 넣는다.
 */
export class GradeLetter {
  readonly revealTargets: readonly Phaser.GameObjects.Text[];
  private readonly letter: Phaser.GameObjects.Text;
  private readonly sheen: Phaser.GameObjects.Text;
  private readonly paddingPx: number;
  private readonly glowBlurPx: number;
  private readonly bandHalfWidthPx: number;
  private readonly glints: readonly {
    readonly sprite: Phaser.GameObjects.Sprite;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly delayMs: number;
  }[];

  constructor(
    private readonly scene: Phaser.Scene,
    celestial: CelestialCatalog,
    options: { readonly role: TypeRole; readonly glyphHeightPx?: number },
  ) {
    const { role, glyphHeightPx } = options;
    const addText = (): Phaser.GameObjects.Text =>
      scene.add.text(0, 0, GLINT_RANK, textStyle(role, COLORS.textPrimary)).setOrigin(0.5);
    this.letter = addText();
    this.sheen = addText();
    this.revealTargets = [this.letter, this.sheen];
    const roleHeightPx = this.letter.context.measureText(GLINT_RANK).actualBoundingBoxAscent;
    const heightPx = glyphHeightPx ?? roleHeightPx;
    const sizePx = Math.round((TYPE_SCALE[role].sizePx * heightPx) / roleHeightPx);
    this.paddingPx = Math.ceil(heightPx * GLOW_PADDING_RATIO);
    this.glowBlurPx = heightPx * GLOW_BLUR_RATIO;
    this.bandHalfWidthPx = heightPx * BAND_HALF_WIDTH_RATIO;
    this.revealTargets.forEach((text) => text.setFontSize(sizePx).setPadding(this.paddingPx));
    this.sheen.setBlendMode(Phaser.BlendModes.ADD);
    this.glints = GLINTS.map(({ offsetX, offsetY, sizeRatio, delayMs }) => ({
      sprite: addCelestialSprite(scene, celestial.atlasPresentations[TOP_RANK_GLINT_ID], 0, 0)
        .setDisplaySize(heightPx * sizeRatio, heightPx * sizeRatio)
        .setAlpha(0),
      offsetX,
      offsetY,
      delayMs,
    }));
    this.render(null);
  }

  /** 움직임을 줄인 설정이면 돌리지 않는다. 한 번만 부른다. */
  playSheen(): void {
    if (isReducedMotionPreferred()) {
      return;
    }
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: SWEEP_MS,
      repeat: -1,
      repeatDelay: REST_MS,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        // 글자 캔버스를 다시 그리는 일이라 보일 때만 칠한다.
        if (this.sheen.visible) {
          this.fillBand(tween.getValue() ?? 0);
        }
      },
    });
    this.glints.forEach(({ sprite, delayMs }) => {
      this.scene.tweens.add({
        targets: sprite,
        alpha: {
          from: 0,
          to: 1,
        },
        scale: {
          from: sprite.scale * GLINT_MIN_SCALE_RATIO,
          to: sprite.scale,
        },
        duration: GLINT_TWINKLE_MS,
        delay: delayMs,
        yoyo: true,
        repeat: -1,
        repeatDelay: SWEEP_MS + REST_MS - GLINT_TWINKLE_MS * 2,
        ease: 'Sine.easeInOut',
      });
    });
  }

  /** null 이면 숨긴다. 글자 크기가 바뀌므로 그린 뒤에 place 를 부른다. */
  render(grade: Rank | null): void {
    const hasGlints = grade === GLINT_RANK;
    this.letter.setVisible(grade !== null);
    this.sheen.setVisible(grade !== null);
    this.glints.forEach(({ sprite }) => sprite.setVisible(hasGlints));
    if (grade === null) {
      return;
    }
    // 그라데이션은 글자 캔버스 크기로 만들므로 글자를 먼저 바꾼다.
    this.letter.setText(grade);
    this.sheen.setText(grade);
    this.fillBand(0);
    const { stops, angleDeg, glow } = GRADE_FILLS[grade];
    const { centerXPx, centerYPx, directionX, directionY, halfLengthPx } = getGlyphAxis(
      this.letter,
      angleDeg,
    );
    const gradient = this.letter.context.createLinearGradient(
      centerXPx - directionX * halfLengthPx,
      centerYPx - directionY * halfLengthPx,
      centerXPx + directionX * halfLengthPx,
      centerYPx + directionY * halfLengthPx,
    );
    stops.forEach(([offset, color]) => gradient.addColorStop(offset, cssColor(color)));
    this.letter.setFill(gradient);
    if (glow === null) {
      this.letter.setShadowFill(false);
      return;
    }
    this.letter.setShadow(0, 0, rgba(glow, GLOW_ALPHA), this.glowBlurPx, false, true);
  }

  getAscentPx(): number {
    return this.letter.getTextMetrics().ascent;
  }

  place(leftXPx: number, topYPx: number): void {
    const bounds = this.getBounds();
    const centerXPx = leftXPx + bounds.width / 2;
    const centerYPx = topYPx + bounds.height / 2;
    this.revealTargets.forEach((text) => text.setPosition(centerXPx, centerYPx));
    const {
      widthPx,
      heightPx,
      centerXPx: glyphXPx,
      centerYPx: glyphYPx,
    } = getGlyphAxis(this.sheen, 0);
    this.glints.forEach(({ sprite, offsetX, offsetY }) => {
      sprite.setPosition(
        leftXPx + glyphXPx + widthPx * offsetX,
        topYPx + glyphYPx + heightPx * offsetY,
      );
    });
  }

  getBounds(): Phaser.Geom.Rectangle {
    const widthPx = this.letter.width - this.paddingPx * 2;
    const heightPx = this.letter.height - this.paddingPx * 2;
    return new Phaser.Geom.Rectangle(
      this.letter.x - widthPx / 2,
      this.letter.y - heightPx / 2,
      widthPx,
      heightPx,
    );
  }

  private fillBand(progress: number): void {
    const { centerXPx, centerYPx, directionX, directionY, halfLengthPx } = getGlyphAxis(
      this.sheen,
      BAND_ANGLE_DEG,
    );
    const distancePx = lerp(
      -halfLengthPx - this.bandHalfWidthPx,
      halfLengthPx + this.bandHalfWidthPx,
      progress,
    );
    const middleXPx = centerXPx + directionX * distancePx;
    const middleYPx = centerYPx + directionY * distancePx;
    const gradient = this.sheen.context.createLinearGradient(
      middleXPx - directionX * this.bandHalfWidthPx,
      middleYPx - directionY * this.bandHalfWidthPx,
      middleXPx + directionX * this.bandHalfWidthPx,
      middleYPx + directionY * this.bandHalfWidthPx,
    );
    gradient.addColorStop(0, rgba(BAND_COLOR, 0));
    gradient.addColorStop(0.5, rgba(BAND_COLOR, BAND_ALPHA));
    gradient.addColorStop(1, rgba(BAND_COLOR, 0));
    this.sheen.setFill(gradient);
  }
}
