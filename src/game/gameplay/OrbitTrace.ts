import type Phaser from 'phaser';
import { LIGHT_TEXTURES, addLight } from '../ui/lightTextures.js';
import { COLORS, GAMEPLAY_DEPTH } from '../ui/theme.js';

// 밝은 곡 화면 위에서도 궤적이 읽히도록 선 아래에 얇은 그림자 띠를 깐다.
const SHADOW_HEIGHT_PX = 8;
const SHADOW_ALPHA = 0.35;
const TRACK_HEIGHT_PX = 2;
const TRACK_ALPHA = 0.6;
const PASSED_HEIGHT_PX = 2;
// 지나간 구간은 웹 seek bar 처럼 튀지 않도록 track 보다 조금만 밝게 둔다.
const PASSED_ALPHA = 0.4;
const PASSED_GLOW_HEIGHT_PX = 6;
const PASSED_GLOW_ALPHA = 0.05;
const ANCHOR_RADIUS_PX = 3;
const ANCHOR_ALPHA = 0.8;
const STAR_SIZE_PX = 24;

/**
 * 곡의 진행을 가는 궤도 위를 지나는 작은 별빛으로 보여 준다. 지나간 경로만 은은하게 밝아진다.
 * 시간 정보라 노트보다 낮은 에너지로 그리고 스스로 반짝이지 않는다.
 */
export class OrbitTrace {
  private readonly passed: Phaser.GameObjects.Rectangle;
  private readonly passedGlow: Phaser.GameObjects.Rectangle;
  private readonly star: Phaser.GameObjects.Image;
  private progress = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly leftXPx: number,
    private readonly widthPx: number,
    yPx: number,
  ) {
    const depth = GAMEPLAY_DEPTH.text;
    scene.add
      .rectangle(leftXPx, yPx, widthPx, SHADOW_HEIGHT_PX, COLORS.background)
      .setOrigin(0, 0.5)
      .setAlpha(SHADOW_ALPHA)
      .setDepth(depth);
    scene.add
      .rectangle(leftXPx, yPx, widthPx, TRACK_HEIGHT_PX, COLORS.nightTrace)
      .setOrigin(0, 0.5)
      .setAlpha(TRACK_ALPHA)
      .setDepth(depth);
    [leftXPx, leftXPx + widthPx].forEach((xPx) => {
      scene.add
        .circle(xPx, yPx, ANCHOR_RADIUS_PX, COLORS.noteShade)
        .setAlpha(ANCHOR_ALPHA)
        .setDepth(depth);
    });
    this.passedGlow = scene.add
      .rectangle(leftXPx, yPx, 0, PASSED_GLOW_HEIGHT_PX, COLORS.note)
      .setOrigin(0, 0.5)
      .setAlpha(PASSED_GLOW_ALPHA)
      .setDepth(depth);
    this.passed = scene.add
      .rectangle(leftXPx, yPx, 0, PASSED_HEIGHT_PX, COLORS.note)
      .setOrigin(0, 0.5)
      .setAlpha(PASSED_ALPHA)
      .setDepth(depth);
    this.star = addLight(scene, LIGHT_TEXTURES.star, leftXPx, yPx)
      .setDisplaySize(STAR_SIZE_PX, STAR_SIZE_PX)
      .setDepth(depth);
  }

  /** progress 는 0~1 로 이미 정규화된 곡 진행률이다. 같은 값이면 다시 그리지 않는다. */
  setProgress(progress: number): void {
    if (progress === this.progress) {
      return;
    }
    this.progress = progress;
    const passedWidthPx = this.widthPx * progress;
    this.passed.setSize(passedWidthPx, PASSED_HEIGHT_PX);
    this.passedGlow.setSize(passedWidthPx, PASSED_GLOW_HEIGHT_PX);
    this.star.setX(this.leftXPx + passedWidthPx);
  }
}
