import Phaser from 'phaser';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import { playCelestialOnce } from '../celestial/celestialSprites.js';
import { GAME_WIDTH } from '../config.js';
import { LIGHT_TEXTURES, addLight } from '../ui/lightTextures.js';
import { COLORS, GAMEPLAY_DEPTH, JUDGMENT_COLORS, MOTION, textStyle } from '../ui/theme.js';
import { GAMEPLAY_FAILURE_STARS } from './failureStars.js';
import { addHudEffect, addHudText, setTextShadow } from './hudObjects.js';
import type { TextShadow } from './hudObjects.js';
import { JUDGMENT_SHIMMER_ID } from './judgmentEffects.js';
import type { StarlightGauge } from './StarlightGauge.js';

const SCREEN_CENTER_X_PX = GAME_WIDTH / 2;
const FAILURE_STAR_APPEAR_MS = 300;
const FAILURE_STAR_HOLD_MS = 200;
const FAILURE_STAR_STAGGER_MS = 100;
const FAILURE_STAR_FADE_MS = 360;
const FAILED_Y_PX = 440;
const FAILED_HOLD_MS = 600;
// 콤보 숫자·COMBO 라벨·반짝임(y 360~470)과 판정 글자(y 780) 사이에 둔다.
const FULL_COMBO_Y_PX = 600;
const FULL_COMBO_POP_SCALE = 1.25;
const FULL_COMBO_FLASH_MS = 360;
// 영상이 밝아도 금색 글자가 읽히도록 글자 바로 뒤에 짙은 밤색 그림자를 깐다.
const FULL_COMBO_SHADOW: TextShadow = {
  offsetXPx: 0,
  offsetYPx: 3,
  color: 'rgba(8, 15, 32, 0.85)',
  blurPx: 14,
} as const;
// 둥근 빛 하나를 가로로 늘리면 큰 타원이 되므로, 둥근 빛 여럿을 글자를 따라 겹쳐 글자 모양대로 번지게 한다.
// SCREEN 으로 겹쳐 더해지므로 하나의 alpha 는 낮게 둔다.
const FULL_COMBO_GLOW_POINTS = [-0.8, -0.4, 0, 0.4, 0.8] as const;
const FULL_COMBO_GLOW_SIZE_PX = [56, 150] as const;
const FULL_COMBO_GLOW_PEAK_ALPHA = 0.32;
const FULL_COMBO_GLOW_REST_ALPHA = 0.16;
const FULL_COMBO_TWINKLE_ID = 'R28';
const FULL_COMBO_TWINKLES = [
  {
    x: -1.06,
    y: -0.85,
    haloSizePx: 44,
    delayMs: 100,
  },
  {
    x: 1.08,
    y: -0.6,
    haloSizePx: 32,
    delayMs: 260,
  },
  {
    x: 0.98,
    y: 1.0,
    haloSizePx: 40,
    delayMs: 420,
  },
] as const;
// 매니페스트 scaleRange 의 최대값이다. 십자만으로는 작아서 뒤에 금빛 광점을 함께 키웠다 줄인다.
const FULL_COMBO_TWINKLE_SCALE = 0.25;
const FULL_COMBO_TWINKLE_HALO_MS = 260;
// 64px 글자의 아랫선과 겹치지 않는 높이에서 판정 반짝임과 같은 천체 효과를 한 번 튼다.
const FULL_COMBO_SHIMMER_OFFSET_Y_PX = 64;
// 결과 화면으로 넘어가기 전에 FULL COMBO 를 읽을 수 있을 만큼 머문다.
const FULL_COMBO_HOLD_MS = 1100;

export function playFullComboFx(
  scene: Phaser.Scene,
  celestial: CelestialCatalog,
  onDone: () => void,
): void {
  const color = JUDGMENT_COLORS.perfect;
  // 같은 depth 에서 글로우 → 글자 → 플래시 순으로 겹치도록 만드는 순서를 지킨다.
  // 글로우 위치는 글자 폭을 알아야 정해지므로 글자를 만든 뒤 옮긴다.
  const glows = FULL_COMBO_GLOW_POINTS.map((point) => ({
    point,
    image: addLight(scene, LIGHT_TEXTURES.glow, SCREEN_CENTER_X_PX, FULL_COMBO_Y_PX)
      .setDepth(GAMEPLAY_DEPTH.text)
      .setTint(color)
      .setDisplaySize(FULL_COMBO_GLOW_SIZE_PX[0], FULL_COMBO_GLOW_SIZE_PX[0])
      .setAlpha(0),
  }));
  const label = setTextShadow(
    addHudText(scene, SCREEN_CENTER_X_PX, FULL_COMBO_Y_PX, 'FULL COMBO', textStyle('title', color)),
    FULL_COMBO_SHADOW,
  )
    .setAlpha(0)
    .setScale(FULL_COMBO_POP_SCALE);
  const flash = addHudText(
    scene,
    SCREEN_CENTER_X_PX,
    FULL_COMBO_Y_PX,
    'FULL COMBO',
    textStyle('title', COLORS.note),
  )
    .setBlendMode(Phaser.BlendModes.SCREEN)
    .setScale(FULL_COMBO_POP_SCALE);
  const halfWidthPx = label.width / 2;
  const halfHeightPx = label.height / 2;
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
    duration: FULL_COMBO_FLASH_MS,
    ease: 'Quad.Out',
  });
  glows.forEach(({ point, image }) => image.setX(SCREEN_CENTER_X_PX + point * halfWidthPx));
  scene.tweens.chain({
    targets: glows.map(({ image }) => image),
    tweens: [
      {
        alpha: FULL_COMBO_GLOW_PEAK_ALPHA,
        displayWidth: FULL_COMBO_GLOW_SIZE_PX[1],
        displayHeight: FULL_COMBO_GLOW_SIZE_PX[1],
        duration: MOTION.mediumMs,
        ease: 'Cubic.Out',
      },
      {
        alpha: FULL_COMBO_GLOW_REST_ALPHA,
        duration: MOTION.mediumMs,
      },
    ],
  });
  FULL_COMBO_TWINKLES.forEach(({ x, y, haloSizePx, delayMs }) => {
    const xPx = SCREEN_CENTER_X_PX + x * halfWidthPx;
    const yPx = FULL_COMBO_Y_PX + y * halfHeightPx;
    const halo = addLight(scene, LIGHT_TEXTURES.star, xPx, yPx)
      .setDepth(GAMEPLAY_DEPTH.text)
      .setTint(color)
      .setDisplaySize(0, 0);
    scene.tweens.add({
      targets: halo,
      displayWidth: haloSizePx,
      displayHeight: haloSizePx,
      delay: delayMs,
      duration: FULL_COMBO_TWINKLE_HALO_MS,
      ease: 'Quad.Out',
      yoyo: true,
    });
    const twinkle = addHudEffect(scene, celestial, FULL_COMBO_TWINKLE_ID, xPx, yPx);
    twinkle.setScale(FULL_COMBO_TWINKLE_SCALE);
    // 광점이 가장 클 때 십자가 번쩍이도록 광점이 커지는 시간만큼 늦춘다.
    scene.time.delayedCall(delayMs + FULL_COMBO_TWINKLE_HALO_MS, () => playCelestialOnce(twinkle));
  });
  const shimmer = addHudEffect(
    scene,
    celestial,
    JUDGMENT_SHIMMER_ID,
    SCREEN_CENTER_X_PX,
    FULL_COMBO_Y_PX + FULL_COMBO_SHIMMER_OFFSET_Y_PX,
  );
  playCelestialOnce(shimmer);
  scene.time.delayedCall(MOTION.mediumMs + FULL_COMBO_HOLD_MS, onDone);
}

export function playFailureFx(
  scene: Phaser.Scene,
  celestial: CelestialCatalog,
  starlight: StarlightGauge,
  onDone: () => void,
): void {
  starlight.extinguish();
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
