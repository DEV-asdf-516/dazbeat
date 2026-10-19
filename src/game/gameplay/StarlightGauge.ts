import type Phaser from 'phaser';
import { MAX_HP } from '../../rhythm/starlight.js';
import { getStarlightBand, isStarlightDrop } from './starlightBand.js';
import type { StarlightBand } from './starlightBand.js';
import { ensureCrescentTexture, ensureStarlightFillTexture } from './gameplayTextures.js';
import { addHudText, setTextShadow } from './hudObjects.js';
import type { TextShadow } from './hudObjects.js';
import { LIGHT_TEXTURES, addLight } from '../ui/lightTextures.js';
import { COLORS, GAMEPLAY_DEPTH, MOTION, STATUS_COLORS, typeStyle } from '../ui/theme.js';

const WIDTH_PX = 256;
const FILL_HEIGHT_PX = 6;
// 채움과 테두리 사이를 비워 테두리가 채움 색에 묻히지 않게 한다.
const RAIL_GAP_PX = 2;
const RAIL_STROKE_PX = 1;
const RAIL_INSET_PX = RAIL_GAP_PX + RAIL_STROKE_PX;
const RAIL_HEIGHT_PX = FILL_HEIGHT_PX + (RAIL_GAP_PX + RAIL_STROKE_PX) * 2;
const RAIL_ALPHA = 0.7;
// 밝은 영상 위에서도 빈 구간이 보이도록 레일 안쪽을 밤색으로 물린다.
const TRACK_ALPHA = 0.6;
const TICK_RATIOS = [0.25, 0.5, 0.75] as const;
const TICK_GAP_PX = 3;
const TICK_LENGTH_PX = 4;
const TICK_ALPHA = 0.5;
const GLINT_OUTER_RADIUS_PX = 5;
const GLINT_INNER_RADIUS_PX = 1.3;
const GLINT_GLOW_SIZE_PX = 18;
const GLINT_GLOW_ALPHA = 0.8;
// 단계가 나빠질 때 끝 별빛이 한 번 부풀어 주변시에 걸리게 한다.
const DROP_FLASH_SCALE = 2.4;
// 위험 단계 동안 채움이 숨 쉬듯 옅어졌다 돌아온다. 박자와 엇갈리도록 곡과 무관한 느린 주기다.
const DANGER_BREATH_ALPHA = 0.5;
const DANGER_BREATH_MS = 700;
// 영상의 밝은 빛띠가 지나가도 묻히지 않도록 라벨·레일 뒤에 가장자리가 사라지는 어두운 받침을 깐다.
const BACKING_PADDING_X_PX = 48;
const BACKING_HEIGHT_PX = 64;
const BACKING_ALPHA = 0.75;
const EMBLEM_SIZE_PX = 16;
const EMBLEM_GAP_PX = 8;
const LABEL_GAP_PX = 12;
const LABEL_TYPE = {
  sizePx: 12,
  weight: 500,
} as const;
// 밝은 영상 위에서도 라벨이 읽히도록 글자 바로 뒤에만 좁은 어두운 그림자를 둔다.
const LABEL_SHADOW: TextShadow = {
  offsetXPx: 0,
  offsetYPx: 1,
  color: 'rgba(8, 15, 32, 0.7)',
  blurPx: 2,
} as const;

export class StarlightGauge {
  private readonly parts: readonly Phaser.GameObjects.Components.AlphaSingle[];
  private readonly fill: Phaser.GameObjects.Image;
  private readonly glint: Phaser.GameObjects.Star;
  private readonly glintGlow: Phaser.GameObjects.Image;
  private readonly leftXPx: number;
  private hp = MAX_HP;
  private band: StarlightBand = getStarlightBand(MAX_HP);
  private resize: Phaser.Tweens.Tween | null = null;
  private breath: Phaser.Tweens.Tween | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    rightXPx: number,
    yPx: number,
  ) {
    const inset = RAIL_INSET_PX;
    const leftXPx = rightXPx - inset - WIDTH_PX;
    const widthPx = WIDTH_PX;
    this.leftXPx = leftXPx;
    const label = setTextShadow(
      addHudText(
        scene,
        leftXPx - inset - LABEL_GAP_PX,
        yPx,
        'STARLIGHT',
        typeStyle(LABEL_TYPE, COLORS.noteShade),
      ),
      LABEL_SHADOW,
    ).setOrigin(1, 0.5);
    const emblem = addEmblem(scene, label.x - label.width - EMBLEM_GAP_PX, yPx);
    addBacking(scene, emblem.x - emblem.width, rightXPx, yPx);
    const depth = GAMEPLAY_DEPTH.text;
    const rail = scene.add.graphics().setDepth(depth);
    rail
      .fillStyle(COLORS.background, TRACK_ALPHA)
      .fillRoundedRect(
        leftXPx - inset,
        yPx - RAIL_HEIGHT_PX / 2,
        widthPx + inset * 2,
        RAIL_HEIGHT_PX,
        RAIL_HEIGHT_PX / 2,
      )
      .lineStyle(RAIL_STROKE_PX, COLORS.noteShade, RAIL_ALPHA)
      .strokeRoundedRect(
        leftXPx - inset,
        yPx - RAIL_HEIGHT_PX / 2,
        widthPx + inset * 2,
        RAIL_HEIGHT_PX,
        RAIL_HEIGHT_PX / 2,
      )
      .lineStyle(RAIL_STROKE_PX, COLORS.noteShade, TICK_ALPHA);
    const tickTopYPx = yPx + RAIL_HEIGHT_PX / 2 + TICK_GAP_PX;
    for (const ratio of TICK_RATIOS) {
      const xPx = Math.round(leftXPx + widthPx * ratio) + RAIL_STROKE_PX / 2;
      rail.lineBetween(xPx, tickTopYPx, xPx, tickTopYPx + TICK_LENGTH_PX);
    }
    this.fill = scene.add
      .image(leftXPx, yPx, ensureStarlightFillTexture(scene, widthPx, FILL_HEIGHT_PX))
      .setOrigin(0, 0.5)
      .setTint(STATUS_COLORS[this.band])
      .setDepth(depth);
    const tipXPx = leftXPx + widthPx;
    this.glintGlow = addLight(scene, LIGHT_TEXTURES.star, tipXPx, yPx)
      .setDisplaySize(GLINT_GLOW_SIZE_PX, GLINT_GLOW_SIZE_PX)
      .setTint(STATUS_COLORS[this.band])
      .setAlpha(GLINT_GLOW_ALPHA)
      .setDepth(depth);
    this.glint = scene.add
      .star(tipXPx, yPx, 4, GLINT_INNER_RADIUS_PX, GLINT_OUTER_RADIUS_PX, COLORS.note)
      .setDepth(depth);
    this.parts = [rail, this.fill, this.glintGlow, this.glint];
  }

  setHp(hp: number): void {
    if (hp === this.hp) {
      return;
    }
    this.hp = hp;
    this.resize?.stop();
    const ratio = hp / MAX_HP;
    this.resize = this.scene.tweens.add({
      targets: this.fill,
      scaleX: ratio,
      duration: MOTION.fastMs,
      onUpdate: () => this.followTip(),
    });
    const band = getStarlightBand(hp);
    if (band !== this.band) {
      const isDrop = isStarlightDrop(this.band, band);
      this.band = band;
      this.fill.setTint(STATUS_COLORS[band]);
      this.glintGlow.setTint(STATUS_COLORS[band]);
      if (isDrop) {
        this.flashGlint();
      }
      this.setBreathing(band === 'danger');
    }
  }

  extinguish(): void {
    this.setBreathing(false);
    this.scene.tweens.add({
      targets: this.parts,
      alpha: 0,
      duration: MOTION.mediumMs,
    });
  }

  private flashGlint(): void {
    const scale = this.glintGlow.scale;
    this.scene.tweens.killTweensOf(this.glintGlow);
    this.scene.tweens.add({
      targets: this.glintGlow,
      scale: {
        from: scale * DROP_FLASH_SCALE,
        to: scale,
      },
      duration: MOTION.mediumMs,
      ease: 'Cubic.Out',
    });
  }

  private setBreathing(isBreathing: boolean): void {
    if (isBreathing === (this.breath !== null)) {
      return;
    }
    if (!isBreathing) {
      this.breath?.stop();
      this.breath = null;
      this.fill.setAlpha(1);
      return;
    }
    this.breath = this.scene.tweens.add({
      targets: this.fill,
      alpha: DANGER_BREATH_ALPHA,
      duration: DANGER_BREATH_MS,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private followTip(): void {
    const tipXPx = this.leftXPx + WIDTH_PX * this.fill.scaleX;
    this.glint.setX(tipXPx);
    this.glintGlow.setX(tipXPx);
  }
}

function addEmblem(scene: Phaser.Scene, rightXPx: number, yPx: number): Phaser.GameObjects.Image {
  return scene.add
    .image(rightXPx, yPx, ensureCrescentTexture(scene, EMBLEM_SIZE_PX))
    .setOrigin(1, 0.5)
    .setDepth(GAMEPLAY_DEPTH.text);
}

function addBacking(
  scene: Phaser.Scene,
  leftXPx: number,
  rightXPx: number,
  yPx: number,
): Phaser.GameObjects.Image {
  return scene.add
    .image((leftXPx + rightXPx) / 2, yPx, LIGHT_TEXTURES.glow)
    .setDisplaySize(rightXPx - leftXPx + BACKING_PADDING_X_PX * 2, BACKING_HEIGHT_PX)
    .setTint(COLORS.background)
    .setAlpha(BACKING_ALPHA)
    .setDepth(GAMEPLAY_DEPTH.laneDivider);
}
