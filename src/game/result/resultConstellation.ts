import type { Zodiac } from '../../data/songs.js';
import { getRank } from '../../rhythm/rank.js';
import { isFullCombo } from '../../rhythm/score.js';
import type { GameplayResult } from '../../rhythm/types.js';
import type { PlayMode } from '../sceneRoutes.js';
import { ZODIAC_FIGURES } from './zodiacFigures.js';
import type { ZodiacFigure } from './zodiacFigures.js';
import { getProgress, lerp } from '../../range.js';
import { requireDefined } from '../../invariant.js';

export type ConstellationTier = 'faint' | 'clear' | 'bright' | 'complete';

export interface ResultPresentation {
  readonly tier: ConstellationTier;
  readonly hasFinish: boolean;
  readonly hasFullComboLabel: boolean;
}

export interface ConstellationBox {
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
}

export interface ConstellationPoint {
  xPx: number;
  yPx: number;
}

export interface ConstellationFigurePoint extends ConstellationPoint {
  index: number;
}

export type ConstellationNode = ConstellationFigurePoint &
  ({ kind: 'lit'; igniteAtMs: number } | { kind: 'dark' });

export interface ConstellationEdgePlan {
  fromIndex: number;
  toIndex: number;
  from: ConstellationPoint;
  to: ConstellationPoint;
  startMs: number;
  endMs: number;
}

export interface ConstellationPlan {
  tier: ConstellationTier;
  accent: ConstellationFigurePoint;
  others: readonly ConstellationNode[];
  edges: readonly ConstellationEdgePlan[];
  drawEndMs: number;
}

export interface ConstellationLook {
  nodeCore: number;
  lineCore: number;
  glow: {
    nodeHalo: number;
    lineHalo: number;
    finale: 'shimmer' | 'pulse' | null;
  } | null;
}

export const CONSTELLATION_LOOKS: Readonly<Record<ConstellationTier, ConstellationLook>> = {
  faint: {
    nodeCore: 0.6,
    lineCore: 0.4,
    glow: null,
  },
  clear: {
    nodeCore: 0.85,
    lineCore: 0.55,
    glow: {
      nodeHalo: 0.14,
      lineHalo: 0.08,
      finale: null,
    },
  },
  bright: {
    nodeCore: 1,
    lineCore: 0.65,
    glow: {
      nodeHalo: 0.2,
      lineHalo: 0.12,
      finale: 'shimmer',
    },
  },
  complete: {
    nodeCore: 1,
    lineCore: 0.75,
    glow: {
      nodeHalo: 0.26,
      lineHalo: 0.16,
      finale: 'pulse',
    },
  },
};

export interface ConstellationLine {
  fromXPx: number;
  fromYPx: number;
  toXPx: number;
  toYPx: number;
}

interface UnitPoint {
  x: number;
  y: number;
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

export function getResultPresentation(mode: PlayMode, result: GameplayResult): ResultPresentation {
  if (mode === 'practice') {
    return {
      tier: 'faint',
      hasFinish: false,
      hasFullComboLabel: isFullCombo(result.counts),
    };
  }
  const tier = getConstellationTier(result);
  return {
    tier,
    hasFinish: result.cleared,
    // 실패는 HP 가 BAD·MISS 로만 깎여 0 이 될 때뿐이라 FULL COMBO 와 겹치지 않는다. complete 가 곧 FULL COMBO 다.
    hasFullComboLabel: tier === 'complete',
  };
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
  const rotationRad = lerp(-MAX_ROTATION_RAD, MAX_ROTATION_RAD, random());
  const sizeScale = lerp(MIN_SIZE_SCALE, MAX_SIZE_SCALE, random());
  const jittered = figure.nodes.map(([x, y]) => ({
    x: x + lerp(-MAX_JITTER, MAX_JITTER, random()),
    y: y + lerp(-MAX_JITTER, MAX_JITTER, random()),
  }));
  const accentIndex = pickAccent(figure, random());
  const slackFraction = {
    x: random(),
    y: random(),
  };
  const pacing = lerp(MIN_PACING, MAX_PACING, random());

  const positions = placeInBox(rotate(jittered, rotationRad), box, sizeScale, slackFraction);
  const accent = requireDefined(positions[accentIndex], 'Invalid zodiac accent', accentIndex);
  const edgeCount = figure.edges.length;
  const edgeMs = (FULL_DRAW_MS * pacing) / edgeCount;
  const connectedCount = getConnectedEdgeCount(tier, edgeCount);
  const edges = getDrawOrder(figure, positions, accentIndex)
    .slice(0, connectedCount)
    .map((edge, index) => ({
      ...edge,
      startMs: index * edgeMs,
      endMs: (index + 1) * edgeMs,
    }));
  const others = positions.flatMap(({ xPx, yPx }, index): ConstellationNode[] => {
    if (index === accentIndex) {
      return [];
    }
    const arrival = edges.find(({ toIndex }) => toIndex === index);
    return [
      arrival === undefined
        ? {
            index,
            xPx,
            yPx,
            kind: 'dark',
          }
        : {
            index,
            xPx,
            yPx,
            kind: 'lit',
            igniteAtMs: arrival.endMs,
          },
    ];
  });
  return {
    tier,
    accent: {
      index: accentIndex,
      ...accent,
    },
    others,
    edges,
    drawEndMs: connectedCount * edgeMs,
  };
}

export function getConstellationLines(
  plan: ConstellationPlan,
  elapsedMs: number,
): readonly ConstellationLine[] {
  return plan.edges.flatMap(({ from, to, startMs, endMs }) => {
    const segment = getProgress(elapsedMs, startMs, endMs);
    if (segment === 0) {
      return [];
    }
    return [
      {
        fromXPx: from.xPx,
        fromYPx: from.yPx,
        toXPx: lerp(from.xPx, to.xPx, segment),
        toYPx: lerp(from.yPx, to.yPx, segment),
      },
    ];
  });
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

function pickAccent(figure: ZodiacFigure, unit: number): number {
  const candidates = figure.accentNodeIndices;
  return requireDefined(
    candidates[Math.floor(unit * candidates.length)],
    'Zodiac figure has no accent candidate',
  );
}

function getDrawOrder(
  figure: ZodiacFigure,
  positions: readonly ConstellationPoint[],
  accentIndex: number,
): readonly Pick<ConstellationEdgePlan, 'fromIndex' | 'toIndex' | 'from' | 'to'>[] {
  const lit = new Set([accentIndex]);
  const remaining = [...figure.edges];
  const order: Pick<ConstellationEdgePlan, 'fromIndex' | 'toIndex' | 'from' | 'to'>[] = [];
  while (remaining.length > 0) {
    const position = remaining.findIndex(([a, b]) => lit.has(a) || lit.has(b));
    const [a, b] = requireDefined(remaining[position], 'Zodiac figure is not connected');
    const fromIndex = lit.has(a) ? a : b;
    const toIndex = fromIndex === a ? b : a;
    const from = requireDefined(positions[fromIndex], 'Invalid zodiac edge node', fromIndex);
    const to = requireDefined(positions[toIndex], 'Invalid zodiac edge node', toIndex);
    order.push({
      fromIndex,
      toIndex,
      from,
      to,
    });
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
    return {
      x: centerX + dx * cos - dy * sin,
      y: centerY + dx * sin + dy * cos,
    };
  });
}

function placeInBox(
  points: readonly UnitPoint[],
  box: ConstellationBox,
  sizeScale: number,
  slackFraction: UnitPoint,
): readonly ConstellationPoint[] {
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

/** FNV-1a 32bit. */
function fnv1a(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME) >>> 0;
  }
  return hash;
}

/** mulberry32 */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
