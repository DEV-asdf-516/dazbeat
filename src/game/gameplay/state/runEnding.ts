import { isFullCombo } from '../../rhythm/score.js';
import type { GameplayProgress, GameplayResult } from '../../rhythm/types.js';

export type RunEnding =
  | { readonly kind: 'continue' }
  | { readonly kind: 'fullCombo'; readonly result: GameplayResult }
  | { readonly kind: 'result'; readonly result: GameplayResult };

export function getRunEnding(
  playbackMs: number,
  gameEndMs: number,
  progress: GameplayProgress,
): RunEnding {
  if (playbackMs < gameEndMs || progress.outcome === 'playing') {
    return { kind: 'continue' };
  }
  return {
    kind: isFullCombo(progress.counts) ? 'fullCombo' : 'result',
    result: progress,
  };
}
