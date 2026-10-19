import type Phaser from 'phaser';
import type { CelestialAtlasId, CelestialCatalog } from '../celestial/celestialCatalog.js';
import { addCelestialSprite } from '../celestial/celestialSprites.js';
import { GAMEPLAY_DEPTH } from '../ui/theme.js';

export interface TextShadow {
  offsetXPx: number;
  offsetYPx: number;
  color: string;
  blurPx: number;
}

export function setTextShadow(
  text: Phaser.GameObjects.Text,
  shadow: TextShadow,
): Phaser.GameObjects.Text {
  const { offsetXPx, offsetYPx, color, blurPx } = shadow;
  return text.setShadow(offsetXPx, offsetYPx, color, blurPx, false, true);
}

export function addHudText(
  scene: Phaser.Scene,
  xPx: number,
  yPx: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  return scene.add.text(xPx, yPx, text, style).setOrigin(0.5).setDepth(GAMEPLAY_DEPTH.text);
}

export function addHudEffect(
  scene: Phaser.Scene,
  celestial: CelestialCatalog,
  id: CelestialAtlasId,
  xPx: number,
  yPx: number,
  phaseFraction?: number,
): Phaser.GameObjects.Sprite {
  return addCelestialSprite(
    scene,
    celestial.atlasPresentations[id],
    xPx,
    yPx,
    phaseFraction,
  ).setDepth(GAMEPLAY_DEPTH.text);
}
