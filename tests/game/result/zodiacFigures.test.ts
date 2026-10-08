import { describe, expect, it } from 'vitest';
import { ZODIACS } from '../../../src/data/songs.js';
import { ZODIAC_FIGURES } from '../../../src/game/result/zodiacFigures.js';

describe('ZODIAC_FIGURES', () => {
  it('has exactly one figure for each zodiac', () => {
    expect(Object.keys(ZODIAC_FIGURES).sort()).toEqual([...ZODIACS].sort());
  });

  describe.each(ZODIACS)('%s', (zodiac) => {
    const { nodes, edges, accentNodeIndices } = ZODIAC_FIGURES[zodiac];
    const isNodeIndex = (index: number): boolean =>
      Number.isInteger(index) && index >= 0 && index < nodes.length;

    it('has 4 to 15 nodes with normalized coordinates', () => {
      expect(nodes.length).toBeGreaterThanOrEqual(4);
      expect(nodes.length).toBeLessThanOrEqual(15);
      nodes.forEach(([x, y]) => {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      });
    });

    it('has edges inside the node range without self loops or duplicates', () => {
      const keys = edges.map(([from, to]) => {
        expect(isNodeIndex(from)).toBe(true);
        expect(isNodeIndex(to)).toBe(true);
        expect(from).not.toBe(to);
        return [from, to].sort((a, b) => a - b).join('-');
      });
      expect(new Set(keys).size).toBe(edges.length);
    });

    it('puts every node on at least one edge', () => {
      const covered = new Set(edges.flat());
      nodes.forEach((_node, index) => expect(covered.has(index)).toBe(true));
    });

    it('orders edges so that each one continues from an earlier node', () => {
      const seen = new Set<number>();
      edges.forEach(([from, to], index) => {
        if (index > 0) {
          expect(seen.has(from) || seen.has(to)).toBe(true);
        }
        seen.add(from).add(to);
      });
    });

    it('has 1 to 3 distinct accent candidates inside the node range', () => {
      expect(accentNodeIndices.length).toBeGreaterThanOrEqual(1);
      expect(accentNodeIndices.length).toBeLessThanOrEqual(3);
      expect(new Set(accentNodeIndices).size).toBe(accentNodeIndices.length);
      accentNodeIndices.forEach((index) => expect(isNodeIndex(index)).toBe(true));
    });
  });
});
