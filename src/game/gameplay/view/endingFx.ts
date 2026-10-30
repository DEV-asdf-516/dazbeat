import Phaser from 'phaser';
import { requireDefined } from '../../../invariant.js';
import type { CelestialAtlasId, CelestialCatalog } from '../../celestial/state/celestialCatalog.js';
import { GAME_WIDTH } from '../../app/config.js';
import { addLight } from '../../ui/view/textures/lightTextures.js';
import { COLORS, GAMEPLAY_DEPTH, JUDGMENT_COLORS, MOTION, textStyle } from '../../ui/view/theme.js';
import { GAMEPLAY_FAILURE_STARS } from '../state/failureStars.js';
import { addHudEffect, addHudText } from './hudObjects.js';
import type { StarlightGauge } from './StarlightGauge.js';

const SCREEN_CENTER_X_PX = GAME_WIDTH / 2;
const FAILURE_STAR_APPEAR_MS = 300;
const FAILURE_STAR_HOLD_MS = 200;
const FAILURE_STAR_STAGGER_MS = 100;
const FAILURE_STAR_FADE_MS = 360;
const FAILED_Y_PX = 440;
const FAILED_HOLD_MS = 600;
// 콤보 숫자·COMBO 라벨(y 360~430)과 판정 글자(y 780) 사이에 둔다.
const ENDING_TITLE_Y_PX = 600;
const ENDING_POP_SCALE = 1.12;
const ENDING_FLASH_MS = 360;
// 결과 화면으로 넘어가기 전에 CLEAR·FULL COMBO 를 읽을 수 있을 만큼 머문다.
const ENDING_HOLD_MS = 1100;
const ENDING_STREAK_WIDTH_PX = 900;
const ENDING_STREAK_ALPHA = 0.6;
const ENDING_STREAK_REVEAL_MS = 420;
const ENDING_STREAK_FADE_DELAY_MS = 520;
const ENDING_STREAK_FADE_MS = 900;
const CLEAR_STREAK = {
  key: 'ending-streak',
  url: '/assets/ui/gameplay/ending-streak.png',
} as const;
// 곱하기 tint 로는 은청색 빛줄기가 금색이 되지 않아 금색으로 섞은 이미지를 따로 둔다.
const FULL_COMBO_STREAK = {
  key: 'ending-streak-gold',
  url: '/assets/ui/gameplay/ending-streak-gold.png',
} as const;
const CLEAR_LETTER_SPACING_PX = 6;
const FULL_COMBO_SPARKLE_IDS = [
  'R07',
  'R09',
  'R08',
  'R06',
] as const satisfies readonly CelestialAtlasId[];
// 반짝이가 박자처럼 두 번(짝, 짝) 터지도록 묶음마다 시작 시각을 둔다.
const FULL_COMBO_SPARKLE_BEATS_MS = [0, 230] as const;
const FULL_COMBO_SPARKLES_PER_BEAT = 9;
const FULL_COMBO_SPARKLE_RADIUS_PX = {
  x: 270,
  y: 78,
} as const;
// 고르게 나눈 각도·반경에서 조금씩 흐트러뜨려 줄지어 보이지 않게 한다.
const FULL_COMBO_SPARKLE_ANGLE_JITTER_RAD = 0.2;
const FULL_COMBO_SPARKLE_RADIUS_SCALE = [0.85, 1.15] as const;
const FULL_COMBO_SPARKLE_ROTATION_RAD = [0, 0.6] as const;
const FULL_COMBO_SPARKLE_SCALE = [0.17, 0.34] as const;
const FULL_COMBO_SPARKLE_DRIFT_PX = 20;
const FULL_COMBO_SPARKLE_JITTER_MS = 60;
const FULL_COMBO_SPARKLE_POP_MS = 100;
const FULL_COMBO_SPARKLE_FADE_MS = [320, 500] as const;

export const ENDING_IMAGES = [CLEAR_STREAK, FULL_COMBO_STREAK] as const;

export const ENDING_FX_IDS: readonly CelestialAtlasId[] = [
  ...FULL_COMBO_SPARKLE_IDS,
  ...GAMEPLAY_FAILURE_STARS.map(({ id }) => id),
];

export function playClearFx(scene: Phaser.Scene, onDone: () => void): void {
  const label = addEndingTitle(scene, 'CLEAR', COLORS.noteShade, CLEAR_STREAK.key);
  label.setLetterSpacing(CLEAR_LETTER_SPACING_PX);
  scene.time.delayedCall(MOTION.mediumMs + ENDING_HOLD_MS, onDone);
}

export function playFullComboFx(
  scene: Phaser.Scene,
  celestial: CelestialCatalog,
  onDone: () => void,
): void {
  const color = JUDGMENT_COLORS.perfect;
  addEndingTitle(scene, 'FULL COMBO', color, FULL_COMBO_STREAK.key);
  FULL_COMBO_SPARKLE_BEATS_MS.forEach((beatMs, beat) => {
    for (let index = 0; index < FULL_COMBO_SPARKLES_PER_BEAT; index += 1) {
      // 두 번째 묶음은 첫 묶음 사이사이에서 터지도록 각도를 반 칸 돌린다.
      const angle =
        ((index + beat / 2) / FULL_COMBO_SPARKLES_PER_BEAT) * Math.PI * 2 +
        Phaser.Math.FloatBetween(
          -FULL_COMBO_SPARKLE_ANGLE_JITTER_RAD,
          FULL_COMBO_SPARKLE_ANGLE_JITTER_RAD,
        );
      const radius = Phaser.Math.FloatBetween(...FULL_COMBO_SPARKLE_RADIUS_SCALE);
      const directionX = Math.cos(angle);
      const directionY = Math.sin(angle);
      const xPx = SCREEN_CENTER_X_PX + directionX * FULL_COMBO_SPARKLE_RADIUS_PX.x * radius;
      const yPx = ENDING_TITLE_Y_PX + directionY * FULL_COMBO_SPARKLE_RADIUS_PX.y * radius;
      const id = requireDefined(
        FULL_COMBO_SPARKLE_IDS[index % FULL_COMBO_SPARKLE_IDS.length],
        'Missing sparkle id',
        index,
      );
      const sparkle = addHudEffect(scene, celestial, id, xPx, yPx)
        .setTint(color)
        .setRotation(Phaser.Math.FloatBetween(...FULL_COMBO_SPARKLE_ROTATION_RAD))
        .setScale(0);
      const delayMs = beatMs + Phaser.Math.FloatBetween(0, FULL_COMBO_SPARKLE_JITTER_MS);
      const fadeMs = Phaser.Math.FloatBetween(...FULL_COMBO_SPARKLE_FADE_MS);
      scene.tweens.chain({
        targets: sparkle,
        tweens: [
          {
            scale: Phaser.Math.FloatBetween(...FULL_COMBO_SPARKLE_SCALE),
            delay: delayMs,
            duration: FULL_COMBO_SPARKLE_POP_MS,
            ease: 'Back.Out',
          },
          {
            scale: 0,
            duration: fadeMs,
            ease: 'Cubic.Out',
          },
        ],
        onComplete: () => sparkle.destroy(),
      });
      scene.tweens.add({
        targets: sparkle,
        x: xPx + directionX * FULL_COMBO_SPARKLE_DRIFT_PX,
        y: yPx + directionY * FULL_COMBO_SPARKLE_DRIFT_PX,
        delay: delayMs,
        duration: FULL_COMBO_SPARKLE_POP_MS + fadeMs,
        ease: 'Cubic.Out',
      });
    }
  });
  scene.time.delayedCall(MOTION.mediumMs + ENDING_HOLD_MS, onDone);
}

function addEndingTitle(
  scene: Phaser.Scene,
  text: string,
  color: number,
  streakKey: string,
): Phaser.GameObjects.Text {
  // 빛줄기는 선택 리소스라 로드에 실패했으면 글자만 띄운다.
  if (scene.textures.exists(streakKey)) {
    const streak = addLight(scene, streakKey, SCREEN_CENTER_X_PX, ENDING_TITLE_Y_PX)
      .setDepth(GAMEPLAY_DEPTH.text)
      .setAlpha(ENDING_STREAK_ALPHA);
    streak.setScale(ENDING_STREAK_WIDTH_PX / streak.width).setCrop(0, 0, 0, streak.height);
    // 왼쪽부터 오른쪽으로 펼쳐지도록 잘라 보이는 폭을 늘린다.
    scene.tweens.addCounter({
      from: 0,
      to: streak.width,
      duration: ENDING_STREAK_REVEAL_MS,
      ease: 'Cubic.Out',
      onUpdate: (tween) => streak.setCrop(0, 0, tween.getValue() ?? 0, streak.height),
    });
    scene.tweens.add({
      targets: streak,
      alpha: 0,
      delay: ENDING_STREAK_FADE_DELAY_MS,
      duration: ENDING_STREAK_FADE_MS,
      onComplete: () => streak.destroy(),
    });
  }
  const label = addHudText(
    scene,
    SCREEN_CENTER_X_PX,
    ENDING_TITLE_Y_PX,
    text,
    textStyle('title', color),
  )
    .setAlpha(0)
    .setScale(ENDING_POP_SCALE);
  const flash = addHudText(
    scene,
    SCREEN_CENTER_X_PX,
    ENDING_TITLE_Y_PX,
    text,
    textStyle('title', COLORS.note),
  )
    .setBlendMode(Phaser.BlendModes.SCREEN)
    .setScale(ENDING_POP_SCALE);
  // 플래시가 글자와 같은 크기로 줄어들어야 획이 어긋나 겹쳐 보이지 않는다.
  scene.tweens.add({
    targets: [label, flash],
    scale: 1,
    duration: MOTION.mediumMs,
    ease: 'Back.Out',
  });
  scene.tweens.add({
    targets: label,
    alpha: 1,
    duration: MOTION.fastMs,
  });
  scene.tweens.add({
    targets: flash,
    alpha: 0,
    duration: ENDING_FLASH_MS,
    ease: 'Quad.Out',
  });
  return label;
}

export function playFailureFx(
  scene: Phaser.Scene,
  celestial: CelestialCatalog,
  // 별빛 게이지는 표준 모드 HUD 에만 있다.
  starlight: StarlightGauge | null,
  onDone: () => void,
): void {
  if (starlight !== null) {
    starlight.extinguish();
  }
  // 게이지 소멸(StarlightGauge.extinguish 의 MOTION.mediumMs)이 끝난 뒤에 별이 등장한다.
  const gaugeGoneMs = MOTION.mediumMs;
  const starsFadedMs =
    gaugeGoneMs +
    FAILURE_STAR_APPEAR_MS +
    FAILURE_STAR_HOLD_MS +
    FAILURE_STAR_STAGGER_MS * (GAMEPLAY_FAILURE_STARS.length - 1) +
    FAILURE_STAR_FADE_MS;
  GAMEPLAY_FAILURE_STARS.forEach(({ id, xPx, yPx, scale, phaseFraction }, index) => {
    const star = addHudEffect(scene, celestial, id, xPx, yPx, phaseFraction);
    const alpha = star.alpha;
    star.setScale(scale).setAlpha(0);
    scene.tweens.chain({
      targets: star,
      tweens: [
        {
          alpha,
          delay: gaugeGoneMs,
          duration: FAILURE_STAR_APPEAR_MS,
        },
        {
          alpha: 0,
          delay: FAILURE_STAR_HOLD_MS + FAILURE_STAR_STAGGER_MS * index,
          duration: FAILURE_STAR_FADE_MS,
        },
      ],
    });
  });
  const failed = addHudText(
    scene,
    SCREEN_CENTER_X_PX,
    FAILED_Y_PX,
    'FAILED',
    textStyle('title', JUDGMENT_COLORS.miss),
  ).setAlpha(0);
  scene.tweens.add({
    targets: failed,
    alpha: 1,
    delay: starsFadedMs,
    duration: MOTION.mediumMs,
    onComplete: () => scene.time.delayedCall(FAILED_HOLD_MS, onDone),
  });
}
