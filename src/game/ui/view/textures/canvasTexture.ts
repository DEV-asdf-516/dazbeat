import type Phaser from 'phaser';

export function createCanvasTexture(
  scene: Phaser.Scene,
  key: string,
  widthPx: number,
  heightPx: number,
  paint: (context: CanvasRenderingContext2D) => void,
): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const texture = scene.textures.createCanvas(key, widthPx, heightPx);
  if (texture === null) {
    throw new Error(`Failed to create texture: ${key}`);
  }
  paint(texture.getContext());
  texture.refresh();
}
