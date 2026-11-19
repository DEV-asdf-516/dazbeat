import type Phaser from 'phaser';

export interface TextureSpec {
  readonly key: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

export function createCanvasTexture(
  scene: Phaser.Scene,
  spec: TextureSpec,
  paint: (context: CanvasRenderingContext2D) => void,
): void {
  const { key, widthPx, heightPx } = spec;
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
