import Phaser from 'phaser';
import { getLanes } from '../../../rhythm/lanes.js';
import type { LaneCount } from '../../../rhythm/types.js';
import { bakeTexture } from '../../ui/view/textures/bakedTexture.js';
import { createCanvasTexture } from '../../ui/view/textures/canvasTexture.js';
import { strokeGrainedLine } from '../../ui/view/textures/grain.js';
import { HAIRLINE_PX } from '../../ui/view/textures/hairline.js';
import { CELESTIAL_COLORS, COLORS, cssColor } from '../../ui/view/theme.js';

const NOTE_TEXTURE_WIDTH_PX = 108;
const NOTE_TEXTURE_HEIGHT_PX = 24;
const NOTE_EDGE_PX = 6;
const NOTE_EDGE_BLUR_PX = 8;
const LANE_LINE_ALPHA = 0.22;
const LANE_EDGE_ALPHA = 0.55;
// 스크롤 때마다 다시 그리는 선이 많아 토막을 넓게 잡는다.
const GRID_GRAIN_STEP_PX = 12;
const GRID_MINOR_ALPHA = 0.07;
const GRID_MAJOR_ALPHA = 0.22;

export function ensureNoteTexture(scene: Phaser.Scene, accentColor: number): string {
  const key = `light:note:${cssColor(accentColor)}`;
  createCanvasTexture(
    scene,
    {
      key,
      widthPx: NOTE_TEXTURE_WIDTH_PX,
      heightPx: NOTE_TEXTURE_HEIGHT_PX,
    },
    (context) => {
      // core 를 가장자리에서 안쪽으로 들인 뒤 accent shadow 로 번지게 해 soft edge 가 텍스처 안에 머물게 한다.
      context.shadowColor = cssColor(accentColor);
      context.shadowBlur = NOTE_EDGE_BLUR_PX;
      context.fillStyle = cssColor(COLORS.note);
      context.fillRect(
        NOTE_EDGE_PX,
        NOTE_EDGE_PX,
        NOTE_TEXTURE_WIDTH_PX - NOTE_EDGE_PX * 2,
        NOTE_TEXTURE_HEIGHT_PX - NOTE_EDGE_PX * 2,
      );
    },
  );
  return key;
}

export function ensureLaneLinesTexture(
  scene: Phaser.Scene,
  laneCount: LaneCount,
  look: {
    readonly widthPx: number;
    readonly heightPx: number;
    readonly firstLineXPx: number;
    readonly laneWidthPx: number;
    readonly lineWidthPx: number;
  },
): string {
  const { widthPx, heightPx, firstLineXPx, laneWidthPx, lineWidthPx } = look;
  const key = `editor:laneLines:${laneCount}`;
  bakeTexture(
    scene,
    {
      key,
      widthPx,
      heightPx,
    },
    (texture) => {
      const brush = scene.make.graphics(undefined, false);
      for (const boundary of [...getLanes(laneCount), laneCount]) {
        const isEdge = boundary === 0 || boundary === laneCount;
        brush
          .fillStyle(CELESTIAL_COLORS.border, isEdge ? LANE_EDGE_ALPHA : LANE_LINE_ALPHA)
          .fillRect(
            firstLineXPx + laneWidthPx * boundary - lineWidthPx / 2,
            0,
            lineWidthPx,
            heightPx,
          );
      }
      texture.draw(brush, 0, 0);
      return [brush];
    },
  );
  return key;
}

export function ensureGridTileTexture(
  scene: Phaser.Scene,
  look: {
    readonly widthPx: number;
    readonly heightPx: number;
    readonly stepPx: number;
    readonly lineOffsetPx: number;
  },
): string {
  const { widthPx, heightPx, stepPx, lineOffsetPx } = look;
  const key = `editor:gridTile:${widthPx}x${heightPx}`;
  bakeTexture(
    scene,
    {
      key,
      widthPx,
      heightPx,
    },
    (texture) => {
      const brush = scene.make.graphics(undefined, false);
      for (let yPx = 0; yPx < heightPx; yPx += stepPx) {
        strokeGrainedLine(
          brush,
          {
            fromXPx: 0,
            fromYPx: yPx + lineOffsetPx,
            toXPx: widthPx,
            toYPx: yPx + lineOffsetPx,
          },
          {
            widthPx: HAIRLINE_PX,
            color: CELESTIAL_COLORS.selected,
            alpha: yPx === 0 ? GRID_MAJOR_ALPHA : GRID_MINOR_ALPHA,
            stepPx: GRID_GRAIN_STEP_PX,
          },
        );
      }
      texture.draw(brush, 0, 0);
      return [brush];
    },
  );
  return key;
}

export function addBakedCircle(
  scene: Phaser.Scene,
  xPx: number,
  yPx: number,
  look: {
    readonly radiusPx: number;
    readonly color: number;
    readonly ring: { readonly widthPx: number; readonly color: number } | null;
  },
): Phaser.GameObjects.Image {
  const { radiusPx, color, ring } = look;
  // Shape 테두리는 원 둘레 가운데에 그려지므로 그 바깥 절반까지 담는다.
  const sizePx = Math.ceil(radiusPx + (ring?.widthPx ?? 0) / 2) * 2;
  const ringKey = ring === null ? 'none' : `${ring.widthPx}:${ring.color}`;
  const key = `editor:circle:${radiusPx}:${color}:${ringKey}`;
  bakeTexture(
    scene,
    {
      key,
      widthPx: sizePx,
      heightPx: sizePx,
    },
    (texture) => {
      const circle = new Phaser.GameObjects.Arc(
        scene,
        sizePx / 2,
        sizePx / 2,
        radiusPx,
        0,
        360,
        false,
        color,
      );
      if (ring !== null) {
        circle.setStrokeStyle(ring.widthPx, ring.color);
      }
      texture.draw(circle);
      return [circle];
    },
  );
  return scene.add.image(xPx, yPx, key);
}
