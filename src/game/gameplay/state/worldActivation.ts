import { clamp, getProgress } from '../../../range.js';
import { getEffectStepMs } from '../../../time.js';

export const ACTIVATION_RISE_PER_MS = 0.0005;
export const ACTIVATION_FALL_PER_MS = 0.0002;

const FULL_ACTIVATION_RATIO = 0.4;
const MIN_FULL_ACTIVATION_COMBO = 10;
const MAX_FULL_ACTIVATION_COMBO = 100;

export class WorldActivation {
  private readonly fullActivationCombo: number;
  private level = 0;
  private combo = 0;
  private timeMs: number;

  constructor(totalJudgments: number, startTimeMs: number) {
    this.fullActivationCombo = clamp(
      Math.round(totalJudgments * FULL_ACTIVATION_RATIO),
      MIN_FULL_ACTIVATION_COMBO,
      MAX_FULL_ACTIVATION_COMBO,
    );
    this.timeMs = startTimeMs;
  }

  advance(combo: number, songTimeMs: number): { level: number; hasReachedFull: boolean } {
    const target = getProgress(combo, 0, this.fullActivationCombo);
    const stepMs = getEffectStepMs(this.timeMs, songTimeMs);
    this.level =
      target > this.level
        ? Math.min(target, this.level + ACTIVATION_RISE_PER_MS * stepMs)
        : Math.max(target, this.level - ACTIVATION_FALL_PER_MS * stepMs);
    const hasReachedFull =
      this.combo < this.fullActivationCombo && combo >= this.fullActivationCombo;
    this.timeMs = songTimeMs;
    this.combo = combo;
    return {
      level: this.level,
      hasReachedFull,
    };
  }
}
