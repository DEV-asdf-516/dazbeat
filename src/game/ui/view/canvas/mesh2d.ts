import Phaser from 'phaser';
import { requireDefined } from '../../../../invariant.js';
import { getDistance } from '../../../../range.js';
import { isFiniteNumber } from '../../../../typeGuards.js';
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

type TintRects = Parameters<typeof getTintedImage>[1];

const sourceRects = new WeakMap<Phaser.Textures.TextureSource, TintRects>();

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
function readTextureY(v: number, flipV: boolean, heightPx: number): number {
  return (flipV ? v : 1 - v) * heightPx;
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
  let u1 = readMeshVertex(vertices, vertex1, 'u') * width;
  let u2 = readMeshVertex(vertices, vertex2, 'u') * width;
  const u3 = readMeshVertex(vertices, vertex3, 'u') * width;
  const v0 = readTextureY(readMeshVertex(vertices, vertex0, 'v'), flipV, height);
  let v1 = readTextureY(readMeshVertex(vertices, vertex1, 'v'), flipV, height);
  let v2 = readTextureY(readMeshVertex(vertices, vertex2, 'v'), flipV, height);
  const v3 = readTextureY(readMeshVertex(vertices, vertex3, 'v'), flipV, height);
  // 홀드 줄의 위아래 alpha 가 같으면 텍스처 폭이 0 이라 변환을 구할 수 없으므로 그 축을 반 px 폭으로 읽는다.
  if (getDistance(v1, v0) < MIN_UV_SPAN_PX && getDistance(v2, v0) < MIN_UV_SPAN_PX) {
    v1 = v0;
    v2 = v0 + MIN_UV_SPAN_PX;
  }
  if (getDistance(u1, u0) < MIN_UV_SPAN_PX && getDistance(u2, u0) < MIN_UV_SPAN_PX) {
    u1 = u0 + MIN_UV_SPAN_PX;
    u2 = u0;
  }
  const denominator = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
  if (Math.abs(denominator) < MIN_DENOMINATOR) {
    return;
  }
  const m11 = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / denominator;
  const m21 = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / denominator;
  const m12 = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / denominator;
  const m22 = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / denominator;
  ctx.save();
  // 위아래 변이 가로인 사각형은 자르는 경계를 정수 px 로 맞춰 이웃 줄과 맞닿는 가로 변의 이음매를 없앤다.
  const isRow = vertex3 !== vertex2 && y0 === y1 && y2 === y3;
  ctx.beginPath();
  ctx.moveTo(x0, isRow ? Math.round(y0) : y0);
  ctx.lineTo(x1, isRow ? Math.round(y1) : y1);
  ctx.lineTo(x3, isRow ? Math.round(y3) : y3);
  ctx.lineTo(x2, isRow ? Math.round(y2) : y2);
  ctx.closePath();
  ctx.clip();
  ctx.transform(m11, m12, m21, m22, x0 - m11 * u0 - m21 * v0, y0 - m12 * u0 - m22 * v0);
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
