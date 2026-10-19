import type Phaser from 'phaser';
import type { CelestialCatalog } from './celestialCatalog.js';
import { CELESTIAL_SCREENS } from './celestialPlacements.js';
import type { CelestialScreen } from './celestialPlacements.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../config.js';
import {
  addCelestialSprite,
  playCelestialOnce,
  registerCelestialAnimations,
} from './celestialSprites.js';

const GRAIN_ID = 'R50';
const DUST_ID = 'R05';
const DUST_DISSOLVE_ID = 'R46';
const STAR_THREAD_ID = 'R44';
const SHIMMER_WIPE_ID = 'R45';
// R44 의 512px cell 중 실제로 보이는 띠의 높이. manifest R44 sourceCanvasPx [512, 128] 의 높이다.
const STAR_THREAD_SOURCE_HEIGHT_PX = 128;

export function addCelestialAtmosphere(
  scene: Phaser.Scene,
  catalog: CelestialCatalog,
  screen: CelestialScreen,
): void {
  registerCelestialAnimations(scene, catalog);
  const layers = CELESTIAL_SCREENS[screen];
  if (layers.backgroundId !== null) {
    const background = catalog.imagePresentations[layers.backgroundId];
    scene.add.image(0, 0, background.textureKey).setOrigin(0, 0).setAlpha(background.opacity);
  }
  if (layers.hasGrain) {
    const grain = catalog.imagePresentations[GRAIN_ID];
    addScreenTile(scene, grain.textureKey, grain.opacity);
  }
  addScreenTile(scene, catalog.imagePresentations[DUST_ID].textureKey, layers.dustOpacity);
  layers.ambient.forEach(({ id, xPx, yPx, scale, phaseFraction }) => {
    addCelestialSprite(scene, catalog.atlasPresentations[id], xPx, yPx, phaseFraction).setScale(
      scale,
    );
  });
}

export function playCelestialEntryTransition(
  scene: Phaser.Scene,
  catalog: CelestialCatalog,
  focal: Phaser.Geom.Rectangle,
): void {
  const dissolve = addCelestialSprite(
    scene,
    catalog.atlasPresentations[DUST_DISSOLVE_ID],
    focal.centerX,
    focal.centerY,
  );
  const thread = addCelestialSprite(
    scene,
    catalog.atlasPresentations[STAR_THREAD_ID],
    focal.centerX,
    focal.bottom,
  );
  // cell 전체가 아니라 보이는 띠의 위 가장자리가 focal 아래 가장자리에 오도록 띠 표시 높이의 절반만큼 내린다.
  thread.setY(focal.bottom + (STAR_THREAD_SOURCE_HEIGHT_PX * thread.scaleY) / 2);
  const wipe = addCelestialSprite(
    scene,
    catalog.atlasPresentations[SHIMMER_WIPE_ID],
    focal.centerX,
    focal.top,
  );
  [dissolve, thread, wipe].forEach((sprite) => playCelestialOnce(sprite));
}

function addScreenTile(scene: Phaser.Scene, textureKey: string, opacity: number): void {
  scene.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, textureKey).setOrigin(0, 0).setAlpha(opacity);
}
