import Phaser from 'phaser';
import { renderGraphicsCanvas } from './graphics.js';
import { renderMesh2DCanvas } from './mesh2d.js';
import { renderNineSliceCanvas } from './nineSlice.js';
import { forgetTintOnTextUpdate, tintFrameRender, tintGlyphRender } from './tint.js';
import type { CanvasRender } from './tint.js';

function hasCanvasRender<T extends Phaser.GameObjects.GameObject>(
  prototype: T,
): prototype is T & { renderCanvas: CanvasRender<T> } {
  return 'renderCanvas' in prototype;
}

function replaceRenderCanvas<T extends Phaser.GameObjects.GameObject>(
  prototype: T,
  replace: (original: CanvasRender<T>) => CanvasRender<T>,
): void {
  if (!hasCanvasRender(prototype)) {
    throw new Error('Phaser game object has no renderCanvas');
  }
  prototype.renderCanvas = replace(prototype.renderCanvas);
}

export function installCanvasRendering(): void {
  const { Image, Sprite, Text, BitmapText, NineSlice, Mesh2D, Graphics } = Phaser.GameObjects;
  replaceRenderCanvas(Image.prototype, tintFrameRender);
  replaceRenderCanvas(Sprite.prototype, tintFrameRender);
  replaceRenderCanvas(Text.prototype, tintFrameRender);
  replaceRenderCanvas(BitmapText.prototype, tintGlyphRender);
  replaceRenderCanvas(NineSlice.prototype, () => renderNineSliceCanvas);
  replaceRenderCanvas(Mesh2D.prototype, () => renderMesh2DCanvas);
  replaceRenderCanvas(Graphics.prototype, () => renderGraphicsCanvas);
  const textPrototype: { updateText: (this: Phaser.GameObjects.Text) => Phaser.GameObjects.Text } =
    Text.prototype;
  textPrototype.updateText = forgetTintOnTextUpdate(textPrototype.updateText);
}
