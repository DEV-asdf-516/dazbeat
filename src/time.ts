const MS_PER_SECOND = 1000;

export function msToSec(ms: number): number {
  return ms / MS_PER_SECOND;
}

export function secToMs(sec: number): number {
  return sec * MS_PER_SECOND;
}

export function isWithin(fromMs: number, toMs: number, limitMs: number): boolean {
  return toMs - fromMs <= limitMs;
}

export function hasElapsed(fromMs: number, toMs: number, durationMs: number): boolean {
  return toMs - fromMs >= durationMs;
}

// 한 번에 이보다 길게 비면 멈췄다 온 것이라 연출을 몰아 진행하지 않는다.
const MAX_EFFECT_GAP_MS = 250;
const RESUMED_EFFECT_STEP_MS = 100;

export function getEffectStepMs(fromMs: number, toMs: number): number {
  if (!isWithin(fromMs, toMs, MAX_EFFECT_GAP_MS)) {
    return RESUMED_EFFECT_STEP_MS;
  }
  return Math.max(0, toMs - fromMs);
}
