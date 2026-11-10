import Phaser from 'phaser';
import { createCanvasTexture } from './canvasTexture.js';

const GRAIN_TILE_PX = 128;
const RANDOM_SEED = 'dazbee-constellation';
const ICON_GRAIN_MIN_ALPHA = 0.5;

export const ICON_GRAIN = {
  cellPx: 1,
  minAlpha: ICON_GRAIN_MIN_ALPHA,
} as const;

export function applyGrain(
  context: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  look: { readonly cellPx: number; readonly minAlpha: number },
): void {
  const random = new Phaser.Math.RandomDataGenerator([RANDOM_SEED]);
  const tile = document.createElement('canvas');
  tile.width = GRAIN_TILE_PX;
  tile.height = GRAIN_TILE_PX;
  const tileContext = tile.getContext('2d');
  if (tileContext === null) {
    throw new Error('Failed to create grain tile context');
  }
  const noise = tileContext.createImageData(GRAIN_TILE_PX, GRAIN_TILE_PX);
  for (let index = 0; index < GRAIN_TILE_PX * GRAIN_TILE_PX; index++) {
    noise.data.set(
      [255, 255, 255, Math.round(random.realInRange(look.minAlpha, 1) * 255)],
      index * 4,
    );
  }
  tileContext.putImageData(noise, 0, 0);
  const pattern = context.createPattern(tile, 'repeat');
  if (pattern === null) {
    throw new Error('Failed to create grain pattern');
  }
  context.save();
  // 아이콘은 격자 좌표로 그린 뒤 부르므로, 입자 크기가 그 배율을 따라가지 않게 되돌린다.
  context.resetTransform();
  context.globalCompositeOperation = 'destination-in';
  context.scale(look.cellPx, look.cellPx);
  context.imageSmoothingEnabled = false;
  context.fillStyle = pattern;
  context.fillRect(0, 0, widthPx / look.cellPx, heightPx / look.cellPx);
  context.restore();
}

// 표시할 때 줄어드는 그림은 입자도 함께 줄어 사라지므로 표시 크기 기준으로 입자를 잡는다.
export function getGrainedImageTexture(
  scene: Phaser.Scene,
  imageKey: string,
  displaySizePx: number,
): string {
  if (!scene.textures.exists(imageKey)) {
    return imageKey;
  }
  const source = scene.textures.get(imageKey).getSourceImage();
  if (!(source instanceof HTMLImageElement)) {
    throw new Error(`Grained icon is not an image: ${imageKey}`);
  }
  const key = `${imageKey}:grained`;
  createCanvasTexture(scene, key, source.width, source.height, (context) => {
    context.drawImage(source, 0, 0);
    applyGrain(context, source.width, source.height, {
      cellPx: source.width / displaySizePx,
      minAlpha: ICON_GRAIN_MIN_ALPHA,
    });
  });
  return key;
}

const LINE_STEP_PX = 4;
const LINE_MIN_ALPHA_RATIO = 0.45;

// 그때그때 다시 그리는 선은 텍스처로 구울 수 없어 짧은 토막마다 밝기를 달리해 같은 결을 낸다.
export function strokeGrainedLine(
  graphics: Phaser.GameObjects.Graphics,
  line: {
    readonly fromXPx: number;
    readonly fromYPx: number;
    readonly toXPx: number;
    readonly toYPx: number;
  },
  look: {
    readonly widthPx: number;
    readonly color: number;
    readonly alpha: number;
    readonly stepPx?: number;
  },
): void {
  const { fromXPx, fromYPx, toXPx, toYPx } = line;
  const steps = Math.max(
    1,
    Math.round(Math.hypot(toXPx - fromXPx, toYPx - fromYPx) / (look.stepPx ?? LINE_STEP_PX)),
  );
  for (let step = 0; step < steps; step += 1) {
    const startXPx = fromXPx + ((toXPx - fromXPx) * step) / steps;
    const startYPx = fromYPx + ((toYPx - fromYPx) * step) / steps;
    const noise = Math.abs(Math.sin(startXPx * 12.9898 + startYPx * 78.233) * 43758.5453) % 1;
    graphics
      .lineStyle(
        look.widthPx,
        look.color,
        look.alpha * (LINE_MIN_ALPHA_RATIO + (1 - LINE_MIN_ALPHA_RATIO) * noise),
      )
      .lineBetween(
        startXPx,
        startYPx,
        fromXPx + ((toXPx - fromXPx) * (step + 1)) / steps,
        fromYPx + ((toYPx - fromYPx) * (step + 1)) / steps,
      );
  }
}
