import type Phaser from 'phaser';
import { QUIET_PADDING_PX } from '../ui/Button.js';
import type { Button } from '../ui/Button.js';

export const YOUTUBE_HEART_IMAGE = {
  key: 'ui:youtube-heart',
  url: '/assets/ui/main/youtube-heart.png',
} as const;

// 큰 하트·작은 하트가 차례로 뿅, 뿅 떠오르도록 시작 시각과 위치를 엇갈린다.
const HEARTS = [
  {
    delayMs: 0,
    offsetXPx: -14,
    widthPx: 26,
  },
  {
    delayMs: 180,
    offsetXPx: 16,
    widthPx: 18,
  },
] as const;
const HEART_GAP_Y_PX = 14;
// 아트 디렉션이 반동(spring bounce)을 금지하므로 커지기만 하고 넘치지 않는다.
const POP_START_SCALE = 0.6;
const POP_MS = 200;
const RISE_PX = 28;
const RISE_MS = 900;
const FADE_MS = 700;

export function playYoutubeHearts(scene: Phaser.Scene, button: Button): void {
  // 하트는 선택 리소스라 로드에 실패했으면 띄우지 않는다.
  if (!scene.textures.exists(YOUTUBE_HEART_IMAGE.key)) {
    return;
  }
  const centerXPx = button.x + button.width / 2;
  const yPx = button.y + QUIET_PADDING_PX.yPx - HEART_GAP_Y_PX;
  HEARTS.forEach(({ delayMs, offsetXPx, widthPx }) => {
    const heart = scene.add.image(centerXPx + offsetXPx, yPx, YOUTUBE_HEART_IMAGE.key).setAlpha(0);
    const scale = widthPx / heart.width;
    heart.setScale(scale * POP_START_SCALE);
    scene.tweens.chain({
      targets: heart,
      tweens: [
        {
          scale,
          alpha: 1,
          delay: delayMs,
          duration: POP_MS,
          ease: 'Cubic.Out',
        },
        {
          alpha: 0,
          duration: FADE_MS,
        },
      ],
      onComplete: () => heart.destroy(),
    });
    scene.tweens.add({
      targets: heart,
      y: yPx - RISE_PX,
      delay: delayMs,
      duration: RISE_MS,
      ease: 'Cubic.Out',
    });
  });
}
