import type Phaser from 'phaser';
import type {
  CelestialAtlasPresentation,
  CelestialCatalog,
  CelestialFrame,
  CelestialStaticPresentation,
} from './celestialCatalog.js';
import { createCanvasTexture } from '../ui/canvasTexture.js';
import { queueImageLoads } from '../ui/imageLoad.js';

export function queueCelestialTextures(scene: Phaser.Scene, catalog: CelestialCatalog): void {
  queueImageLoads(scene, catalog.textures, 'celestial texture');
}

/** 텍스처·animation 관리자는 게임 전역이므로 이미 등록된 frame·animation 은 다시 만들지 않는다. */
export function registerCelestialAnimations(scene: Phaser.Scene, catalog: CelestialCatalog): void {
  catalog.atlasFrames.forEach(({ textureKey, standInWidthPx, standInHeightPx, frames }) => {
    // 선택 리소스라 로드 실패는 loader 가 이미 경고했다. 같은 key 의 투명 텍스처에 같은 이름·크기의
    // frame 을 두면 sprite 와 animation 은 그대로 만들어지고 보이지만 않는다. 이후 씬은 이 텍스처가
    // 있으므로 다시 로드·경고하지 않는다.
    const isStandIn = !scene.textures.exists(textureKey);
    if (isStandIn) {
      createCanvasTexture(scene, textureKey, standInWidthPx, standInHeightPx, () => undefined);
    }
    const texture = scene.textures.get(textureKey);
    frames.forEach(({ frameName, xPx, yPx, widthPx, heightPx }) => {
      if (!texture.has(frameName)) {
        texture.add(frameName, 0, isStandIn ? 0 : xPx, isStandIn ? 0 : yPx, widthPx, heightPx);
      }
    });
  });
  // 이미지 role 은 frame 이 없으므로 1px 투명 텍스처면 같은 자리에 아무것도 보이지 않는다.
  Object.values(catalog.imagePresentations).forEach(({ textureKey }) => {
    createCanvasTexture(scene, textureKey, 1, 1, () => undefined);
  });
  const presentations = [
    ...Object.values(catalog.atlasPresentations),
    ...catalog.nodeOnlyFinish.map((step) => step.presentation),
  ];
  presentations.forEach(({ textureKey, playback }) => {
    if (playback.kind === 'static' || scene.anims.exists(playback.animationKey)) {
      return;
    }
    // animation 수준 frameRate·duration 을 주지 않아야 frame 별 duration 이 그대로 다음 frame 시점이 된다.
    scene.anims.create({
      key: playback.animationKey,
      frames: playback.frames.map(({ frameName, durationMs }) => ({
        key: textureKey,
        frame: frameName,
        duration: durationMs,
      })),
      repeat: playback.kind === 'loop' ? -1 : 0,
    });
  });
}

export function addCelestialSprite(
  scene: Phaser.Scene,
  presentation: CelestialAtlasPresentation,
  xPx: number,
  yPx: number,
  phaseFraction = 0,
): Phaser.GameObjects.Sprite {
  const sprite = scene.add.sprite(xPx, yPx, presentation.textureKey);
  applyPresentation(sprite, presentation);
  const { playback } = presentation;
  switch (playback.kind) {
    case 'static':
      return sprite;
    case 'loop':
      return sprite.play({
        key: playback.animationKey,
        startFrame: getPhaseFrameIndex(playback.frames, phaseFraction),
      });
    case 'once':
      // 재생 전 animation 을 붙여 두려고 시작 직후 멈춘다.
      return sprite.play(playback.animationKey).stop().setVisible(false);
  }
}

export function playCelestialOnce(sprite: Phaser.GameObjects.Sprite): void {
  sprite.setVisible(true).play({
    key: requireAnimationKey(sprite),
    hideOnComplete: true,
  });
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

export function applyCelestialPresentation(
  sprite: Phaser.GameObjects.Sprite,
  presentation: CelestialStaticPresentation,
): void {
  applyPresentation(sprite, presentation);
}

function applyPresentation(
  sprite: Phaser.GameObjects.Sprite,
  presentation: CelestialAtlasPresentation,
): void {
  sprite
    .setTexture(presentation.textureKey, presentation.firstFrameName)
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

function getPhaseFrameIndex(frames: readonly CelestialFrame[], phaseFraction: number): number {
  const totalMs = frames.reduce((total, { durationMs }) => total + durationMs, 0);
  const phaseMs = phaseFraction * totalMs;
  let elapsedMs = 0;
  const index = frames.findIndex(({ durationMs }) => {
    elapsedMs += durationMs;
    return phaseMs < elapsedMs;
  });
  return Math.max(index, 0);
}
