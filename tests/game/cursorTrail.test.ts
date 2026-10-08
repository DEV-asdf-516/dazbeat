import { describe, expect, it } from 'vitest';
import {
  MAX_TRAIL_PUFFS,
  SCATTER_PX,
  advanceTrail,
  emitTrail,
  getPuffLook,
} from '../../src/game/cursorTrail.js';
import type { TrailPuff } from '../../src/game/cursorTrail.js';

const half = (): number => 0.5;
const origin = { xPx: 0, yPx: 0 };

function firstPuff(): TrailPuff {
  const [puff] = emitTrail([], origin, { xPx: 14, yPx: 0 }, half);
  if (puff === undefined) {
    throw new Error('expected one puff');
  }
  return puff;
}

describe('emitTrail', () => {
  it('returns the same array when the pointer moved less than one spacing', () => {
    const puffs: readonly TrailPuff[] = [];
    expect(emitTrail(puffs, origin, { xPx: 13, yPx: 0 }, half)).toBe(puffs);
  });

  it('adds one puff per 14px of movement, scattered around its spot on the path', () => {
    const puffs = emitTrail([], origin, { xPx: 42, yPx: 0 }, half);
    expect(puffs).toHaveLength(3);
    puffs.forEach((puff, index) => {
      const spotXPx = 14 * (index + 1);
      expect(Math.hypot(puff.xPx - spotXPx, puff.yPx)).toBeLessThanOrEqual(SCATTER_PX);
      expect(puff.ageMs).toBe(0);
    });
  });

  it('scatters off the path rather than on it', () => {
    const [puff] = emitTrail([], origin, { xPx: 14, yPx: 0 }, half);
    expect(puff?.xPx).not.toBe(14);
  });

  it('caps the puffs added by one fast move', () => {
    expect(emitTrail([], origin, { xPx: 1000, yPx: 0 }, half)).toHaveLength(6);
  });

  it('drifts away from the direction of motion', () => {
    const [rightward] = emitTrail([], origin, { xPx: 14, yPx: 0 }, half);
    const [downward] = emitTrail([], origin, { xPx: 0, yPx: 14 }, half);
    expect(rightward?.driftXPxPerMs).toBeLessThan(0);
    expect(downward?.driftYPxPerMs).toBeLessThan(0);
  });

  it('keeps only the newest puffs when the trail is full', () => {
    let puffs: readonly TrailPuff[] = [];
    for (let i = 0; i < 30; i++) {
      puffs = emitTrail(puffs, { xPx: i * 84, yPx: 0 }, { xPx: (i + 1) * 84, yPx: 0 }, half);
    }
    expect(puffs).toHaveLength(MAX_TRAIL_PUFFS);
    const newest = puffs.at(-1);
    expect(Math.abs((newest?.xPx ?? 0) - 30 * 84)).toBeLessThanOrEqual(SCATTER_PX);
  });
});

describe('advanceTrail', () => {
  const puff = firstPuff();

  it('drops a puff exactly at the end of its life and keeps it 1ms before', () => {
    expect(advanceTrail([puff], puff.lifeMs - 1)).toHaveLength(1);
    expect(advanceTrail([puff], puff.lifeMs)).toHaveLength(0);
  });

  it('slows the drift down as time passes', () => {
    const [later] = advanceTrail([puff], 500);
    expect(Math.abs(later?.driftXPxPerMs ?? 0)).toBeLessThan(Math.abs(puff.driftXPxPerMs));
  });

  it('does not change the input puffs', () => {
    const input = [puff];
    advanceTrail(input, 100);
    expect(input[0]).toBe(puff);
    expect(puff.ageMs).toBe(0);
  });
});

describe('getPuffLook', () => {
  const puff = firstPuff();

  it('fades in from nothing at birth and is invisible at the end of its life', () => {
    expect(getPuffLook(puff).alpha).toBe(0);
    expect(getPuffLook({ ...puff, ageMs: puff.lifeMs * 0.2 }).alpha).toBeGreaterThan(0);
    expect(getPuffLook({ ...puff, ageMs: puff.lifeMs }).alpha).toBe(0);
  });

  it('stays faint even at its brightest', () => {
    expect(getPuffLook({ ...puff, ageMs: puff.lifeMs * 0.2 }).alpha).toBeLessThan(0.1);
  });

  it('spreads wider as it fades', () => {
    const old = getPuffLook({ ...puff, ageMs: puff.lifeMs / 2 });
    expect(old.radiusPx).toBeGreaterThan(getPuffLook(puff).radiusPx);
  });
});
