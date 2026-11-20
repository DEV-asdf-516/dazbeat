import Phaser from 'phaser';
import { requireDefined } from '../../../../invariant.js';
import { clamp, getDistance, getFraction, lerp } from '../../../../range.js';
import { isFiniteNumber } from '../../../../typeGuards.js';
import { PIXEL_CHANNEL, getPixelIndex } from '../textures/imagePixels.js';
import { rgba } from '../textures/lightTextures.js';
import { readMeshVertex } from '../textures/meshGeometry.js';
import { getTintedImage } from './tint.js';

const WHITE = 0xffffff;
// indices 는 삼각형마다 [a, b, c, 텍스처 페이지] 이고, indicesOrdered 는 변을 공유하는 두 삼각형
// [p, q, r, 페이지, q, r, s, 페이지] 를 사각형 하나로 묶는다(Phaser Mesh2D.buildOrderedIndices).
const TRIANGLE_STRIDE = 4;
const QUAD_STRIDE = 8;
const INDEX_FIELD = {
  vertex0: 0,
  vertex1: 1,
  vertex2: 2,
  page: 3,
  quadVertex3: 6,
} as const;
const MIN_UV_SPAN_PX = 0.5;
const MIN_SCREEN_AREA_PX = 0.01;
const MIN_DENOMINATOR = 1e-6;
const MAX_UNCLIPPED_ROW_WIDTH_DIFFERENCE_PX = 2;
const MAX_CHANNEL = 255;
const TEXEL_CENTER = 0.5;

type TintRects = Parameters<typeof getTintedImage>[1];

// 채널 값은 alpha 를 곱한 값이다.
interface Texel {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

interface AxisPoint {
  xPx: number;
  yPx: number;
  texelPx: number;
}

const sourceRects = new WeakMap<Phaser.Textures.TextureSource, TintRects>();
const imagePixels = new WeakMap<CanvasImageSource, ImageData>();

// Phaser 타입 선언에는 Mesh2D 의 tint 가 없다.
function readTint(src: Phaser.GameObjects.Mesh2D): number {
  if (!('tint' in src) || !isFiniteNumber(src.tint)) {
    throw new Error('Mesh2D has no tint');
  }
  return src.tint;
}

function readValue(values: ArrayLike<number>, index: number): number {
  return requireDefined(values[index], 'Missing Mesh2D value', index);
}

function getSourceImage(source: Phaser.Textures.TextureSource, tint: number): CanvasImageSource {
  // 흰색 틴트는 색을 1 로 곱해 그대로이므로 물들인 사본을 만들지 않고 원본을 쓴다.
  if (tint === WHITE) {
    const { image } = source;
    if (image === null) {
      throw new Error('Mesh2D texture source has no image');
    }
    return image;
  }
  let rects = sourceRects.get(source);
  if (rects === undefined) {
    rects = [
      {
        x: 0,
        y: 0,
        widthPx: source.width,
        heightPx: source.height,
      },
    ];
    sourceRects.set(source, rects);
  }
  return getTintedImage(source, rects, {
    tintTopLeft: tint,
    tintTopRight: tint,
    tintBottomLeft: tint,
    tintBottomRight: tint,
  });
}

// 텍스처 위쪽이 v = 1 이다.
function readTextureY(v: number, isFlippedV: boolean, heightPx: number): number {
  return (isFlippedV ? v : 1 - v) * heightPx;
}

// 메시 텍스처와 틴트 사본은 한 번 구운 뒤 바뀌지 않아 그림마다 한 번 읽은 픽셀을 무효화 없이 둔다.
function readImagePixels(image: CanvasImageSource, widthPx: number, heightPx: number): ImageData {
  const cached = imagePixels.get(image);
  if (cached !== undefined) {
    return cached;
  }
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Failed to create Mesh2D pixel context');
  }
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  imagePixels.set(image, pixels);
  return pixels;
}

function readTexel(pixels: ImageData, xPx: number, yPx: number): Texel {
  const { width, height, data } = pixels;
  const index = getPixelIndex(clamp(xPx, 0, width - 1), clamp(yPx, 0, height - 1), width);
  const alpha = readValue(data, index + PIXEL_CHANNEL.alpha) / MAX_CHANNEL;
  return {
    red: readValue(data, index + PIXEL_CHANNEL.red) * alpha,
    green: readValue(data, index + PIXEL_CHANNEL.green) * alpha,
    blue: readValue(data, index + PIXEL_CHANNEL.blue) * alpha,
    alpha,
  };
}

function formatTexel({ red, green, blue, alpha }: Texel): string {
  const scale = alpha === 0 ? 0 : 1 / alpha;
  const color =
    (Math.round(red * scale) << 16) | (Math.round(green * scale) << 8) | Math.round(blue * scale);
  return rgba(color, alpha);
}

// GPU 선형 필터처럼 이웃 두 텍셀 가운데 사이를 premultiplied 값으로 보간한다.
function sampleTexel(readAlong: (index: number) => Texel, texelPx: number): Texel {
  const position = texelPx - TEXEL_CENTER;
  const index = Math.floor(position);
  const t = position - index;
  const from = readAlong(index);
  const to = readAlong(index + 1);
  return {
    red: lerp(from.red, to.red, t),
    green: lerp(from.green, to.green, t),
    blue: lerp(from.blue, to.blue, t),
    alpha: lerp(from.alpha, to.alpha, t),
  };
}

// 남은 축 좌표는 화면 위치의 1차식이라 graphics.ts 의 alphaPlaneStyle 과 같은 식으로 기울기 방향 그라데이션이 된다.
// 텍셀 가운데마다 정지점을 두면 캔버스의 정지점 사이 보간이 GPU 선형 필터와 같아진다.
function createAxisGradient(
  ctx: CanvasRenderingContext2D,
  points: readonly [AxisPoint, AxisPoint, AxisPoint],
  readAlong: (index: number) => Texel,
): CanvasGradient {
  const [p0, p1, p2] = points;
  const determinant = (p1.xPx - p0.xPx) * (p2.yPx - p0.yPx) - (p2.xPx - p0.xPx) * (p1.yPx - p0.yPx);
  const gx =
    ((p1.texelPx - p0.texelPx) * (p2.yPx - p0.yPx) -
      (p2.texelPx - p0.texelPx) * (p1.yPx - p0.yPx)) /
    determinant;
  const gy =
    ((p2.texelPx - p0.texelPx) * (p1.xPx - p0.xPx) -
      (p1.texelPx - p0.texelPx) * (p2.xPx - p0.xPx)) /
    determinant;
  const lengthSq = gx * gx + gy * gy;
  const low = Math.min(p0.texelPx, p1.texelPx, p2.texelPx);
  const high = Math.max(p0.texelPx, p1.texelPx, p2.texelPx);
  const startShift = (low - p0.texelPx) / lengthSq;
  const endShift = (high - p0.texelPx) / lengthSq;
  const gradient = ctx.createLinearGradient(
    p0.xPx + gx * startShift,
    p0.yPx + gy * startShift,
    p0.xPx + gx * endShift,
    p0.yPx + gy * endShift,
  );
  gradient.addColorStop(0, formatTexel(sampleTexel(readAlong, low)));
  for (let index = Math.floor(low - TEXEL_CENTER) + 1; index + TEXEL_CENTER < high; index++) {
    gradient.addColorStop(
      getFraction(index + TEXEL_CENTER, low, high),
      formatTexel(readAlong(index)),
    );
  }
  gradient.addColorStop(1, formatTexel(sampleTexel(readAlong, high)));
  return gradient;
}

// 꼭짓점 0·1·2 는 첫 삼각형이고 아핀 변환의 기준이다. 사각형은 0→1→3→2 로 자르고, 삼각형은 vertex3 = vertex2 로 넘긴다.
function drawPiece(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  src: Phaser.GameObjects.Mesh2D,
  source: Phaser.Textures.TextureSource,
  vertex0: number,
  vertex1: number,
  vertex2: number,
  vertex3: number,
): void {
  const { vertices, flipV } = src;
  const x0 = readMeshVertex(vertices, vertex0, 'x');
  const y0 = readMeshVertex(vertices, vertex0, 'y');
  const x1 = readMeshVertex(vertices, vertex1, 'x');
  const y1 = readMeshVertex(vertices, vertex1, 'y');
  const x2 = readMeshVertex(vertices, vertex2, 'x');
  const y2 = readMeshVertex(vertices, vertex2, 'y');
  const x3 = readMeshVertex(vertices, vertex3, 'x');
  const y3 = readMeshVertex(vertices, vertex3, 'y');
  const screenArea = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(screenArea) < MIN_SCREEN_AREA_PX) {
    return;
  }
  const { width, height } = source;
  const u0 = readMeshVertex(vertices, vertex0, 'u') * width;
  const u1 = readMeshVertex(vertices, vertex1, 'u') * width;
  const u2 = readMeshVertex(vertices, vertex2, 'u') * width;
  const u3 = readMeshVertex(vertices, vertex3, 'u') * width;
  const v0 = readTextureY(readMeshVertex(vertices, vertex0, 'v'), flipV, height);
  const v1 = readTextureY(readMeshVertex(vertices, vertex1, 'v'), flipV, height);
  const v2 = readTextureY(readMeshVertex(vertices, vertex2, 'v'), flipV, height);
  const v3 = readTextureY(readMeshVertex(vertices, vertex3, 'v'), flipV, height);
  // 위아래 변이 가로인 사각형은 위아래 y 를 정수 px 로 맞춰 이웃 줄과 맞닿는 가로 변의 이음매를 없앤다.
  const isRow = vertex3 !== vertex2 && y0 === y1 && y2 === y3;
  const topYPx = isRow ? Math.round(y0) : y0;
  const bottomYPx = isRow ? Math.round(y2) : y2;
  if (isRow && topYPx === bottomYPx) {
    return;
  }
  const pathY1Px = isRow ? topYPx : y1;
  const pathY3Px = isRow ? bottomYPx : y3;
  const isUFlat = getDistance(u1, u0) < MIN_UV_SPAN_PX && getDistance(u2, u0) < MIN_UV_SPAN_PX;
  const isVFlat = getDistance(v1, v0) < MIN_UV_SPAN_PX && getDistance(v2, v0) < MIN_UV_SPAN_PX;
  // 텍스처 폭이 0 인 축은 변환을 구할 수 없어 그 축 방향으로 색이 같은 조각을 텍셀 색으로 직접 칠한다.
  if (isUFlat || isVFlat) {
    const pixels = readImagePixels(image, width, height);
    const column = Math.floor(u0);
    const row = Math.floor(v0);
    if (isUFlat && isVFlat) {
      ctx.fillStyle = formatTexel(readTexel(pixels, column, row));
    } else {
      ctx.fillStyle = createAxisGradient(
        ctx,
        [
          {
            xPx: x0,
            yPx: topYPx,
            texelPx: isUFlat ? v0 : u0,
          },
          {
            xPx: x1,
            yPx: pathY1Px,
            texelPx: isUFlat ? v1 : u1,
          },
          {
            xPx: x2,
            yPx: bottomYPx,
            texelPx: isUFlat ? v2 : u2,
          },
        ],
        isUFlat
          ? (index) => readTexel(pixels, column, index)
          : (index) => readTexel(pixels, index, row),
      );
    }
    ctx.beginPath();
    ctx.moveTo(x0, topYPx);
    ctx.lineTo(x1, pathY1Px);
    ctx.lineTo(x3, pathY3Px);
    ctx.lineTo(x2, bottomYPx);
    ctx.closePath();
    ctx.fill();
    return;
  }
  const denominator = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
  if (Math.abs(denominator) < MIN_DENOMINATOR) {
    return;
  }
  // 위아래 폭 차이가 작은 줄은 clip 비용을 아끼려고 평행사변형으로 그리고, 꼭짓점 3 이 그만큼 어긋나는 것을 받아들인다.
  const isUnclipped =
    isRow && getDistance(x3 - x2, x1 - x0) <= MAX_UNCLIPPED_ROW_WIDTH_DIFFERENCE_PX;
  const baseY0Px = isUnclipped ? topYPx : y0;
  const baseY1Px = isUnclipped ? pathY1Px : y1;
  const baseY2Px = isUnclipped ? bottomYPx : y2;
  const m11 = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / denominator;
  const m21 = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / denominator;
  const m12 = ((baseY1Px - baseY0Px) * (v2 - v0) - (baseY2Px - baseY0Px) * (v1 - v0)) / denominator;
  const m22 = ((baseY2Px - baseY0Px) * (u1 - u0) - (baseY1Px - baseY0Px) * (u2 - u0)) / denominator;
  const translateXPx = x0 - m11 * u0 - m21 * v0;
  const translateYPx = baseY0Px - m12 * u0 - m22 * v0;
  ctx.save();
  if (isUnclipped) {
    // clip 이 없으므로 넓혀 읽으면 이웃 텍셀이 조각 밖으로 그려진다.
    const left = Math.min(u0, u1);
    const top = Math.min(v0, v2);
    const sourceWidthPx = Math.abs(u1 - u0);
    const sourceHeightPx = Math.abs(v2 - v0);
    ctx.transform(m11, m12, m21, m22, translateXPx, translateYPx);
    ctx.drawImage(
      image,
      left,
      top,
      sourceWidthPx,
      sourceHeightPx,
      left,
      top,
      sourceWidthPx,
      sourceHeightPx,
    );
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x0, topYPx);
  ctx.lineTo(x1, pathY1Px);
  ctx.lineTo(x3, pathY3Px);
  ctx.lineTo(x2, bottomYPx);
  ctx.closePath();
  ctx.clip();
  ctx.transform(m11, m12, m21, m22, translateXPx, translateYPx);
  const left = Math.max(0, Math.floor(Math.min(u0, u1, u2, u3)) - 1);
  const top = Math.max(0, Math.floor(Math.min(v0, v1, v2, v3)) - 1);
  const right = Math.min(width, Math.ceil(Math.max(u0, u1, u2, u3)) + 1);
  const bottom = Math.min(height, Math.ceil(Math.max(v0, v1, v2, v3)) + 1);
  if (right > left && bottom > top) {
    ctx.drawImage(
      image,
      left,
      top,
      right - left,
      bottom - top,
      left,
      top,
      right - left,
      bottom - top,
    );
  }
  ctx.restore();
}

export function renderMesh2DCanvas(
  renderer: Phaser.Renderer.Canvas.CanvasRenderer,
  src: Phaser.GameObjects.Mesh2D,
  camera: Phaser.Cameras.Scene2D.Camera,
  parentMatrix?: Phaser.GameObjects.Components.TransformMatrix,
): void {
  const ctx = renderer.currentContext;
  if (!Phaser.Renderer.Canvas.SetTransform(renderer, ctx, src, camera, parentMatrix)) {
    return;
  }
  camera.addToRenderList(src);
  const tint = readTint(src);
  const ordered = src.useOrderedIndices ? src.indicesOrdered : null;
  const indices = ordered ?? src.indices;
  const stride = ordered === null ? TRIANGLE_STRIDE : QUAD_STRIDE;
  // 페이지는 거의 늘 하나라 바뀔 때만 소스와 그림을 다시 찾는다.
  let page = 0;
  let source = requireDefined(src.texture.source[page], 'Missing Mesh2D texture page', page);
  let image = getSourceImage(source, tint);
  for (let index = 0; index + stride <= indices.length; index += stride) {
    const nextPage = readValue(indices, index + INDEX_FIELD.page);
    if (nextPage !== page) {
      page = nextPage;
      source = requireDefined(src.texture.source[page], 'Missing Mesh2D texture page', page);
      image = getSourceImage(source, tint);
    }
    const vertex2 = readValue(indices, index + INDEX_FIELD.vertex2);
    drawPiece(
      ctx,
      image,
      src,
      source,
      readValue(indices, index + INDEX_FIELD.vertex0),
      readValue(indices, index + INDEX_FIELD.vertex1),
      vertex2,
      ordered === null ? vertex2 : readValue(indices, index + INDEX_FIELD.quadVertex3),
    );
  }
  ctx.restore();
}
