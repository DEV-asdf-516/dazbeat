import type Phaser from 'phaser';
import type { CelestialAtlasPresentation, CelestialCatalog } from './celestialCatalog.js';
import { queueImageLoads } from '../ui/imageLoad.js';

export function queueCelestialTextures(scene: Phaser.Scene, catalog: CelestialCatalog): void {
  queueImageLoads(scene, catalog.textures, 'celestial texture');
}

/** 텍스처·animation 관리자는 게임 전역이므로 이미 등록된 frame·animation 은 다시 만들지 않는다. */
export function registerCelestialAnimations(scene: Phaser.Scene, catalog: CelestialCatalog): void {
  catalog.atlasFrames.forEach(({ textureKey, frames }) => {
    if (!scene.textures.exists(textureKey)) {
      return;
    }
    const texture = scene.textures.get(textureKey);
    frames.forEach(({ frameName, xPx, yPx, widthPx, heightPx }) => {
      if (!texture.has(frameName)) {
        texture.add(frameName, 0, xPx, yPx, widthPx, heightPx);
      }
    });
  });
  const presentations = [
    ...catalog.presentations.values(),
    ...catalog.nodeOnlyFinish.map((step) => step.presentation),
  ];
  presentations.forEach((presentation) => {
    if (
      presentation.kind !== 'atlas' ||
      presentation.frames.length < 2 ||
      !scene.textures.exists(presentation.textureKey) ||
      scene.anims.exists(presentation.animationKey)
    ) {
      return;
    }
    // animation 수준 frameRate·duration 을 주지 않아야 frame 별 duration 이 그대로 다음 frame 시점이 된다.
    scene.anims.create({
      key: presentation.animationKey,
      frames: presentation.frames.map(({ frameName, durationMs }) => ({
        key: presentation.textureKey,
        frame: frameName,
        duration: durationMs,
      })),
      repeat: presentation.isLoop ? -1 : 0,
    });
  });
}

/**
 * 텍스처가 없으면 null. 정적 role 은 보이는 정적 sprite, loop 는 위상 frame 부터 재생 중인 sprite,
 * one-shot 은 숨긴 채 재생을 기다리는 sprite 를 만든다.
 */
export function addCelestialSprite(
  scene: Phaser.Scene,
  presentation: CelestialAtlasPresentation,
  xPx: number,
  yPx: number,
  phaseFraction = 0,
): Phaser.GameObjects.Sprite | null {
  if (!scene.textures.exists(presentation.textureKey)) {
    return null;
  }
  const sprite = scene.add.sprite(xPx, yPx, presentation.textureKey);
  applyPresentation(sprite, presentation);
  if (presentation.frames.length === 1) {
    return sprite;
  }
  if (presentation.isLoop) {
    return sprite.play({
      key: presentation.animationKey,
      startFrame: getPhaseFrameIndex(presentation, phaseFraction),
    });
  }
  // 재생 전 animation 을 붙여 두려고 시작 직후 멈춘다. 재생은 playCelestialOnce 가 처음부터 한다.
  return sprite.play(presentation.animationKey).stop().setVisible(false);
}

/** 보이게 하고 첫 frame 부터 재생한 뒤 끝나면 숨긴다. 재생 중이면 처음부터 다시 시작한다. */
export function playCelestialOnce(sprite: Phaser.GameObjects.Sprite): void {
  sprite.setVisible(true).play({ key: requireAnimationKey(sprite), hideOnComplete: true });
}

export function setCelestialLoopActive(sprite: Phaser.GameObjects.Sprite, isActive: boolean): void {
  if (sprite.anims.isPlaying === isActive) {
    return;
  }
  if (isActive) {
    sprite.setVisible(true).play(requireAnimationKey(sprite));
  } else {
    sprite.stop().setVisible(false);
  }
}

/** 정적 presentation 의 frame·scale·origin·opacity 로 바꾼다(상태 전환용). */
export function applyCelestialPresentation(
  sprite: Phaser.GameObjects.Sprite,
  presentation: CelestialAtlasPresentation,
): void {
  if (presentation.frames.length !== 1) {
    throw new Error(`Celestial presentation ${presentation.animationKey} is not static`);
  }
  applyPresentation(sprite, presentation);
}

function applyPresentation(
  sprite: Phaser.GameObjects.Sprite,
  presentation: CelestialAtlasPresentation,
): void {
  const [firstFrame] = presentation.frames;
  if (firstFrame === undefined) {
    throw new Error(`Celestial presentation ${presentation.animationKey} has no frames`);
  }
  sprite
    .setTexture(presentation.textureKey, firstFrame.frameName)
    .setScale(...presentation.scaleXY)
    .setOrigin(...presentation.originXY)
    .setAlpha(presentation.opacity);
}

function requireAnimationKey(sprite: Phaser.GameObjects.Sprite): string {
  const animation = sprite.anims.currentAnim;
  if (animation === null) {
    throw new Error('Celestial sprite has no animation');
  }
  return animation.key;
}

/** 위상(총 시간 대비 비율)에 해당하는 시각이 속한 frame 을 누적 frame 시간으로 찾는다. */
function getPhaseFrameIndex(
  presentation: CelestialAtlasPresentation,
  phaseFraction: number,
): number {
  const totalMs = presentation.frames.reduce((total, { durationMs }) => total + durationMs, 0);
  const phaseMs = phaseFraction * totalMs;
  let elapsedMs = 0;
  const index = presentation.frames.findIndex(({ durationMs }) => {
    elapsedMs += durationMs;
    return phaseMs < elapsedMs;
  });
  return Math.max(index, 0);
}
