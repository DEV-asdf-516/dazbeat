import { describe, expect, it } from 'vitest';
import { ZODIACS } from '../../../src/data/songs.js';
import type { Zodiac } from '../../../src/data/songs.js';
import {
  getConstellationLines,
  getConstellationTier,
  planSongConstellation,
} from '../../../src/game/result/resultConstellation.js';
import type {
  ConstellationBox,
  ConstellationPlan,
  ConstellationTier,
} from '../../../src/game/result/resultConstellation.js';
import { ZODIAC_FIGURES } from '../../../src/game/result/zodiacFigures.js';
import type { JudgmentCounts } from '../../../src/rhythm/types.js';

const BOX: ConstellationBox = { leftPx: 740, topPx: 210, widthPx: 500, heightPx: 480 };
const TIERS: readonly ConstellationTier[] = ['faint', 'clear', 'bright', 'complete'];
const SONG_IDS = Array.from({ length: 200 }, (_value, index) => `song-${index}`);

function counts(miss: number, bad = 0): JudgmentCounts {
  return { perfect: 10, great: 0, good: 0, bad, miss };
}

function edgeKey(a: number, b: number): string {
  return [a, b].sort((x, y) => x - y).join('-');
}

function plan(songId: string, zodiac: Zodiac, tier: ConstellationTier): ConstellationPlan {
  return planSongConstellation(songId, zodiac, tier, BOX);
}

function getAccentIndex(result: ConstellationPlan): number {
  const accents = result.nodes.flatMap((node, index) => (node.isAccent ? [index] : []));
  expect(accents).toHaveLength(1);
  const [accent] = accents;
  if (accent === undefined) {
    throw new Error('No accent node');
  }
  return accent;
}

describe('getConstellationTier', () => {
  it('is faint for a failed result even with rank S accuracy', () => {
    expect(
      getConstellationTier({
        outcome: 'failed',
        accuracy: 0.952,
        counts: { perfect: 200, great: 0, good: 0, bad: 0, miss: 10 },
        cleared: false,
      }),
    ).toBe('faint');
  });

  it('is complete on a full combo even with low accuracy', () => {
    expect(
      getConstellationTier({
        outcome: 'finished',
        accuracy: 0.3,
        counts: counts(0),
        cleared: false,
      }),
    ).toBe('complete');
  });

  it('is not complete when a BAD broke the combo', () => {
    expect(
      getConstellationTier({
        outcome: 'finished',
        accuracy: 0.95,
        counts: counts(0, 1),
        cleared: true,
      }),
    ).toBe('bright');
  });

  it('is bright from rank S accuracy when a note was missed', () => {
    expect(
      getConstellationTier({
        outcome: 'finished',
        accuracy: 0.95,
        counts: counts(1),
        cleared: true,
      }),
    ).toBe('bright');
    expect(
      getConstellationTier({
        outcome: 'finished',
        accuracy: 0.9499999,
        counts: counts(1),
        cleared: true,
      }),
    ).toBe('clear');
  });

  it('is clear when cleared and faint otherwise', () => {
    expect(
      getConstellationTier({
        outcome: 'finished',
        accuracy: 0.7,
        counts: counts(1),
        cleared: true,
      }),
    ).toBe('clear');
    expect(
      getConstellationTier({
        outcome: 'finished',
        accuracy: 0.6999999,
        counts: counts(1),
        cleared: false,
      }),
    ).toBe('faint');
  });
});

describe('planSongConstellation', () => {
  it.each([
    ['aries', [1, 2, 2, 3]],
    ['cancer', [1, 3, 3, 4]],
    ['pisces', [4, 10, 15, 16]],
  ] as const)('connects the tier edge counts for %s', (zodiac, expected) => {
    expect(TIERS.map((tier) => plan('s1', zodiac, tier).edges.length)).toEqual(expected);
  });

  it.each(ZODIACS)('keeps edge counts monotonic and nodes complete for %s', (zodiac) => {
    const figure = ZODIAC_FIGURES[zodiac];
    const [faint, clear, bright, complete] = TIERS.map((tier) => plan('s1', zodiac, tier));
    if (
      faint === undefined ||
      clear === undefined ||
      bright === undefined ||
      complete === undefined
    ) {
      throw new Error('Missing tier plan');
    }
    expect(faint.edges.length).toBeGreaterThanOrEqual(1);
    expect(faint.edges.length).toBeLessThan(clear.edges.length);
    expect(clear.edges.length).toBeLessThanOrEqual(bright.edges.length);
    expect(bright.edges.length).toBeLessThan(complete.edges.length);
    expect(complete.edges).toHaveLength(figure.edges.length);
    [faint, clear, bright, complete].forEach((result) => {
      expect(result.nodes).toHaveLength(figure.nodes.length);
    });
  });

  it.each(ZODIACS)('lights exactly the accent and connected edge ends for %s', (zodiac) => {
    TIERS.forEach((tier) => {
      const result = plan('s1', zodiac, tier);
      const lit = new Set([getAccentIndex(result)]);
      result.edges.forEach(({ fromIndex, toIndex }) => lit.add(fromIndex).add(toIndex));
      result.nodes.forEach((node, index) => {
        expect(node.igniteAtMs !== null).toBe(lit.has(index));
      });
    });
  });

  it('returns the same plan for the same song id', () => {
    expect(plan('sample', 'gemini', 'clear')).toEqual(plan('sample', 'gemini', 'clear'));
  });

  it.each(ZODIACS)('varies layout but keeps topology between song ids for %s', (zodiac) => {
    const a = plan('song-a', zodiac, 'complete');
    const b = plan('song-b', zodiac, 'complete');
    expect(a.nodes.map(({ xPx, yPx }) => [xPx, yPx])).not.toEqual(
      b.nodes.map(({ xPx, yPx }) => [xPx, yPx]),
    );
    const pairs = (result: ConstellationPlan): string[] =>
      result.edges.map(({ fromIndex, toIndex }) => edgeKey(fromIndex, toIndex)).sort();
    expect(pairs(a)).toEqual(pairs(b));
  });

  it('places every node inside the box', () => {
    ZODIACS.forEach((zodiac) => {
      SONG_IDS.slice(0, 50).forEach((songId) => {
        plan(songId, zodiac, 'faint').nodes.forEach(({ xPx, yPx }) => {
          expect(xPx).toBeGreaterThanOrEqual(BOX.leftPx);
          expect(xPx).toBeLessThanOrEqual(BOX.leftPx + BOX.widthPx);
          expect(yPx).toBeGreaterThanOrEqual(BOX.topPx);
          expect(yPx).toBeLessThanOrEqual(BOX.topPx + BOX.heightPx);
        });
      });
    });
  });

  it.each(ZODIACS)('draws from every accent candidate along lit nodes for %s', (zodiac) => {
    const figure = ZODIAC_FIGURES[zodiac];
    const baseEdges = figure.edges.map(([a, b]) => edgeKey(a, b)).sort();
    const accentsSeen = new Set<number>();
    SONG_IDS.forEach((songId) => {
      const result = plan(songId, zodiac, 'complete');
      const accent = getAccentIndex(result);
      accentsSeen.add(accent);
      const lit = new Set([accent]);
      expect(result.edges[0]?.fromIndex).toBe(accent);
      result.edges.forEach(({ fromIndex, toIndex }) => {
        expect(lit.has(fromIndex)).toBe(true);
        lit.add(toIndex);
      });
      expect(
        result.edges.map(({ fromIndex, toIndex }) => edgeKey(fromIndex, toIndex)).sort(),
      ).toEqual(baseEdges);
    });
    expect([...accentsSeen].sort()).toEqual([...figure.accentNodeIndices].sort());
  });

  it.each(ZODIACS)(
    'schedules edges in order and ignites nodes on first arrival for %s',
    (zodiac) => {
      TIERS.forEach((tier) => {
        const result = plan('sample', zodiac, tier);
        const firstEdge = result.edges[0];
        expect(firstEdge?.startMs).toBe(0);
        result.edges.forEach((edge, index) => {
          expect(edge.endMs).toBeGreaterThan(edge.startMs);
          const previous = result.edges[index - 1];
          if (previous !== undefined) {
            expect(edge.startMs).toBeCloseTo(previous.endMs);
          }
        });
        result.nodes.forEach((node, index) => {
          if (node.isAccent) {
            expect(node.igniteAtMs).toBe(0);
            return;
          }
          const arrival = result.edges.find(({ toIndex }) => toIndex === index);
          expect(node.igniteAtMs).toBe(arrival?.endMs ?? null);
        });
      });
    },
  );

  it('draws the full figure in 0.9 to 1.1 times 900ms', () => {
    ZODIACS.forEach((zodiac) => {
      SONG_IDS.slice(0, 20).forEach((songId) => {
        const lastEndMs = plan(songId, zodiac, 'complete').edges.at(-1)?.endMs ?? 0;
        expect(lastEndMs).toBeGreaterThanOrEqual(810);
        expect(lastEndMs).toBeLessThanOrEqual(990);
      });
    });
  });

  it.each([
    ['faint', null],
    ['clear', null],
    ['bright', 'shimmer'],
    ['complete', 'pulse'],
  ] as const)('ends %s with finale %s after the last edge', (tier, kind) => {
    const result = plan('sample', 'leo', tier);
    const lastEndMs = result.edges.at(-1)?.endMs;
    expect(result.finale).toEqual(kind === null ? null : { kind, atMs: lastEndMs });
  });
});

describe('getConstellationLines', () => {
  function node(xPx: number, yPx: number): ConstellationPlan['nodes'][number] {
    return { xPx, yPx, isAccent: false, igniteAtMs: null };
  }

  const singleEdge: ConstellationPlan = {
    tier: 'complete',
    nodes: [node(0, 0), node(100, 200)],
    edges: [{ fromIndex: 0, toIndex: 1, startMs: 100, endMs: 300 }],
    finale: null,
  };

  it.each([50, 99, 100])('returns no line before or at the edge start (%i ms)', (elapsedMs) => {
    expect(getConstellationLines(singleEdge, elapsedMs)).toEqual([]);
  });

  it('starts drawing one millisecond after the edge start', () => {
    expect(getConstellationLines(singleEdge, 101)).toEqual([
      { fromXPx: 0, fromYPx: 0, toXPx: 0.5, toYPx: 1 },
    ]);
  });

  it('interpolates the end point by the edge progress', () => {
    expect(getConstellationLines(singleEdge, 200)).toEqual([
      { fromXPx: 0, fromYPx: 0, toXPx: 50, toYPx: 100 },
    ]);
  });

  it('stops short of the target node one millisecond before the edge end', () => {
    expect(getConstellationLines(singleEdge, 299)).toEqual([
      { fromXPx: 0, fromYPx: 0, toXPx: 99.5, toYPx: 199 },
    ]);
  });

  it.each([300, 301, 500])(
    'reaches the target node at or after the edge end (%i ms)',
    (elapsedMs) => {
      expect(getConstellationLines(singleEdge, elapsedMs)).toEqual([
        { fromXPx: 0, fromYPx: 0, toXPx: 100, toYPx: 200 },
      ]);
    },
  );

  it('keeps edge order and drops only edges that have not started', () => {
    const multi: ConstellationPlan = {
      tier: 'complete',
      nodes: [node(0, 0), node(100, 0), node(100, 100), node(0, 100)],
      edges: [
        { fromIndex: 2, toIndex: 3, startMs: 0, endMs: 100 },
        { fromIndex: 0, toIndex: 1, startMs: 100, endMs: 200 },
        { fromIndex: 1, toIndex: 2, startMs: 200, endMs: 300 },
      ],
      finale: null,
    };
    expect(getConstellationLines(multi, 150)).toEqual([
      { fromXPx: 100, fromYPx: 100, toXPx: 0, toYPx: 100 },
      { fromXPx: 0, fromYPx: 0, toXPx: 50, toYPx: 0 },
    ]);
  });

  it('throws when an edge points at a missing node', () => {
    const broken: ConstellationPlan = {
      ...singleEdge,
      edges: [{ fromIndex: 0, toIndex: 5, startMs: 0, endMs: 100 }],
    };
    expect(() => getConstellationLines(broken, 50)).toThrow('Invalid constellation edge: 0-5');
  });
});
