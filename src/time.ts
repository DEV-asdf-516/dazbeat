const MS_PER_SECOND = 1000;

export function msToSec(ms: number): number {
  return ms / MS_PER_SECOND;
}

export function secToMs(sec: number): number {
  return sec * MS_PER_SECOND;
}
