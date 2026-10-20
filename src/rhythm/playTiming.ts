export const LEAD_IN_MS = 2000;

export const INPUT_OFFSET_RANGE_MS = {
  min: -300,
  max: 300,
} as const;

export function getPlaybackStartMs(gameStartMs: number): number {
  return gameStartMs - LEAD_IN_MS;
}

export function getPlayDurationMs(gameStartMs: number, gameEndMs: number): number {
  return gameEndMs - getPlaybackStartMs(gameStartMs);
}

export function getGameFraction(gameStartMs: number, gameEndMs: number, timeMs: number): number {
  return (timeMs - gameStartMs) / (gameEndMs - gameStartMs);
}
