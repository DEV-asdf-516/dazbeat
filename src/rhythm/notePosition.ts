export function getNoteY(
  noteTimeMs: number,
  songTimeMs: number,
  judgeLineYPx: number,
  scrollSpeedPxPerSecond: number,
): number {
  return judgeLineYPx - ((noteTimeMs - songTimeMs) / 1000) * scrollSpeedPxPerSecond;
}
