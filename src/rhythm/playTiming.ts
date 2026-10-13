/** 영상은 첫 판정 구간보다 이만큼 먼저 재생을 시작한다. */
export const LEAD_IN_MS = 2000;

export const INPUT_OFFSET_RANGE_MS = { min: -300, max: 300 } as const;

export function getPlaybackStartMs(gameStartMs: number): number {
  return Math.max(0, gameStartMs - LEAD_IN_MS);
}

export function getPlayDurationMs(gameStartMs: number, gameEndMs: number): number {
  return gameEndMs - getPlaybackStartMs(gameStartMs);
}
