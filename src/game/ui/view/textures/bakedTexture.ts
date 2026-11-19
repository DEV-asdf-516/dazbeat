import Phaser from 'phaser';
import type { TextureSpec } from './canvasTexture.js';

// 9분할 가운데는 늘려도 같은 채움·테두리 직선만 담으면 되므로 모서리 영역 사이를 이만큼만 둔다.
const SLICE_STRETCH_PX = 2;

export interface BakedRoundedRectLook {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly radiusPx: number;
  readonly fillColor: number;
  readonly fillAlpha: number;
  readonly border: {
    readonly color: number;
    readonly widthPx: number;
  } | null;
}

// Canvas 2D 로는 Graphics 의 꼭짓점별 alpha 와 Shape 래스터화를 같은 모양으로 낼 수 없어 WebGL 로 굽는다.
// draw 는 참조만 쌓고 render() 때 그리므로 임시 객체는 render() 뒤에 없앤다.
export function bakeTexture(
  scene: Phaser.Scene,
  spec: TextureSpec,
  paint: (texture: Phaser.Textures.DynamicTexture) => Phaser.GameObjects.GameObject[],
): void {
  const { key, widthPx, heightPx } = spec;
  if (scene.textures.exists(key)) {
    return;
  }
  const texture = scene.textures.addDynamicTexture(key, widthPx, heightPx);
  if (texture === null) {
    throw new Error(`Failed to create texture: ${key}`);
  }
  const brushes = paint(texture);
  texture.render();
  brushes.forEach((brush) => brush.destroy());
}

export function addBakedRoundedRect(
  scene: Phaser.Scene,
  xPx: number,
  yPx: number,
  look: BakedRoundedRectLook,
): Phaser.GameObjects.NineSlice {
  const { widthPx, heightPx, radiusPx, fillColor, fillAlpha, border } = look;
  const borderWidthPx = border?.widthPx ?? 0;
  // 가운데 칸 바로 바깥이 테두리면 늘릴 때 보간이 테두리 색을 안쪽으로 끌어오므로 모서리 칸에 채움 1px 를 더 넣는다.
  const cornerPx = Math.ceil(radiusPx + borderWidthPx) + 1;
  const sourcePx = cornerPx * 2 + SLICE_STRETCH_PX;
  const borderKey = border === null ? 'none' : `${border.color}:${border.widthPx}`;
  const key = `rounded-rect:${radiusPx}:${fillColor}:${fillAlpha}:${borderKey}`;
  bakeTexture(
    scene,
    {
      key,
      widthPx: sourcePx,
      heightPx: sourcePx,
    },
    (texture) => {
      // Shape 테두리는 경계선 가운데에 그려지지만 9분할 원본 밖으로 나가지 않도록 테두리 폭 절반만큼 안쪽에 그린다.
      const insetPx = borderWidthPx / 2;
      const rect = new Phaser.GameObjects.Rectangle(
        scene,
        insetPx,
        insetPx,
        sourcePx - borderWidthPx,
        sourcePx - borderWidthPx,
        fillColor,
        fillAlpha,
      )
        .setOrigin(0, 0)
        .setRounded(radiusPx);
      if (border !== null) {
        rect.setStrokeStyle(border.widthPx, border.color);
      }
      texture.draw(rect);
      return [rect];
    },
  );
  return scene.add.nineslice(
    xPx,
    yPx,
    key,
    undefined,
    widthPx,
    heightPx,
    cornerPx,
    cornerPx,
    cornerPx,
    cornerPx,
  );
}
