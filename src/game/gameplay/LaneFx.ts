import type Phaser from 'phaser';
import { mapLanes } from '../../rhythm/lanes.js';
import type { JudgmentEvent, Lane } from '../../rhythm/types.js';
import { getAtlasPresentation } from '../celestial/celestialCatalog.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import { LANE_EFFECT_IDS, getHitBloomIntensity, getLaneEffectIds } from './judgmentEffects.js';
import type { LaneEffectId } from './judgmentEffects.js';
import { addCelestialSprite, playCelestialOnce } from '../celestial/celestialSprites.js';
import { LIGHT_TEXTURES, addLight, ensureJudgeLineTexture } from '../ui/lightTextures.js';
import { COLORS, GAMEPLAY_DEPTH, MOTION } from '../ui/theme.js';

// 상시 판정선은 노트가 도착하는 얇은 수평선이다. 상시 halo 가 노트보다 먼저 보이지 않게 낮게 둔다.
const JUDGE_CORE_WIDTH_PX = 480;
const JUDGE_CORE_HEIGHT_PX = 2;
const JUDGE_CORE_ALPHA = 0.6;
const JUDGE_CORE_ACTIVATION_ALPHA = 0.25;
const JUDGE_GLOW_WIDTH_PX = 520;
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
// 노트·hold 아래에 깔리도록 anchor 층에 둔다.
const NOTE_TRAIL_ID: LaneEffectId = 'R33';

/**
 * 타격 빛 번짐. "큥"(즉시 번쩍이고 바로 꺼지는 코어) → "밧"(판정선을 따라 퍼지는 빛줄기)
 * → "룽"(천천히 피어올라 옅어지는 진주빛 안개와 위로 솟는 기둥) 순서로 길이가 길어진다.
 * 크기는 [시작, 끝] px, alpha 는 PERFECT 기준 최고값이며 판정 세기를 곱한다.
 */
const HIT_BLOOM = {
  core: { widthPx: [96, 40], heightPx: [96, 40], alpha: 1, durationMs: 120 },
  streak: { widthPx: [160, 560], heightPx: [10, 4], alpha: 0.9, durationMs: 260 },
  haze: { widthPx: [160, 380], heightPx: [70, 150], alpha: 0.7, durationMs: 420 },
  // 위로 갈수록 사라지는 기둥이라 다가오는 노트를 가리지 않는다.
  pillar: { widthPx: [110, 150], heightPx: [200, 460], alpha: 0.5, durationMs: 440 },
} as const;
type HitBloomLayer = keyof typeof HIT_BLOOM;

interface LaneFxView {
  anchor: Phaser.GameObjects.Image;
  pulse: Phaser.GameObjects.Image;
  missShade: Phaser.GameObjects.Image;
  effects: ReadonlyMap<LaneEffectId, Phaser.GameObjects.Sprite | null>;
  bloom: Record<HitBloomLayer, Phaser.GameObjects.Image>;
}

export class LaneFx {
  private readonly judgeGlow: Phaser.GameObjects.Image;
  private readonly judgeCore: Phaser.GameObjects.Image;
  private readonly lanes: Record<Lane, LaneFxView>;

  constructor(
    private readonly scene: Phaser.Scene,
    celestial: CelestialCatalog,
    laneCenterXPx: Record<Lane, number>,
    judgeLineYPx: number,
  ) {
    const centerXPx = (laneCenterXPx[0] + laneCenterXPx[3]) / 2;
    this.judgeGlow = addLight(scene, LIGHT_TEXTURES.glow, centerXPx, judgeLineYPx)
      .setDisplaySize(JUDGE_GLOW_WIDTH_PX, JUDGE_GLOW_HEIGHT_PX)
      .setTint(COLORS.holdRibbon)
      .setAlpha(JUDGE_GLOW_ALPHA)
      .setDepth(GAMEPLAY_DEPTH.judgeLine);
    this.judgeCore = scene.add
      .image(centerXPx, judgeLineYPx, ensureJudgeLineTexture(scene))
      .setDisplaySize(JUDGE_CORE_WIDTH_PX, JUDGE_CORE_HEIGHT_PX)
      .setAlpha(JUDGE_CORE_ALPHA)
      .setDepth(GAMEPLAY_DEPTH.judgeLine);

    const effectPresentations = LANE_EFFECT_IDS.map(
      (id) => [id, getAtlasPresentation(celestial, id)] as const,
    );
    this.lanes = mapLanes((lane): LaneFxView => {
      const xPx = laneCenterXPx[lane];
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
      const effects = new Map(
        effectPresentations.map(([id, presentation]) => {
          const depth = id === NOTE_TRAIL_ID ? GAMEPLAY_DEPTH.anchor : GAMEPLAY_DEPTH.hitFx;
          const sprite =
            addCelestialSprite(scene, presentation, xPx, judgeLineYPx)?.setDepth(depth) ?? null;
          return [id, sprite] as const;
        }),
      );
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
      return { anchor, pulse, missShade, effects, bloom };
    });
  }

  press(lane: Lane): void {
    const { anchor, pulse } = this.lanes[lane];
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
    this.scene.tweens.add({ targets: pulse, alpha: 0, duration: MOTION.fastMs });
  }

  setActivation(level: number): void {
    this.judgeGlow.setAlpha(JUDGE_GLOW_ALPHA + JUDGE_GLOW_ACTIVATION_ALPHA * level);
    this.judgeCore.setAlpha(JUDGE_CORE_ALPHA + JUDGE_CORE_ACTIVATION_ALPHA * level);
  }

  /** lane × role 마다 sprite 하나를 재사용하므로 같은 lane 의 새 판정은 그 효과를 처음부터 다시 재생한다. */
  judge(event: JudgmentEvent): void {
    const view = this.lanes[event.lane];
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
    getLaneEffectIds(event).forEach((id) => {
      const sprite = view.effects.get(id);
      if (sprite === undefined) {
        throw new Error(`Missing lane effect sprite: ${id}`);
      }
      if (sprite !== null) {
        playCelestialOnce(sprite);
      }
    });
  }

  /** 같은 lane 의 새 타격은 남은 번짐을 끊고 처음부터 다시 피운다. */
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
    this.scene.tweens.add({ targets: anchor, alpha: ANCHOR_IDLE_ALPHA, duration: recoverMs });
  }
}
