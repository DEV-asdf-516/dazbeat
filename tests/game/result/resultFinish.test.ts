import { describe, expect, it } from 'vitest';
import type { CelestialSequenceStep } from '../../../src/game/celestial/celestialCatalog.js';
import { planResultFinish } from '../../../src/game/result/resultFinish.js';

const SCORE_SETTLED_AT_MS = 1400;

function step(presentationId: string, startMs: number, durationMs: number): CelestialSequenceStep {
  return {
    presentationId,
    startMs,
    durationMs,
    presentation: {
      kind: 'atlas',
      textureKey: `texture-${presentationId}`,
      animationKey: `animation-${presentationId}`,
      frames: [{ frameName: `${presentationId}-0`, durationMs }],
      isLoop: false,
      scaleXY: [1, 1],
      scaleRange: null,
      originXY: [0.5, 0.5],
      opacity: 1,
    },
  };
}

const STEPS = [
  step('R18', 0, 200),
  step('R39', 180, 996),
  step('R42', 200, 400),
  step('R41', 244, 996),
  step('R40', 840, 400),
];

describe('planResultFinish', () => {
  it('plans nothing when the run is not cleared', () => {
    expect(planResultFinish(false, STEPS, SCORE_SETTLED_AT_MS)).toEqual([]);
  });

  it('plans nothing when not cleared regardless of step contents', () => {
    expect(planResultFinish(false, [], SCORE_SETTLED_AT_MS)).toEqual([]);
    expect(planResultFinish(false, [step('R99', 0, 100)], SCORE_SETTLED_AT_MS)).toEqual([]);
  });

  it('times every step so the score shimmer lands when the score settles', () => {
    const cues = planResultFinish(true, STEPS, SCORE_SETTLED_AT_MS);
    expect(cues.map((cue) => cue.step)).toEqual(STEPS);
    expect(cues.map((cue) => cue.playAtMs)).toEqual([560, 740, 760, 804, 1400]);
    expect(cues.map((cue) => cue.anchor)).toEqual(['node', 'rank', 'node', 'jacket', 'score']);
    expect(cues.map((cue) => cue.isNodeIgnite)).toEqual([true, false, false, false, false]);
  });

  it('throws when the score shimmer step is missing', () => {
    expect(() =>
      planResultFinish(
        true,
        STEPS.filter((s) => s.presentationId !== 'R40'),
        SCORE_SETTLED_AT_MS,
      ),
    ).toThrow('R40');
  });

  it('throws when cleared with no steps', () => {
    expect(() => planResultFinish(true, [], SCORE_SETTLED_AT_MS)).toThrow('R40');
  });

  it('throws on an unknown presentation id', () => {
    expect(() =>
      planResultFinish(true, [...STEPS, step('R99', 300, 100)], SCORE_SETTLED_AT_MS),
    ).toThrow('R99');
  });
});
