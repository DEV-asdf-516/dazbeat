import Phaser from 'phaser';
import { requireDefined } from '../../../invariant.js';
import { getLanes } from '../../../rhythm/lanes.js';
import type { LaneCount } from '../../../rhythm/types.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../../app/config.js';
import { bakeTexture } from '../../ui/view/textures/bakedTexture.js';
import { createCanvasTexture } from '../../ui/view/textures/canvasTexture.js';
import {
  fillGradient,
  maskHorizontally,
  rgba,
  white,
} from '../../ui/view/textures/lightTextures.js';
import { CELESTIAL_COLORS, COLORS, cssColor } from '../../ui/view/theme.js';
import { getPlayfieldTrapezoid, getPlayfieldXAtY } from '../state/playfieldLayout.js';
import type { PlayfieldLayout, Trapezoid } from '../state/playfieldLayout.js';
import { fillTrapezoid } from './trapezoidFill.js';

// 밝은 영상 위에서도 상단 HUD 가 읽히도록 화면 전체에 위가 짙고 아래로 사라지는 밤빛을 덮는다.
const SKY_SCRIM_PROFILE: VerticalProfile = [
  [0, 0.6],
  [0.25, 0.25],
  [1, 0],
];
const LANE_PANEL_ALPHA = 0.95;
// 세로 프로필은 [화면 높이 비율, alpha] 정지점이고 정지점 사이는 선형이다.
const LANE_PANEL_PROFILE: VerticalProfile = [
  [0, 0.5],
  [0.3, 0.85],
  [0.7, 1],
  [1, 1],
];
const LANE_LINE_PROFILE: VerticalProfile = [
  [0, 0.45],
  [0.2, 0.8],
  [0.85, 1],
  [1, 0.6],
];
const LANE_EDGE_SHADE_COLOR = 0x05080f;
const LANE_EDGE_SHADE_WIDTH_PX = 10;
const LANE_EDGE_SHADE_ALPHA = 0.85;
const LANE_EDGE_SHADOW_COLOR = 0x04060c;
const LANE_EDGE_SHADOW_WIDTH_PX = 10;
const LANE_EDGE_SHADOW_ALPHA = 0.9;
const LANE_BORDER_COLOR = 0xa9bedc;
const LANE_BORDER_WIDTH_PX = 2;
const LANE_BORDER_ALPHA = 0.75;
const LANE_DIVIDER_WIDTH_PX = 2;
const LANE_DIVIDER_ALPHA = 0.62;
const LANE_DIVIDER_SHADE_WIDTH_PX = 8;
const LANE_DIVIDER_SHADE_ALPHA = 0.8;
const LANE_STRIPE_ALPHA = 0.28;
const SKY_SCRIM_TEXTURE_KEY = 'gameplay:skyScrim';
const LANE_CHROME_TEXTURE_KEY = 'gameplay:laneChrome';
const LANE_DIVIDERS_TEXTURE_KEY = 'gameplay:laneDividers';
// 채움 꼬리가 너무 꺼지면 짧은 채움(위험 단계)이 읽히지 않으므로 절반 남짓만 물린다.
const STARLIGHT_FILL_TAIL_ALPHA = 0.55;
// 가는 초승달이 16px 에서도 뭉개지지 않는 두께다.
const CRESCENT_CUT_OFFSET = {
  x: 0.45,
  y: -0.2,
} as const;
const CRESCENT_CUT_RADIUS = 0.85;
const LANE_COLUMN_TEXTURE_WIDTH_PX = 64;
const LANE_COLUMN_TEXTURE_HEIGHT_PX = 256;

type VerticalProfile = readonly (readonly [heightRatio: number, alpha: number])[];

// 위로 갈수록 옅어지고 양 끝 띠가 감쇠하는 기둥을 한 번 구워 메시로 늘려 쓴다.
// Mesh2D 는 타입 선언에 setTint 가 없어 색까지 텍스처에 굽는다.
export function ensureLaneColumnTexture(
  scene: Phaser.Scene,
  edgeFadeRatio: number,
  color: number,
): string {
  const key = `light:laneColumn:${edgeFadeRatio}:${color}`;
  createCanvasTexture(
    scene,
    {
      key,
      widthPx: LANE_COLUMN_TEXTURE_WIDTH_PX,
      heightPx: LANE_COLUMN_TEXTURE_HEIGHT_PX,
    },
    (context) => {
      fillGradient(
        context,
        context.createLinearGradient(0, 0, 0, LANE_COLUMN_TEXTURE_HEIGHT_PX),
        [
          [0, rgba(color, 0)],
          [1, rgba(color, 1)],
        ],
        LANE_COLUMN_TEXTURE_WIDTH_PX,
        LANE_COLUMN_TEXTURE_HEIGHT_PX,
      );
      maskHorizontally(context, LANE_COLUMN_TEXTURE_WIDTH_PX, LANE_COLUMN_TEXTURE_HEIGHT_PX, [
        [0, 0],
        [edgeFadeRatio, 1],
        [1 - edgeFadeRatio, 1],
        [1, 0],
      ]);
    },
  );
  return key;
}

// scaleX 로 길이를 바꾸므로 그러데이션은 늘 채움 끝에서 가장 밝다.
export function ensureStarlightFillTexture(
  scene: Phaser.Scene,
  widthPx: number,
  heightPx: number,
): string {
  const key = `light:starlightFill:${widthPx}x${heightPx}`;
  createCanvasTexture(
    scene,
    {
      key,
      widthPx,
      heightPx,
    },
    (context) => {
      const gradient = context.createLinearGradient(0, 0, widthPx, 0);
      gradient.addColorStop(0, white(STARLIGHT_FILL_TAIL_ALPHA));
      gradient.addColorStop(1, white(1));
      context.fillStyle = gradient;
      context.beginPath();
      context.roundRect(0, 0, widthPx, heightPx, heightPx / 2);
      context.fill();
    },
  );
  return key;
}

export function ensureCrescentTexture(scene: Phaser.Scene, sizePx: number): string {
  const key = `light:crescent:${sizePx}`;
  createCanvasTexture(
    scene,
    {
      key,
      widthPx: sizePx,
      heightPx: sizePx,
    },
    (context) => {
      const radiusPx = sizePx / 2;
      context.fillStyle = cssColor(COLORS.note);
      context.beginPath();
      context.arc(radiusPx, radiusPx, radiusPx, 0, Math.PI * 2);
      context.fill();
      context.globalCompositeOperation = 'destination-out';
      context.beginPath();
      context.arc(
        radiusPx + radiusPx * CRESCENT_CUT_OFFSET.x,
        radiusPx + radiusPx * CRESCENT_CUT_OFFSET.y,
        radiusPx * CRESCENT_CUT_RADIUS,
        0,
        Math.PI * 2,
      );
      context.fill();
    },
  );
  return key;
}

export function addSkyScrim(scene: Phaser.Scene, widthPx: number): Phaser.GameObjects.Image {
  return addBakedImage(scene, makeSkyScrimGraphics(scene, widthPx), SKY_SCRIM_TEXTURE_KEY, widthPx);
}

export function fitSkyScrim(skyScrim: Phaser.GameObjects.Image, widthPx: number): void {
  rebakeTexture(
    skyScrim.scene,
    makeSkyScrimGraphics(skyScrim.scene, widthPx),
    SKY_SCRIM_TEXTURE_KEY,
    widthPx,
  );
  skyScrim.setTexture(SKY_SCRIM_TEXTURE_KEY);
}

function makeSkyScrimGraphics(scene: Phaser.Scene, widthPx: number): Phaser.GameObjects.Graphics {
  const skyScrimGraphics = scene.make.graphics(undefined, false);
  fillVerticalProfile(
    skyScrimGraphics,
    SKY_SCRIM_PROFILE,
    (topYPx, bottomYPx) => ({
      topYPx,
      bottomYPx,
      topLeftXPx: 0,
      topRightXPx: widthPx,
      bottomLeftXPx: 0,
      bottomRightXPx: widthPx,
    }),
    CELESTIAL_COLORS.background,
    {
      left: 1,
      right: 1,
    },
  );
  return skyScrimGraphics;
}

export function addLaneChrome(
  scene: Phaser.Scene,
  playfield: PlayfieldLayout,
  laneCount: LaneCount,
): Phaser.GameObjects.Image {
  const laneChromeGraphics = scene.make.graphics(undefined, false);
  fillVerticalProfile(
    laneChromeGraphics,
    LANE_PANEL_PROFILE,
    (topYPx, bottomYPx) =>
      getPlayfieldTrapezoid(
        playfield,
        playfield.leftPx,
        playfield.leftPx + playfield.widthPx,
        topYPx,
        bottomYPx,
      ),
    CELESTIAL_COLORS.background,
    {
      left: LANE_PANEL_ALPHA,
      right: LANE_PANEL_ALPHA,
    },
  );
  // 어두운 테두리와 그 바깥 그림자를 경계선 아래에 깔아 레인 가장자리를 배경에서 떼어 낸다.
  const leftEdgeXPx = playfield.leftPx;
  const rightEdgeXPx = playfield.leftPx + playfield.widthPx;
  const shadeHalfPx = LANE_EDGE_SHADE_WIDTH_PX / 2;
  const shadowOuterPx = shadeHalfPx + LANE_EDGE_SHADOW_WIDTH_PX;
  [leftEdgeXPx, rightEdgeXPx].forEach((xPx) =>
    fillVerticalProfile(
      laneChromeGraphics,
      LANE_LINE_PROFILE,
      getLineBand(playfield, xPx, -shadeHalfPx, shadeHalfPx),
      LANE_EDGE_SHADE_COLOR,
      {
        left: LANE_EDGE_SHADE_ALPHA,
        right: LANE_EDGE_SHADE_ALPHA,
      },
    ),
  );
  fillVerticalProfile(
    laneChromeGraphics,
    LANE_LINE_PROFILE,
    getLineBand(playfield, leftEdgeXPx, -shadowOuterPx, -shadeHalfPx),
    LANE_EDGE_SHADOW_COLOR,
    {
      left: 0,
      right: LANE_EDGE_SHADOW_ALPHA,
    },
  );
  fillVerticalProfile(
    laneChromeGraphics,
    LANE_LINE_PROFILE,
    getLineBand(playfield, rightEdgeXPx, shadeHalfPx, shadowOuterPx),
    LANE_EDGE_SHADOW_COLOR,
    {
      left: LANE_EDGE_SHADOW_ALPHA,
      right: 0,
    },
  );
  [leftEdgeXPx, rightEdgeXPx].forEach((xPx) =>
    fillVerticalProfile(
      laneChromeGraphics,
      LANE_LINE_PROFILE,
      getLineBand(playfield, xPx, -LANE_BORDER_WIDTH_PX / 2, LANE_BORDER_WIDTH_PX / 2),
      LANE_BORDER_COLOR,
      {
        left: LANE_BORDER_ALPHA,
        right: LANE_BORDER_ALPHA,
      },
    ),
  );
  getLanes(laneCount)
    .filter((lane) => lane % 2 === 1)
    .forEach((lane) =>
      fillVerticalProfile(
        laneChromeGraphics,
        LANE_PANEL_PROFILE,
        (topYPx, bottomYPx) =>
          getPlayfieldTrapezoid(
            playfield,
            getLaneBoundaryXPx(playfield, lane),
            getLaneBoundaryXPx(playfield, lane + 1),
            topYPx,
            bottomYPx,
          ),
        CELESTIAL_COLORS.surfaceHover,
        {
          left: LANE_STRIPE_ALPHA,
          right: LANE_STRIPE_ALPHA,
        },
      ),
    );
  getLaneDividerXsPx(playfield, laneCount).forEach((xPx) =>
    fillVerticalProfile(
      laneChromeGraphics,
      LANE_LINE_PROFILE,
      getLineBand(
        playfield,
        xPx,
        -LANE_DIVIDER_SHADE_WIDTH_PX / 2,
        LANE_DIVIDER_SHADE_WIDTH_PX / 2,
      ),
      LANE_EDGE_SHADE_COLOR,
      {
        left: LANE_DIVIDER_SHADE_ALPHA,
        right: LANE_DIVIDER_SHADE_ALPHA,
      },
    ),
  );
  return addBakedImage(scene, laneChromeGraphics, LANE_CHROME_TEXTURE_KEY, GAME_WIDTH);
}

export function addLaneDividers(
  scene: Phaser.Scene,
  playfield: PlayfieldLayout,
  laneCount: LaneCount,
): Phaser.GameObjects.Image {
  const laneDividersGraphics = scene.make.graphics(undefined, false);
  getLaneDividerXsPx(playfield, laneCount).forEach((xPx) =>
    fillVerticalProfile(
      laneDividersGraphics,
      LANE_LINE_PROFILE,
      getLineBand(playfield, xPx, -LANE_DIVIDER_WIDTH_PX / 2, LANE_DIVIDER_WIDTH_PX / 2),
      LANE_BORDER_COLOR,
      {
        left: LANE_DIVIDER_ALPHA,
        right: LANE_DIVIDER_ALPHA,
      },
    ),
  );
  return addBakedImage(scene, laneDividersGraphics, LANE_DIVIDERS_TEXTURE_KEY, GAME_WIDTH);
}

// 정적인 배경 Graphics 는 보이는 동안 매 프레임 명령 전체를 다시 처리하므로 한 번 구운 이미지로 바꿔 둔다.
function addBakedImage(
  scene: Phaser.Scene,
  graphics: Phaser.GameObjects.Graphics,
  key: string,
  widthPx: number,
): Phaser.GameObjects.Image {
  rebakeTexture(scene, graphics, key, widthPx);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.textures.remove(key));
  return scene.add.image(0, 0, key).setOrigin(0, 0);
}

// bakeTexture 는 키가 있으면 굽지 않으므로 새 크기로 구우려면 먼저 지운다.
function rebakeTexture(
  scene: Phaser.Scene,
  graphics: Phaser.GameObjects.Graphics,
  key: string,
  widthPx: number,
): void {
  if (scene.textures.exists(key)) {
    scene.textures.remove(key);
  }
  bakeTexture(
    scene,
    {
      key,
      widthPx,
      heightPx: GAME_HEIGHT,
    },
    (texture) => {
      texture.draw(graphics, 0, 0);
      return [graphics];
    },
  );
}

function fillVerticalProfile(
  graphics: Phaser.GameObjects.Graphics,
  profile: VerticalProfile,
  getBand: (topYPx: number, bottomYPx: number) => Trapezoid,
  color: number,
  sideAlphas: { readonly left: number; readonly right: number },
): void {
  for (const [index, [bottomRatio, bottomAlpha]] of profile.slice(1).entries()) {
    const [topRatio, topAlpha] = requireDefined(profile[index], 'Missing profile stop', index);
    fillTrapezoid(graphics, getBand(topRatio * GAME_HEIGHT, bottomRatio * GAME_HEIGHT), color, {
      topLeft: topAlpha * sideAlphas.left,
      topRight: topAlpha * sideAlphas.right,
      bottomLeft: bottomAlpha * sideAlphas.left,
      bottomRight: bottomAlpha * sideAlphas.right,
    });
  }
}

// 선은 레인 폭에 비례해 가늘어지지 않고 높이와 무관하게 같은 화면 폭으로 그린다.
function getLineBand(
  playfield: PlayfieldLayout,
  boundaryXPx: number,
  leftOffsetPx: number,
  rightOffsetPx: number,
): (topYPx: number, bottomYPx: number) => Trapezoid {
  return (topYPx, bottomYPx) => {
    const topXPx = getPlayfieldXAtY(playfield, boundaryXPx, topYPx);
    const bottomXPx = getPlayfieldXAtY(playfield, boundaryXPx, bottomYPx);
    return {
      topYPx,
      bottomYPx,
      topLeftXPx: topXPx + leftOffsetPx,
      topRightXPx: topXPx + rightOffsetPx,
      bottomLeftXPx: bottomXPx + leftOffsetPx,
      bottomRightXPx: bottomXPx + rightOffsetPx,
    };
  };
}

function getLaneBoundaryXPx(playfield: PlayfieldLayout, boundary: number): number {
  return playfield.leftPx + playfield.laneWidthPx * boundary;
}

function getLaneDividerXsPx(playfield: PlayfieldLayout, laneCount: LaneCount): readonly number[] {
  return getLanes(laneCount)
    .slice(1)
    .map((boundary) => getLaneBoundaryXPx(playfield, boundary));
}
