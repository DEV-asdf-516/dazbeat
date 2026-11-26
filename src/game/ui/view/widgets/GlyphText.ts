import type Phaser from 'phaser';
import { requireDefined } from '../../../../invariant.js';
import { createCanvasTexture } from '../textures/canvasTexture.js';
import { rgba } from '../textures/lightTextures.js';

// HUD 그림자(blur 4px)가 글자 칸 밖으로 번진 부분이 잘리지 않을 만큼 칸 좌우를 띄운다.
const SHADOW_SIDE_PADDING_PX = 8;
const CELL_GAP_PX = 2;
const CLEAR_COLOR = rgba(0x000000, 0);

export interface GlyphTextOptions {
  readonly fontKey: string;
  readonly style: Phaser.Types.GameObjects.Text.TextStyle;
  readonly chars: string;
  readonly xPx: number;
  readonly yPx: number;
  readonly originX: number;
  readonly originY: number;
  readonly text: string;
  readonly depth: number;
}

// 값이 바뀔 때마다 Text 를 다시 굽지 않도록 글자 단위로 미리 구운 bitmap font 를 이어 붙인다.
export class GlyphText {
  readonly layers: readonly Phaser.GameObjects.BitmapText[];

  constructor(
    scene: Phaser.Scene,
    private readonly options: GlyphTextOptions,
  ) {
    const { fontKey, style, chars, xPx, yPx, originX, originY, depth } = options;
    const padding = {
      left: SHADOW_SIDE_PADDING_PX,
      right: SHADOW_SIDE_PADDING_PX,
    };
    // 외곽선과 그림자를 채움과 따로 구워 모든 외곽선·그림자가 모든 채움 아래에 오게 겹친다.
    const layerFonts: readonly (readonly [string, Phaser.Types.GameObjects.Text.TextStyle])[] =
      (style.strokeThickness ?? 0) > 0
        ? [
            [
              `${fontKey}:outline`,
              {
                ...style,
                color: CLEAR_COLOR,
                padding,
              },
            ],
            [
              `${fontKey}:fill`,
              {
                ...style,
                stroke: CLEAR_COLOR,
                shadow: {
                  ...style.shadow,
                  stroke: false,
                  fill: false,
                },
                padding,
              },
            ],
          ]
        : [[fontKey, style]];
    this.layers = layerFonts.map(([layerKey, layerStyle]) => {
      if (scene.cache.bitmapFont.exists(layerKey)) {
        return scene.add.bitmapText(xPx, yPx, layerKey).setOrigin(originX, originY).setDepth(depth);
      }
      const cells = [...chars].map((char) => ({
        char,
        text: scene.make.text(
          {
            x: 0,
            y: 0,
            text: char,
            style: layerStyle,
          },
          false,
        ),
      }));
      const first = requireDefined(cells[0], 'Missing glyph characters', layerKey).text;
      const resolution = first.style.resolution || 1;
      const measure = (value: string): number => first.context.measureText(value).width;
      const padLeftPx = first.padding.left ?? 0;
      const atlasWidthPx = cells.reduce(
        (sum, { text }) => sum + text.canvas.width + CELL_GAP_PX,
        0,
      );
      const atlasHeightPx = Math.max(...cells.map(({ text }) => text.canvas.height));
      createCanvasTexture(
        scene,
        {
          key: layerKey,
          widthPx: atlasWidthPx,
          heightPx: atlasHeightPx,
        },
        (context) => {
          let cellXPx = 0;
          for (const { text } of cells) {
            context.drawImage(text.canvas, cellXPx, 0);
            cellXPx += text.canvas.width + CELL_GAP_PX;
          }
        },
      );
      const data: Phaser.Types.GameObjects.BitmapText.BitmapFontData = {
        font: layerKey,
        size: Number.parseFloat(`${first.style.fontSize}`),
        lineHeight: first.height,
        retroFont: false,
        chars: {},
      };
      let cellXPx = 0;
      for (const { char, text } of cells) {
        const { width: canvasWidthPx, height: canvasHeightPx } = text.canvas;
        const widthPx = canvasWidthPx / resolution;
        const heightPx = canvasHeightPx / resolution;
        // Phaser 타입 정의에는 xAdvance 가 빠져 있지만 BitmapText 배치는 이 값으로 다음 글자를 놓는다.
        const glyph: Phaser.Types.GameObjects.BitmapText.BitmapFontCharacterData & {
          readonly xAdvance: number;
        } = {
          x: cellXPx,
          y: 0,
          width: widthPx,
          height: heightPx,
          centerX: Math.floor(widthPx / 2),
          centerY: Math.floor(heightPx / 2),
          xOffset: -padLeftPx,
          yOffset: 0,
          xAdvance: measure(char),
          kerning: Object.fromEntries(
            cells.map(({ char: previous }) => [
              previous.charCodeAt(0),
              measure(previous + char) - measure(previous) - measure(char),
            ]),
          ),
          data: {},
          u0: cellXPx / atlasWidthPx,
          v0: 1,
          u1: (cellXPx + canvasWidthPx) / atlasWidthPx,
          v1: 1 - canvasHeightPx / atlasHeightPx,
        };
        data.chars[char.charCodeAt(0)] = glyph;
        cellXPx += canvasWidthPx + CELL_GAP_PX;
      }
      cells.forEach(({ text }) => text.destroy());
      scene.cache.bitmapFont.add(layerKey, {
        data,
        texture: layerKey,
        frame: null,
      });
      return scene.add.bitmapText(xPx, yPx, layerKey).setOrigin(originX, originY).setDepth(depth);
    });
    this.render(options.text);
  }

  render(value: string): void {
    const { xPx, originX, style } = this.options;
    // Phaser Text 는 폭을 ceil(strokeThickness + 글자 폭)으로 잡고 글자를 strokeThickness / 2 에서 그리므로 같은 자리에 오게 맞춘다.
    const strokeThicknessPx = style.strokeThickness ?? 0;
    for (const layer of this.layers) {
      layer.setText(value);
      const widthPx = layer.getTextBounds().local.width;
      layer.setX(xPx - originX * (Math.ceil(strokeThicknessPx + widthPx) - widthPx));
    }
  }
}
