import type Phaser from 'phaser';
import { MAX_HP } from '../../../rhythm/starlight.js';
import { getStarlightBand } from '../state/starlightBand.js';
import type { StarlightBand } from '../state/starlightBand.js';
import { ensureCrescentTexture, ensureStarlightFillTexture } from './gameplayTextures.js';
import { HUD_LABEL, HUD_SHADOW_COLOR, addHudText, withHudOutline } from './hudObjects.js';
import { LIGHT_TEXTURES, addLight } from '../../ui/view/textures/lightTextures.js';
import { COLORS, GAMEPLAY_DEPTH, STATUS_COLORS, typeStyle } from '../../ui/view/theme.js';
import { MOTION } from '../../ui/state/motion.js';

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
const EMBLEM_SIZE_PX = 16;
const EMBLEM_GAP_PX = 8;
const LABEL_GAP_PX = 12;
const LABEL_TYPE = {
  sizePx: 14,
  weight: HUD_LABEL.weight,
} as const;
const RAIL_SHADOW_OFFSET_Y_PX = 2;
const RAIL_SHADOW_ALPHA = 0.4;

export class StarlightGauge {
  private readonly parts: readonly Phaser.GameObjects.Components.AlphaSingle[];
  private readonly fill: Phaser.GameObjects.Image;
  private readonly glint: Phaser.GameObjects.Star;
  private readonly glintGlow: Phaser.GameObjects.Image;
  private readonly leftXPx: number;
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
    const label = addHudText(
      scene,
      leftXPx - inset - LABEL_GAP_PX,
      yPx,
      'STARLIGHT',
      withHudOutline({
        ...typeStyle(LABEL_TYPE, HUD_LABEL.color),
        letterSpacing: HUD_LABEL.letterSpacingPx,
      }),
    ).setOrigin(1, 0.5);
    addEmblem(scene, label.x - label.width - EMBLEM_GAP_PX, yPx);
    const depth = GAMEPLAY_DEPTH.text;
    const rail = scene.add.graphics().setDepth(depth);
    rail
      .fillStyle(HUD_SHADOW_COLOR, RAIL_SHADOW_ALPHA)
      .fillRoundedRect(
        leftXPx - inset,
        yPx - RAIL_HEIGHT_PX / 2 + RAIL_SHADOW_OFFSET_Y_PX,
        widthPx + inset * 2,
        RAIL_HEIGHT_PX,
        RAIL_HEIGHT_PX / 2,
      )
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
      .setTint(STATUS_COLORS[getStarlightBand(MAX_HP)])
      .setDepth(depth);
    const tipXPx = leftXPx + widthPx;
    this.glintGlow = addLight(scene, LIGHT_TEXTURES.star, tipXPx, yPx)
      .setDisplaySize(GLINT_GLOW_SIZE_PX, GLINT_GLOW_SIZE_PX)
      .setTint(STATUS_COLORS[getStarlightBand(MAX_HP)])
      .setAlpha(GLINT_GLOW_ALPHA)
      .setDepth(depth);
    this.glint = scene.add
      .star(tipXPx, yPx, 4, GLINT_INNER_RADIUS_PX, GLINT_OUTER_RADIUS_PX, COLORS.note)
      .setDepth(depth);
    this.parts = [rail, this.fill, this.glintGlow, this.glint];
  }

  renderFill(hp: number): void {
    this.resize?.stop();
    this.resize = this.scene.tweens.add({
      targets: this.fill,
      scaleX: hp / MAX_HP,
      duration: MOTION.fastMs,
      onUpdate: () => this.followTip(),
    });
  }

  renderBand(band: StarlightBand, isBreathing: boolean): void {
    this.fill.setTint(STATUS_COLORS[band]);
    this.glintGlow.setTint(STATUS_COLORS[band]);
    this.setBreathing(isBreathing);
  }

  extinguish(): void {
    this.setBreathing(false);
    this.scene.tweens.add({
      targets: this.parts,
      alpha: 0,
      duration: MOTION.mediumMs,
    });
  }

  flashGlint(): void {
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
    if (this.breath === null) {
      if (isBreathing) {
        this.breath = this.scene.tweens.add({
          targets: this.fill,
          alpha: DANGER_BREATH_ALPHA,
          duration: DANGER_BREATH_MS,
          ease: 'Sine.InOut',
          yoyo: true,
          repeat: -1,
        });
      }
      return;
    }
    if (!isBreathing) {
      this.breath.stop();
      this.breath = null;
      this.fill.setAlpha(1);
    }
  }

  private followTip(): void {
    const tipXPx = this.leftXPx + WIDTH_PX * this.fill.scaleX;
    this.glint.setX(tipXPx);
    this.glintGlow.setX(tipXPx);
  }
}

function addEmblem(scene: Phaser.Scene, rightXPx: number, yPx: number): void {
  scene.add
    .image(rightXPx, yPx, ensureCrescentTexture(scene, EMBLEM_SIZE_PX))
    .setOrigin(1, 0.5)
    .setDepth(GAMEPLAY_DEPTH.text);
}
