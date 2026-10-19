import { describe, expect, it } from 'vitest';
import { WorldActivation } from '../../../src/game/gameplay/worldActivation.js';

const STEP_MS = 100;

function getFirstFullCombo(totalJudgments: number): number {
  const activation = new WorldActivation(totalJudgments, 0);
  for (let combo = 0; combo <= 1000; combo += 1) {
    if (activation.advance(combo, combo * STEP_MS).reachedFull) {
      return combo;
    }
  }
  throw new Error(`Full activation was not reached for ${totalJudgments} judgments`);
}

function settle(activation: WorldActivation, combo: number, startTimeMs: number): number {
  let level = 0;
  for (let step = 1; step <= 25; step += 1) {
    level = activation.advance(combo, startTimeMs + step * STEP_MS).level;
  }
  return level;
}

describe('full activation combo', () => {
  it('uses 40% of the judgment count', () => {
    expect(getFirstFullCombo(51)).toBe(20);
    expect(getFirstFullCombo(94)).toBe(38);
    expect(getFirstFullCombo(146)).toBe(58);
    expect(getFirstFullCombo(242)).toBe(97);
  });

  it('clamps to the lower bound', () => {
    expect(getFirstFullCombo(5)).toBe(10);
  });

  it('clamps to the upper bound', () => {
    expect(getFirstFullCombo(1000)).toBe(100);
  });

  it('rounds to the nearest combo', () => {
    expect(getFirstFullCombo(26)).toBe(10);
    expect(getFirstFullCombo(30)).toBe(12);
    expect(getFirstFullCombo(31)).toBe(12);
  });
});

describe('activation level', () => {
  // 판정 51개 → full activation combo 20.
  const TOTAL_JUDGMENTS = 51;

  it('settles on a target that grows linearly with combo without overshooting', () => {
    expect(settle(new WorldActivation(TOTAL_JUDGMENTS, 0), 0, 0)).toBe(0);
    expect(settle(new WorldActivation(TOTAL_JUDGMENTS, 0), 10, 0)).toBe(0.5);
    expect(settle(new WorldActivation(TOTAL_JUDGMENTS, 0), 20, 0)).toBe(1);
  });

  it('stays at 1 past full activation', () => {
    expect(settle(new WorldActivation(TOTAL_JUDGMENTS, 0), 35, 0)).toBe(1);
  });

  it('falls at the fall rate', () => {
    const activation = new WorldActivation(TOTAL_JUDGMENTS, 0);
    settle(activation, 20, 0);
    expect(activation.advance(0, 2600).level).toBeCloseTo(0.98);
  });

  it('does not move for negative elapsed time', () => {
    const activation = new WorldActivation(TOTAL_JUDGMENTS, 1000);
    const { level } = activation.advance(10, 1100);
    expect(activation.advance(20, 1050).level).toBe(level);
    expect(activation.advance(0, 1000).level).toBe(level);
  });

  it('limits a long gap to the maximum step', () => {
    const activation = new WorldActivation(TOTAL_JUDGMENTS, 0);
    expect(activation.advance(20, 5000).level).toBeCloseTo(0.05);
  });

  it('reports full activation when combo crosses it', () => {
    const exact = new WorldActivation(TOTAL_JUDGMENTS, 0);
    exact.advance(19, 16);
    expect(exact.advance(20, 32).reachedFull).toBe(true);

    const past = new WorldActivation(TOTAL_JUDGMENTS, 0);
    past.advance(19, 16);
    expect(past.advance(25, 32).reachedFull).toBe(true);
  });
});

describe('WorldActivation', () => {
  // 판정 25개 → full activation combo 는 최소값 10.
  const TOTAL_JUDGMENTS = 25;

  it('rises toward the combo target by elapsed song time', () => {
    const activation = new WorldActivation(TOTAL_JUDGMENTS, 1000);
    expect(activation.advance(10, 1100).level).toBeCloseTo(0.05);
    expect(activation.advance(10, 1200).level).toBeCloseTo(0.1);
  });

  it('does not move when song time does not advance', () => {
    const activation = new WorldActivation(TOTAL_JUDGMENTS, 1000);
    expect(activation.advance(10, 1000).level).toBe(0);
  });

  it('reports full activation only on the frame the combo crosses it', () => {
    const activation = new WorldActivation(TOTAL_JUDGMENTS, 0);
    expect(activation.advance(9, 16).reachedFull).toBe(false);
    expect(activation.advance(10, 32).reachedFull).toBe(true);
    expect(activation.advance(11, 48).reachedFull).toBe(false);
  });

  it('reports full activation again after the combo breaks and recovers', () => {
    const activation = new WorldActivation(TOTAL_JUDGMENTS, 0);
    activation.advance(10, 16);
    activation.advance(0, 32);
    expect(activation.advance(10, 48).reachedFull).toBe(true);
  });
});
