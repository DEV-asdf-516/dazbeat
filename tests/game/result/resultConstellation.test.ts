import { describe, expect, it } from 'vitest';
import { ZODIACS } from '../../../src/data/songs.js';
import type { Zodiac } from '../../../src/data/songs.js';
import {
  CONSTELLATION_LOOKS,
  getConstellationLines,
  getConstellationTier,
  planSongConstellation,
} from '../../../src/game/result/resultConstellation.js';
import type {
  ConstellationBox,
  ConstellationFigurePoint,
  ConstellationPlan,
  ConstellationTier,
} from '../../../src/game/result/resultConstellation.js';
import { ZODIAC_FIGURES } from '../../../src/game/result/zodiacFigures.js';
import type { JudgmentCounts } from '../../../src/rhythm/types.js';

const BOX: ConstellationBox = {
  leftPx: 740,
  topPx: 210,
  widthPx: 500,
  heightPx: 480,
};
const TIERS: readonly ConstellationTier[] = ['faint', 'clear', 'bright', 'complete'];
const SONG_IDS = Array.from({ length: 200 }, (_value, index) => `song-${index}`);

function counts(miss: number, bad = 0): JudgmentCounts {
  return {
    perfect: 10,
    great: 0,
    good: 0,
    bad,
    miss,
  };
}

function edgeKey(a: number, b: number): string {
  return [a, b].sort((x, y) => x - y).join('-');
}

function plan(songId: string, zodiac: Zodiac, tier: ConstellationTier): ConstellationPlan {
  return planSongConstellation(songId, zodiac, tier, BOX);
}

function allNodes(result: ConstellationPlan): ConstellationFigurePoint[] {
  return [result.accent, ...result.others].sort((a, b) => a.index - b.index);
}

describe('getConstellationTier', () => {
  it('is faint for a failed result even with rank S accuracy', () => {
    expect(
      getConstellationTier({
        outcome: 'failed',
        accuracy: 0.952,
        counts: {
          perfect: 200,
          great: 0,
          good: 0,
          bad: 0,
          miss: 10,
        },
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
      expect(allNodes(result).map(({ index }) => index)).toEqual(
        figure.nodes.map((_node, index) => index),
      );
    });
  });

  it.each(ZODIACS)('lights exactly the accent and connected edge ends for %s', (zodiac) => {
    TIERS.forEach((tier) => {
      const result = plan('s1', zodiac, tier);
      const lit = new Set([result.accent.index]);
      result.edges.forEach(({ fromIndex, toIndex }) => lit.add(fromIndex).add(toIndex));
      result.others.forEach((node) => {
        expect(node.kind === 'lit').toBe(lit.has(node.index));
      });
    });
  });

  it('returns the same plan for the same song id', () => {
    expect(plan('sample', 'gemini', 'clear')).toEqual(plan('sample', 'gemini', 'clear'));
  });

  it.each(ZODIACS)('varies layout but keeps topology between song ids for %s', (zodiac) => {
    const a = plan('song-a', zodiac, 'complete');
    const b = plan('song-b', zodiac, 'complete');
    expect(allNodes(a).map(({ xPx, yPx }) => [xPx, yPx])).not.toEqual(
      allNodes(b).map(({ xPx, yPx }) => [xPx, yPx]),
    );
    const pairs = (result: ConstellationPlan): string[] =>
      result.edges.map(({ fromIndex, toIndex }) => edgeKey(fromIndex, toIndex)).sort();
    expect(pairs(a)).toEqual(pairs(b));
  });

  it('places every node inside the box', () => {
    ZODIACS.forEach((zodiac) => {
      SONG_IDS.slice(0, 50).forEach((songId) => {
        allNodes(plan(songId, zodiac, 'faint')).forEach(({ xPx, yPx }) => {
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
      const accent = result.accent.index;
      accentsSeen.add(accent);
      const lit = new Set([accent]);
      expect(result.edges[0]?.fromIndex).toBe(accent);
      const nodes = allNodes(result);
      result.edges.forEach(({ fromIndex, toIndex, from, to }) => {
        expect(lit.has(fromIndex)).toBe(true);
        lit.add(toIndex);
        expect(from).toEqual({
          xPx: nodes[fromIndex]?.xPx,
          yPx: nodes[fromIndex]?.yPx,
        });
        expect(to).toEqual({
          xPx: nodes[toIndex]?.xPx,
          yPx: nodes[toIndex]?.yPx,
        });
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
        result.others.forEach((node) => {
          const arrival = result.edges.find(({ toIndex }) => toIndex === node.index);
          expect(node.kind === 'lit' ? node.igniteAtMs : null).toBe(arrival?.endMs ?? null);
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

  it.each(TIERS)('ends the %s drawing at the last edge end', (tier) => {
    const result = plan('sample', 'leo', tier);
    expect(result.drawEndMs).toBe(result.edges.at(-1)?.endMs);
  });
});

describe('CONSTELLATION_LOOKS', () => {
  it.each([
    ['faint', null],
    ['clear', null],
    ['bright', 'shimmer'],
    ['complete', 'pulse'],
  ] as const)('gives %s the finale %s', (tier, finale) => {
    expect(CONSTELLATION_LOOKS[tier].glow?.finale ?? null).toBe(finale);
  });
});

describe('getConstellationLines', () => {
  function edge(
    from: [number, number],
    to: [number, number],
    startMs: number,
    endMs: number,
  ): ConstellationPlan['edges'][number] {
    return {
      fromIndex: 0,
      toIndex: 1,
      from: {
        xPx: from[0],
        yPx: from[1],
      },
      to: {
        xPx: to[0],
        yPx: to[1],
      },
      startMs,
      endMs,
    };
  }

  function linesPlan(edges: ConstellationPlan['edges']): ConstellationPlan {
    return {
      tier: 'complete',
      accent: {
        index: 0,
        xPx: 0,
        yPx: 0,
      },
      others: [],
      edges,
      drawEndMs: edges.at(-1)?.endMs ?? 0,
    };
  }

  const singleEdge = linesPlan([edge([0, 0], [100, 200], 100, 300)]);

  it.each([50, 99, 100])('returns no line before or at the edge start (%i ms)', (elapsedMs) => {
    expect(getConstellationLines(singleEdge, elapsedMs)).toEqual([]);
  });

  it('starts drawing one millisecond after the edge start', () => {
    expect(getConstellationLines(singleEdge, 101)).toEqual([
      {
        fromXPx: 0,
        fromYPx: 0,
        toXPx: 0.5,
        toYPx: 1,
      },
    ]);
  });

  it('interpolates the end point by the edge progress', () => {
    expect(getConstellationLines(singleEdge, 200)).toEqual([
      {
        fromXPx: 0,
        fromYPx: 0,
        toXPx: 50,
        toYPx: 100,
      },
    ]);
  });

  it('stops short of the target node one millisecond before the edge end', () => {
    expect(getConstellationLines(singleEdge, 299)).toEqual([
      {
        fromXPx: 0,
        fromYPx: 0,
        toXPx: 99.5,
        toYPx: 199,
      },
    ]);
  });

  it.each([300, 301, 500])(
    'reaches the target node at or after the edge end (%i ms)',
    (elapsedMs) => {
      expect(getConstellationLines(singleEdge, elapsedMs)).toEqual([
        {
          fromXPx: 0,
          fromYPx: 0,
          toXPx: 100,
          toYPx: 200,
        },
      ]);
    },
  );

  it('keeps edge order and drops only edges that have not started', () => {
    const multi = linesPlan([
      edge([100, 100], [0, 100], 0, 100),
      edge([0, 0], [100, 0], 100, 200),
      edge([100, 0], [100, 100], 200, 300),
    ]);
    expect(getConstellationLines(multi, 150)).toEqual([
      {
        fromXPx: 100,
        fromYPx: 100,
        toXPx: 0,
        toYPx: 100,
      },
      {
        fromXPx: 0,
        fromYPx: 0,
        toXPx: 50,
        toYPx: 0,
      },
    ]);
  });
});
