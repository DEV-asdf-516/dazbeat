import { msToSec, secToMs } from '../time.js';

export function getNoteY(
  noteTimeMs: number,
  songTimeMs: number,
  judgeLineYPx: number,
  scrollSpeedPxPerSecond: number,
): number {
  return judgeLineYPx - msToSec(noteTimeMs - songTimeMs) * scrollSpeedPxPerSecond;
}

export function getNoteTimeAtY(
  yPx: number,
  songTimeMs: number,
  judgeLineYPx: number,
  scrollSpeedPxPerSecond: number,
): number {
  return songTimeMs + secToMs((judgeLineYPx - yPx) / scrollSpeedPxPerSecond);
}
