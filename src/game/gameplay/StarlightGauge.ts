import type Phaser from 'phaser';
import { MAX_HP } from '../../rhythm/starlight.js';
import { getStarlightBand } from './starlightBand.js';
import type { StarlightBand } from './starlightBand.js';
import {
  LIGHT_TEXTURES,
  addLight,
  ensureCrescentTexture,
  ensureStarlightFillTexture,
} from '../ui/lightTextures.js';
import { COLORS, GAMEPLAY_DEPTH, MOTION, STATUS_COLORS } from '../ui/theme.js';

const FILL_HEIGHT_PX = 6;
// 채움과 테두리 사이를 비워 테두리가 채움 색에 묻히지 않게 한다.
const RAIL_GAP_PX = 2;
const RAIL_STROKE_PX = 1;
/** 레일 테두리가 채움 바깥으로 나오는 폭. 옆 요소와의 간격을 잴 때 더한다. */
export const STARLIGHT_RAIL_INSET_PX = RAIL_GAP_PX + RAIL_STROKE_PX;
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
const BAND_ORDER: readonly StarlightBand[] = ['stable', 'caution', 'danger'];
// 영상의 밝은 빛띠가 지나가도 묻히지 않도록 라벨·레일 뒤에 가장자리가 사라지는 어두운 받침을 깐다.
const BACKING_PADDING_X_PX = 48;
const BACKING_HEIGHT_PX = 64;
const BACKING_ALPHA = 0.75;
export const STARLIGHT_EMBLEM_SIZE_PX = 16;

/**
 * 세션 HP 를 우상단 SCORE 위의 얇은 달빛 레일로 보여 준다. HP 는 표시만 하고 계산하지 않는다.
 * 채움 길이가 HP 를, 채움 색이 안정·주의·위험 상태를 나타내고, 채움 끝의 별빛이 그 경계를 짚는다.
 */
export class StarlightGauge {
  private readonly parts: readonly Phaser.GameObjects.Components.AlphaSingle[];
  private readonly fill: Phaser.GameObjects.Image;
  private readonly glint: Phaser.GameObjects.Star;
  private readonly glintGlow: Phaser.GameObjects.Image;
  private hp = MAX_HP;
  private band: StarlightBand = getStarlightBand(MAX_HP);
  private resize: Phaser.Tweens.Tween | null = null;
  private breath: Phaser.Tweens.Tween | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly leftXPx: number,
    private readonly widthPx: number,
    yPx: number,
  ) {
    const depth = GAMEPLAY_DEPTH.text;
    const inset = STARLIGHT_RAIL_INSET_PX;
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
    // 길이는 scaleX 로 바꿔 채움이 왼쪽 끝에서 자라고 줄게 한다.
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

  /** 같은 값이면 다시 그리지 않는다. 채움 색은 단계가 바뀔 때만 바꾼다. */
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
      const isDrop = BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf(this.band);
      this.band = band;
      this.fill.setTint(STATUS_COLORS[band]);
      this.glintGlow.setTint(STATUS_COLORS[band]);
      if (isDrop) {
        this.flashGlint();
      }
      this.setBreathing(band === 'danger');
    }
  }

  /** 실패 연출의 "게이지 꺼짐". 게이지 전체를 사라지게 한다. */
  extinguish(): void {
    this.setBreathing(false);
    this.scene.tweens.add({ targets: this.parts, alpha: 0, duration: MOTION.mediumMs });
  }

  private flashGlint(): void {
    const scale = this.glintGlow.scale;
    this.scene.tweens.killTweensOf(this.glintGlow);
    this.scene.tweens.add({
      targets: this.glintGlow,
      scale: { from: scale * DROP_FLASH_SCALE, to: scale },
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
    const tipXPx = this.leftXPx + this.widthPx * this.fill.scaleX;
    this.glint.setX(tipXPx);
    this.glintGlow.setX(tipXPx);
  }
}

/** 라벨 앞에 두는 초승달 표지. 오른쪽 끝을 rightXPx 에 맞춘다. */
export function addStarlightEmblem(
  scene: Phaser.Scene,
  rightXPx: number,
  yPx: number,
): Phaser.GameObjects.Image {
  return scene.add
    .image(rightXPx, yPx, ensureCrescentTexture(scene, STARLIGHT_EMBLEM_SIZE_PX))
    .setOrigin(1, 0.5)
    .setDepth(GAMEPLAY_DEPTH.text);
}

/** 표지·라벨·레일이 걸친 가로 구간 뒤에 까는 어두운 받침. 게이지보다 한 단계 아래에 그린다. */
export function addStarlightBacking(
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
