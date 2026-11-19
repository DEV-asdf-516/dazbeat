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
