import { clamp } from '../range.js';

export const ACTIVATION_RISE_PER_SECOND = 0.5;
export const ACTIVATION_FALL_PER_SECOND = 0.2;
export const ACTIVATION_MAX_STEP_MS = 100;

const FULL_ACTIVATION_RATIO = 0.4;
const MIN_FULL_ACTIVATION_COMBO = 10;
const MAX_FULL_ACTIVATION_COMBO = 100;

export function getFullActivationCombo(totalJudgments: number): number {
  return clamp(
    Math.round(totalJudgments * FULL_ACTIVATION_RATIO),
    MIN_FULL_ACTIVATION_COMBO,
    MAX_FULL_ACTIVATION_COMBO,
  );
}

export function getActivationTarget(combo: number, fullActivationCombo: number): number {
  return Math.min(1, combo / fullActivationCombo);
}

export function stepActivation(level: number, target: number, elapsedMs: number): number {
  const stepMs = clamp(elapsedMs, 0, ACTIVATION_MAX_STEP_MS);
  if (target > level) {
    return Math.min(target, level + (ACTIVATION_RISE_PER_SECOND * stepMs) / 1000);
  }
  return Math.max(target, level - (ACTIVATION_FALL_PER_SECOND * stepMs) / 1000);
}

export function reachedFullActivation(
  previousCombo: number,
  combo: number,
  fullActivationCombo: number,
): boolean {
  return previousCombo < fullActivationCombo && combo >= fullActivationCombo;
}

export class WorldActivation {
  private readonly fullActivationCombo: number;
  private level = 0;
  private combo = 0;
  private timeMs: number;

  constructor(totalJudgments: number, startTimeMs: number) {
    this.fullActivationCombo = getFullActivationCombo(totalJudgments);
    this.timeMs = startTimeMs;
  }

  advance(combo: number, songTimeMs: number): { level: number; reachedFull: boolean } {
    this.level = stepActivation(
      this.level,
      getActivationTarget(combo, this.fullActivationCombo),
      songTimeMs - this.timeMs,
    );
    const reachedFull = reachedFullActivation(this.combo, combo, this.fullActivationCombo);
    this.timeMs = songTimeMs;
    this.combo = combo;
    return { level: this.level, reachedFull };
  }
}
