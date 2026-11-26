import { requireDefined } from '../../../../invariant.js';

// Phaser Mesh2D 는 꼭짓점마다 x, y, u, v 를 이어 붙인 평평한 배열을 받는다.
const VERTEX_FIELD = {
  x: 0,
  y: 1,
  u: 2,
  v: 3,
} as const;
const VERTEX_STRIDE = 4;
// 이 게임의 메시는 텍스처 페이지를 하나만 쓴다.
const TEXTURE_PAGE = 0;
const FULL_U = {
  fromU: 0,
  toU: 1,
} as const;

type VertexField = keyof typeof VERTEX_FIELD;

export function readMeshVertex(
  vertices: ArrayLike<number>,
  vertex: number,
  field: VertexField,
): number {
  return requireDefined(
    vertices[vertex * VERTEX_STRIDE + VERTEX_FIELD[field]],
    'Missing Mesh2D vertex',
    vertex,
  );
}

export function writeMeshVertex(
  vertices: number[],
  vertex: number,
  field: VertexField,
  value: number,
): void {
  vertices[vertex * VERTEX_STRIDE + VERTEX_FIELD[field]] = value;
}

// 삼각형은 가로·세로 감쇠의 곱을 표현하지 못하므로, 위아래로 흐려지는 면은 한 줄 안의 세로 alpha 변화가 이보다
// 작도록 줄을 나눈다.
export const MAX_ROW_ALPHA_STEP = 0.04;
// alpha 0 → 1 을 MAX_ROW_ALPHA_STEP 이하로 나누는 줄 수.
export const FULL_FADE_ROWS = Math.ceil(1 / MAX_ROW_ALPHA_STEP);

// 메시는 모두 띠(strip) 묶음이다. 띠는 줄마다 왼쪽, 오른쪽 꼭짓점을 차례로 두고, 텍스처는 그림 위쪽이 v = 1 이라
// 맨 윗줄을 v = 1 로 둔다.
export function createStripVertices(
  rows: number,
  { fromU, toU }: { readonly fromU: number; readonly toU: number } = FULL_U,
): number[] {
  const vertices = Array.from({ length: getStripVertexCount(rows) * VERTEX_STRIDE }, () => 0);
  for (let row = 0; row <= rows; row += 1) {
    const leftVertex = getStripRowVertex(rows, 0, row);
    const v = 1 - row / rows;
    writeMeshVertex(vertices, leftVertex, 'u', fromU);
    writeMeshVertex(vertices, leftVertex, 'v', v);
    writeMeshVertex(vertices, leftVertex + 1, 'u', toU);
    writeMeshVertex(vertices, leftVertex + 1, 'v', v);
  }
  return vertices;
}

// Mesh2D 의 indices 는 삼각형마다 꼭짓점 번호 셋 뒤에 텍스처 페이지를 붙인다. 칸 하나를 두 삼각형으로 나눈다.
export function createStripIndices(strips: number, rows: number): number[] {
  return Array.from({ length: strips * rows }, (_, cell) => {
    const topLeft = getStripRowVertex(rows, Math.floor(cell / rows), cell % rows);
    const topRight = topLeft + 1;
    const bottomLeft = topLeft + 2;
    const bottomRight = topLeft + 3;
    return [
      topLeft,
      topRight,
      bottomLeft,
      TEXTURE_PAGE,
      topRight,
      bottomLeft,
      bottomRight,
      TEXTURE_PAGE,
    ];
  }).flat();
}

export function getStripRowVertex(rows: number, strip: number, row: number): number {
  return strip * getStripVertexCount(rows) + row * 2;
}

export function writeStripRow(
  vertices: number[],
  leftVertex: number,
  leftXPx: number,
  rightXPx: number,
  yPx: number,
): void {
  const left = leftVertex * VERTEX_STRIDE;
  const right = left + VERTEX_STRIDE;
  vertices[left + VERTEX_FIELD.x] = leftXPx;
  vertices[left + VERTEX_FIELD.y] = yPx;
  vertices[right + VERTEX_FIELD.x] = rightXPx;
  vertices[right + VERTEX_FIELD.y] = yPx;
}

function getStripVertexCount(rows: number): number {
  return (rows + 1) * 2;
}
