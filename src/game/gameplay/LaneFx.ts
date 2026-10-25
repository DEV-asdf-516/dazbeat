import type Phaser from 'phaser';
import { requireDefined } from '../../invariant.js';
import type { JudgmentEvent, Lane } from '../../rhythm/types.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import type { PlayfieldLayout } from './playfieldLayout.js';
import { getHitBloomIntensity, getLaneEffectIds } from './judgmentEffects.js';
import type { LaneEffectId } from './judgmentEffects.js';
import { addCelestialSprite, playCelestialOnce } from '../celestial/celestialSprites.js';
import { ensureJudgeLineTexture } from './gameplayTextures.js';
import { LIGHT_TEXTURES, addLight } from '../ui/lightTextures.js';
import { COLORS, GAMEPLAY_DEPTH, MOTION } from '../ui/theme.js';

// 상시 halo 가 노트보다 먼저 보이지 않게 낮게 둔다.
const JUDGE_CORE_HEIGHT_PX = 2;
const JUDGE_CORE_ALPHA = 0.6;
const JUDGE_CORE_ACTIVATION_ALPHA = 0.25;
const JUDGE_GLOW_EXTRA_WIDTH_PX = 40;
const JUDGE_GLOW_HEIGHT_PX = 18;
const JUDGE_GLOW_ALPHA = 0.14;
const JUDGE_GLOW_ACTIVATION_ALPHA = 0.22;
const ANCHOR_WIDTH_PX = 112;
const ANCHOR_HEIGHT_PX = 24;
const ANCHOR_IDLE_ALPHA = 0.1;
const ANCHOR_PRESS_SCALE = 1.4;
const ANCHOR_GOOD_ALPHA = 0.6;
const ANCHOR_MISS_RECOVER_MS = 320;
const COLUMN_WIDTH_PX = 120;
const COLUMN_HEIGHT_PX = 240;
const PULSE_ALPHA = 0.28;
const MISS_SHADE_ALPHA = 0.3;
const MISS_SHADE_FADE_MS = 260;
const NOTE_TRAIL_ID: LaneEffectId = 'R33';

const HIT_BLOOM = {
  core: {
    widthPx: [96, 40],
    heightPx: [96, 40],
    alpha: 1,
    durationMs: 120,
  },
  streak: {
    widthPx: [160, 560],
    heightPx: [10, 4],
    alpha: 0.9,
    durationMs: 260,
  },
  haze: {
    widthPx: [160, 380],
    heightPx: [70, 150],
    alpha: 0.7,
    durationMs: 420,
  },
  // 위로 갈수록 사라지는 기둥이라 다가오는 노트를 가리지 않는다.
  pillar: {
    widthPx: [110, 150],
    heightPx: [200, 460],
    alpha: 0.5,
    durationMs: 440,
  },
} as const;
type HitBloomLayer = keyof typeof HIT_BLOOM;

interface LaneFxView {
  anchor: Phaser.GameObjects.Image;
  pulse: Phaser.GameObjects.Image;
  missShade: Phaser.GameObjects.Image;
  effects: Record<LaneEffectId, Phaser.GameObjects.Sprite>;
  bloom: Record<HitBloomLayer, Phaser.GameObjects.Image>;
}

export class LaneFx {
  private readonly judgeGlow: Phaser.GameObjects.Image;
  private readonly judgeCore: Phaser.GameObjects.Image;
  private readonly lanes: readonly LaneFxView[];

  constructor(
    private readonly scene: Phaser.Scene,
    celestial: CelestialCatalog,
    playfield: PlayfieldLayout,
    judgeLineYPx: number,
  ) {
    const { centerXPx, widthPx } = playfield;
    this.judgeGlow = addLight(scene, LIGHT_TEXTURES.glow, centerXPx, judgeLineYPx)
      .setDisplaySize(widthPx + JUDGE_GLOW_EXTRA_WIDTH_PX, JUDGE_GLOW_HEIGHT_PX)
      .setTint(COLORS.holdRibbon)
      .setAlpha(JUDGE_GLOW_ALPHA)
      .setDepth(GAMEPLAY_DEPTH.judgeLine);
    this.judgeCore = scene.add
      .image(centerXPx, judgeLineYPx, ensureJudgeLineTexture(scene))
      .setDisplaySize(widthPx, JUDGE_CORE_HEIGHT_PX)
      .setAlpha(JUDGE_CORE_ALPHA)
      .setDepth(GAMEPLAY_DEPTH.judgeLine);

    this.lanes = playfield.laneCenterXPx.map((xPx): LaneFxView => {
      const anchor = addLight(scene, LIGHT_TEXTURES.glow, xPx, judgeLineYPx)
        .setDisplaySize(ANCHOR_WIDTH_PX, ANCHOR_HEIGHT_PX)
        .setTint(COLORS.holdRibbon)
        .setAlpha(ANCHOR_IDLE_ALPHA)
        .setDepth(GAMEPLAY_DEPTH.anchor);
      const pulse = addLight(scene, LIGHT_TEXTURES.column, xPx, judgeLineYPx)
        .setOrigin(0.5, 1)
        .setDisplaySize(COLUMN_WIDTH_PX, COLUMN_HEIGHT_PX)
        .setTint(COLORS.note)
        .setAlpha(0)
        .setDepth(GAMEPLAY_DEPTH.lanePulse);
      // 빛이 아니라 어둡게 덮는 그림자라 SCREEN 합성을 쓰지 않는다.
      const missShade = scene.add
        .image(xPx, judgeLineYPx, LIGHT_TEXTURES.column)
        .setOrigin(0.5, 1)
        .setDisplaySize(COLUMN_WIDTH_PX, COLUMN_HEIGHT_PX)
        .setTint(COLORS.background)
        .setAlpha(0)
        .setDepth(GAMEPLAY_DEPTH.lanePulse);
      // 같은 depth 의 note trail 이 anchor 위에 그려지도록 anchor 다음에 만든다.
      // role anchor 를 그대로 써서 flare core·trail head 가 판정선에 오게 한다.
      const addEffect = (id: LaneEffectId): Phaser.GameObjects.Sprite => {
        const depth = id === NOTE_TRAIL_ID ? GAMEPLAY_DEPTH.anchor : GAMEPLAY_DEPTH.hitFx;
        const presentation = celestial.atlasPresentations[id];
        return addCelestialSprite(scene, presentation, xPx, judgeLineYPx).setDepth(depth);
      };
      // 속성 순서대로 sprite 를 만들므로 같은 depth 의 겹침 순서가 이 순서를 따른다.
      const effects: LaneFxView['effects'] = {
        R34: addEffect('R34'),
        R35: addEffect('R35'),
        R36: addEffect('R36'),
        R32: addEffect('R32'),
        R33: addEffect('R33'),
      };
      const addBloom = (texture: typeof LIGHT_TEXTURES.glow | typeof LIGHT_TEXTURES.column) =>
        addLight(scene, texture, xPx, judgeLineYPx).setTint(COLORS.note).setAlpha(0);
      const bloom = {
        pillar: addBloom(LIGHT_TEXTURES.column)
          .setOrigin(0.5, 1)
          .setDepth(GAMEPLAY_DEPTH.lanePulse),
        haze: addBloom(LIGHT_TEXTURES.glow).setDepth(GAMEPLAY_DEPTH.hitFx),
        streak: addBloom(LIGHT_TEXTURES.glow).setDepth(GAMEPLAY_DEPTH.hitFx),
        core: addBloom(LIGHT_TEXTURES.glow).setDepth(GAMEPLAY_DEPTH.hitFx),
      };
      return {
        anchor,
        pulse,
        missShade,
        effects,
        bloom,
      };
    });
  }

  press(lane: Lane): void {
    const { anchor, pulse } = this.getLane(lane);
    this.scene.tweens.killTweensOf([anchor, pulse]);
    anchor
      .setDisplaySize(ANCHOR_WIDTH_PX * ANCHOR_PRESS_SCALE, ANCHOR_HEIGHT_PX * ANCHOR_PRESS_SCALE)
      .setAlpha(1);
    this.scene.tweens.add({
      targets: anchor,
      alpha: ANCHOR_IDLE_ALPHA,
      displayWidth: ANCHOR_WIDTH_PX,
      displayHeight: ANCHOR_HEIGHT_PX,
      duration: MOTION.fastMs,
    });
    pulse.setAlpha(PULSE_ALPHA);
    this.scene.tweens.add({
      targets: pulse,
      alpha: 0,
      duration: MOTION.fastMs,
    });
  }

  fadeOut(durationMs: number, sinkPx: number): void {
    const targets = [
      this.judgeGlow,
      this.judgeCore,
      ...this.lanes.flatMap(({ anchor, pulse, missShade, effects, bloom }) => [
        anchor,
        pulse,
        missShade,
        ...Object.values(effects),
        ...Object.values(bloom),
      ]),
    ];
    this.scene.tweens.killTweensOf(targets);
    this.scene.tweens.add({
      targets,
      alpha: 0,
      y: `+=${sinkPx}`,
      duration: durationMs,
      ease: 'Cubic.Out',
    });
  }

  setActivation(level: number): void {
    this.judgeGlow.setAlpha(JUDGE_GLOW_ALPHA + JUDGE_GLOW_ACTIVATION_ALPHA * level);
    this.judgeCore.setAlpha(JUDGE_CORE_ALPHA + JUDGE_CORE_ACTIVATION_ALPHA * level);
  }

  judge(event: JudgmentEvent): void {
    const view = this.getLane(event.lane);
    switch (event.judgment) {
      case 'perfect':
      case 'great':
        break;
      case 'good':
      case 'bad':
        this.flashAnchor(view.anchor, ANCHOR_GOOD_ALPHA, MOTION.fastMs);
        break;
      case 'miss':
        this.flashAnchor(view.anchor, 0, ANCHOR_MISS_RECOVER_MS);
        this.scene.tweens.killTweensOf(view.missShade);
        view.missShade.setAlpha(MISS_SHADE_ALPHA);
        this.scene.tweens.add({
          targets: view.missShade,
          alpha: 0,
          duration: MISS_SHADE_FADE_MS,
        });
        break;
    }
    this.playBloom(view.bloom, getHitBloomIntensity(event.judgment));
    getLaneEffectIds(event).forEach((id) => playCelestialOnce(view.effects[id]));
  }

  private getLane(lane: Lane): LaneFxView {
    return requireDefined(this.lanes[lane], 'Unknown lane', lane);
  }

  private playBloom(bloom: LaneFxView['bloom'], intensity: number): void {
    if (intensity === 0) {
      return;
    }
    for (const layer of Object.keys(HIT_BLOOM) as HitBloomLayer[]) {
      const { widthPx, heightPx, alpha, durationMs } = HIT_BLOOM[layer];
      const image = bloom[layer];
      this.scene.tweens.killTweensOf(image);
      // 시작 순간에 최고 밝기로 켜고(0ms) 감속하며 사라지게 해 "툭" 치고 "길게" 남긴다.
      image.setDisplaySize(widthPx[0], heightPx[0]).setAlpha(alpha * intensity);
      this.scene.tweens.add({
        targets: image,
        displayWidth: widthPx[1],
        displayHeight: heightPx[1],
        alpha: 0,
        duration: durationMs,
        ease: 'Cubic.Out',
      });
    }
  }

  // press 의 scale pulse 를 끊으므로 idle 크기로 되돌린 뒤 판정 flash 를 건다.
  private flashAnchor(anchor: Phaser.GameObjects.Image, alpha: number, recoverMs: number): void {
    this.scene.tweens.killTweensOf(anchor);
    anchor.setDisplaySize(ANCHOR_WIDTH_PX, ANCHOR_HEIGHT_PX).setAlpha(alpha);
    this.scene.tweens.add({
      targets: anchor,
      alpha: ANCHOR_IDLE_ALPHA,
      duration: recoverMs,
    });
  }
}
