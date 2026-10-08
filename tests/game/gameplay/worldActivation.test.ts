import { describe, expect, it } from 'vitest';
import {
  WorldActivation,
  getActivationTarget,
  getFullActivationCombo,
  reachedFullActivation,
  stepActivation,
} from '../../../src/game/gameplay/worldActivation.js';

describe('getFullActivationCombo', () => {
  it('uses 40% of the judgment count', () => {
    expect(getFullActivationCombo(51)).toBe(20);
    expect(getFullActivationCombo(94)).toBe(38);
    expect(getFullActivationCombo(146)).toBe(58);
    expect(getFullActivationCombo(242)).toBe(97);
  });

  it('clamps to the lower bound', () => {
    expect(getFullActivationCombo(5)).toBe(10);
  });

  it('clamps to the upper bound', () => {
    expect(getFullActivationCombo(1000)).toBe(100);
  });

  it('rounds to the nearest combo', () => {
    expect(getFullActivationCombo(26)).toBe(10);
    expect(getFullActivationCombo(30)).toBe(12);
    expect(getFullActivationCombo(31)).toBe(12);
  });
});

describe('getActivationTarget', () => {
  it('grows linearly with combo up to full activation', () => {
    expect(getActivationTarget(0, 20)).toBe(0);
    expect(getActivationTarget(10, 20)).toBe(0.5);
    expect(getActivationTarget(20, 20)).toBe(1);
  });

  it('stays at 1 past full activation', () => {
    expect(getActivationTarget(35, 20)).toBe(1);
  });
});

describe('stepActivation', () => {
  it('rises at the rise rate', () => {
    expect(stepActivation(0, 1, 100)).toBeCloseTo(0.05);
  });

  it('falls at the fall rate', () => {
    expect(stepActivation(1, 0, 100)).toBeCloseTo(0.98);
  });

  it('does not overshoot the target', () => {
    expect(stepActivation(0.99, 1, 100)).toBe(1);
  });

  it('does not move without elapsed time', () => {
    expect(stepActivation(0.3, 1, 0)).toBe(0.3);
  });

  it('does not move for negative elapsed time', () => {
    expect(stepActivation(0.3, 1, -50)).toBe(0.3);
    expect(stepActivation(0.3, 0, -50)).toBe(0.3);
  });

  it('limits a long gap to the maximum step', () => {
    expect(stepActivation(0, 1, 5000)).toBeCloseTo(0.05);
  });
});

describe('reachedFullActivation', () => {
  it('fires when combo crosses full activation', () => {
    expect(reachedFullActivation(19, 20, 20)).toBe(true);
    expect(reachedFullActivation(19, 25, 20)).toBe(true);
  });

  it('does not fire once already past full activation', () => {
    expect(reachedFullActivation(20, 21, 20)).toBe(false);
  });

  it('does not fire below full activation', () => {
    expect(reachedFullActivation(0, 5, 20)).toBe(false);
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
