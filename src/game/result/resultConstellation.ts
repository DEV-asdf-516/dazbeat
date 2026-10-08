import type { Zodiac } from '../../data/songs.js';
import { getRank } from '../../rhythm/rank.js';
import { isFullCombo } from '../../rhythm/score.js';
import type { GameplayResult } from '../../rhythm/types.js';
import { ZODIAC_FIGURES } from './zodiacFigures.js';
import type { ZodiacFigure } from './zodiacFigures.js';

export type ConstellationTier = 'faint' | 'clear' | 'bright' | 'complete';

export interface ConstellationBox {
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
}

/** igniteAtMs 가 null 이면 끝까지 어두운 점으로 남는다. 시각은 별자리 연출 시작 기준이다. */
export interface ConstellationNodePlan {
  xPx: number;
  yPx: number;
  isAccent: boolean;
  igniteAtMs: number | null;
}

export interface ConstellationEdgePlan {
  fromIndex: number;
  toIndex: number;
  startMs: number;
  endMs: number;
}

export interface ConstellationPlan {
  tier: ConstellationTier;
  /** figure 의 모든 node 를 figure index 순서로 담는다. */
  nodes: readonly ConstellationNodePlan[];
  /** 연결되는 edge 만 그리기 순서로 담는다. */
  edges: readonly ConstellationEdgePlan[];
  finale: { kind: 'shimmer' | 'pulse'; atMs: number } | null;
}

/** 단위 없는 값. figure 정규화 좌표이거나 여백을 나누는 0~1 비율이다. */
interface UnitPoint {
  x: number;
  y: number;
}

interface PixelPoint {
  xPx: number;
  yPx: number;
}

const FULL_DRAW_MS = 900;
const MAX_ROTATION_RAD = (8 * Math.PI) / 180;
const MIN_SIZE_SCALE = 0.88;
const MAX_SIZE_SCALE = 1;
const MAX_JITTER = 0.015;
const MIN_PACING = 0.9;
const MAX_PACING = 1.1;
// 배치 위치는 남는 여백의 가운데 절반 안에서만 움직여 영역 한쪽에 붙지 않게 한다.
const SLACK_MIN_FRACTION = 0.25;
const SLACK_SPAN_FRACTION = 0.5;
const CLEAR_EDGE_FRACTION = 0.6;
const FAINT_EDGE_FRACTION = 0.3;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function getConstellationTier(
  result: Pick<GameplayResult, 'outcome' | 'accuracy' | 'counts' | 'cleared'>,
): ConstellationTier {
  // 실패는 정확도가 S 여도 완료 연출 없이 흐린 별자리로 끝난다.
  if (result.outcome === 'failed') {
    return 'faint';
  }
  if (isFullCombo(result.counts)) {
    return 'complete';
  }
  if (getRank(result.accuracy) === 'S') {
    return 'bright';
  }
  return result.cleared ? 'clear' : 'faint';
}

export function planSongConstellation(
  songId: string,
  zodiac: Zodiac,
  tier: ConstellationTier,
  box: ConstellationBox,
): ConstellationPlan {
  const figure = ZODIAC_FIGURES[zodiac];
  // 같은 id 가 항상 같은 결과를 내도록 값을 꺼내는 순서를 바꾸지 않는다.
  const random = mulberry32(fnv1a(songId));
  const rotationRad = between(random, -MAX_ROTATION_RAD, MAX_ROTATION_RAD);
  const sizeScale = between(random, MIN_SIZE_SCALE, MAX_SIZE_SCALE);
  const jittered = figure.nodes.map(([x, y]) => ({
    x: x + between(random, -MAX_JITTER, MAX_JITTER),
    y: y + between(random, -MAX_JITTER, MAX_JITTER),
  }));
  const accentIndex = pickAccent(figure, random());
  const slackFraction = { x: random(), y: random() };
  const pacing = between(random, MIN_PACING, MAX_PACING);

  const positions = placeInBox(rotate(jittered, rotationRad), box, sizeScale, slackFraction);
  const edgeCount = figure.edges.length;
  const edgeMs = (FULL_DRAW_MS * pacing) / edgeCount;
  const connectedCount = getConnectedEdgeCount(tier, edgeCount);
  const edges = getDrawOrder(figure, accentIndex)
    .slice(0, connectedCount)
    .map(({ from, to }, index) => ({
      fromIndex: from,
      toIndex: to,
      startMs: index * edgeMs,
      endMs: (index + 1) * edgeMs,
    }));
  const nodes = positions.map(({ xPx, yPx }, index) => ({
    xPx,
    yPx,
    isAccent: index === accentIndex,
    igniteAtMs:
      index === accentIndex ? 0 : (edges.find(({ toIndex }) => toIndex === index)?.endMs ?? null),
  }));
  return { tier, nodes, edges, finale: getFinale(tier, connectedCount * edgeMs) };
}

function getConnectedEdgeCount(tier: ConstellationTier, edgeCount: number): number {
  const clearCount = Math.min(edgeCount - 1, Math.ceil(CLEAR_EDGE_FRACTION * edgeCount));
  switch (tier) {
    case 'complete':
      return edgeCount;
    case 'bright':
      return edgeCount - 1;
    case 'clear':
      return clearCount;
    case 'faint':
      return Math.max(1, Math.min(clearCount - 1, Math.floor(FAINT_EDGE_FRACTION * edgeCount)));
  }
}

function getFinale(tier: ConstellationTier, atMs: number): ConstellationPlan['finale'] {
  switch (tier) {
    case 'complete':
      return { kind: 'pulse', atMs };
    case 'bright':
      return { kind: 'shimmer', atMs };
    case 'clear':
    case 'faint':
      return null;
  }
}

function pickAccent(figure: ZodiacFigure, unit: number): number {
  const candidates = figure.accentNodeIndices;
  const accentIndex = candidates[Math.floor(unit * candidates.length)];
  if (accentIndex === undefined || figure.nodes[accentIndex] === undefined) {
    throw new Error(`Invalid zodiac accent: ${String(accentIndex)}`);
  }
  return accentIndex;
}

/** accent 에서 시작해 base edge 목록 순서로 이미 점등된 node 에 닿는 첫 edge 를 반복해 고른다. */
function getDrawOrder(
  figure: ZodiacFigure,
  accentIndex: number,
): readonly { from: number; to: number }[] {
  const lit = new Set([accentIndex]);
  const remaining = [...figure.edges];
  const order: { from: number; to: number }[] = [];
  while (remaining.length > 0) {
    const position = remaining.findIndex(([a, b]) => lit.has(a) || lit.has(b));
    const edge = remaining[position];
    if (edge === undefined) {
      throw new Error('Zodiac figure is not connected');
    }
    const [a, b] = edge;
    if (figure.nodes[a] === undefined || figure.nodes[b] === undefined) {
      throw new Error(`Invalid zodiac edge: ${a}-${b}`);
    }
    const from = lit.has(a) ? a : b;
    order.push({ from, to: from === a ? b : a });
    lit.add(a).add(b);
    remaining.splice(position, 1);
  }
  return order;
}

function rotate(points: readonly UnitPoint[], rotationRad: number): readonly UnitPoint[] {
  const bounds = getBounds(points);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return points.map(({ x, y }) => {
    const dx = x - centerX;
    const dy = y - centerY;
    return { x: centerX + dx * cos - dy * sin, y: centerY + dx * sin + dy * cos };
  });
}

/** 가로세로 비율을 지키며 영역에 맞춘 뒤 sizeScale 만큼 줄이고, 남는 여백을 slackFraction 비율로 나눠 옮긴다. */
function placeInBox(
  points: readonly UnitPoint[],
  box: ConstellationBox,
  sizeScale: number,
  slackFraction: UnitPoint,
): readonly PixelPoint[] {
  const { minX, minY, maxX, maxY } = getBounds(points);
  const pxPerUnit = Math.min(box.widthPx / (maxX - minX), box.heightPx / (maxY - minY)) * sizeScale;
  const slackXPx = box.widthPx - (maxX - minX) * pxPerUnit;
  const slackYPx = box.heightPx - (maxY - minY) * pxPerUnit;
  const leftPx =
    box.leftPx + slackXPx * (SLACK_MIN_FRACTION + SLACK_SPAN_FRACTION * slackFraction.x);
  const topPx = box.topPx + slackYPx * (SLACK_MIN_FRACTION + SLACK_SPAN_FRACTION * slackFraction.y);
  return points.map(({ x, y }) => ({
    xPx: leftPx + (x - minX) * pxPerUnit,
    yPx: topPx + (y - minY) * pxPerUnit,
  }));
}

function getBounds(points: readonly UnitPoint[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function between(random: () => number, min: number, max: number): number {
  return min + (max - min) * random();
}

/** FNV-1a 32bit. 문자열의 UTF-16 code unit 을 차례로 섞는다. */
function fnv1a(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME) >>> 0;
  }
  return hash;
}

/** mulberry32: 32bit 시드로 [0, 1) 값을 차례로 내는 결정론적 PRNG. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
