import type Phaser from 'phaser';
import type {
  CelestialAtlasPresentation,
  CelestialCatalog,
  CelestialFrame,
  CelestialImagePresentation,
  CelestialStaticPresentation,
} from '../state/celestialCatalog.js';
import { createCanvasTexture } from '../../ui/view/textures/canvasTexture.js';
import { queueImageLoads } from '../../ui/view/textures/imageLoad.js';

export type CelestialTextureUse = Pick<
  CelestialAtlasPresentation | CelestialImagePresentation,
  'textureKey'
>;

export function queueCelestialTextures(
  scene: Phaser.Scene,
  catalog: CelestialCatalog,
  uses: readonly CelestialTextureUse[],
): void {
  const usedKeys = new Set(uses.map(({ textureKey }) => textureKey));
  queueImageLoads(
    scene,
    catalog.textures.filter(({ key }) => usedKeys.has(key)),
    'celestial texture',
    (key) => {
      // 선택 리소스라 실패한 키에만 같은 key 의 투명 텍스처를 둔다. 아틀라스는 같은 이름·크기의 frame 을
      // 두면 sprite 와 animation 은 그대로 만들어지고 보이지만 않는다. 이미지 role 은 frame 이 없으므로
      // 1px 이면 된다. 이후 씬은 이 텍스처가 있으므로 다시 로드·경고하지 않는다.
      const atlas = catalog.atlasFrames.find(({ textureKey }) => textureKey === key);
      if (atlas === undefined) {
        createCanvasTexture(scene, key, 1, 1, () => undefined);
        return;
      }
      createCanvasTexture(scene, key, atlas.standInWidthPx, atlas.standInHeightPx, () => undefined);
      const texture = scene.textures.get(key);
      atlas.frames.forEach(({ frameName, widthPx, heightPx }) => {
        texture.add(frameName, 0, 0, 0, widthPx, heightPx);
      });
    },
  );
}

/** 텍스처·animation 관리자는 게임 전역이므로 이미 등록된 frame·animation 은 다시 만들지 않는다. */
export function registerCelestialAnimations(scene: Phaser.Scene, catalog: CelestialCatalog): void {
  // 아직 요청하지 않은 텍스처는 건너뛰고, 그 텍스처를 요청한 씬의 create 에서 등록된다.
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
    ...Object.values(catalog.atlasPresentations),
    ...catalog.nodeOnlyFinish.map((step) => step.presentation),
  ];
  presentations.forEach(({ textureKey, playback }) => {
    if (
      playback.kind === 'static' ||
      scene.anims.exists(playback.animationKey) ||
      !scene.textures.exists(textureKey)
    ) {
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
  requireCelestialTexture(scene, presentation.textureKey);
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
  requireCelestialTexture(sprite.scene, presentation.textureKey);
  applyPresentation(sprite, presentation);
}

/** 씬 preload 가 요청 목록에 빠뜨린 텍스처를 쓰는 개발 오류를 드러낸다. */
export function requireCelestialTexture(scene: Phaser.Scene, textureKey: string): void {
  if (!scene.textures.exists(textureKey)) {
    throw new Error(`Celestial texture was not requested: ${textureKey}`);
  }
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
