import { isFullCombo } from '../../../rhythm/score.js';
import type {
  FinishedGameplayResult,
  GameplayProgress,
  GameplayResult,
} from '../../../rhythm/types.js';

export type RunMode =
  // 비로그인·발급 실패면 그 판은 랭킹 없이 진행한다.
  | { readonly kind: 'standard'; readonly rankedSessionId: string | null }
  | { readonly kind: 'practice' };

export type RunRecord =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'save';
      readonly result: FinishedGameplayResult;
      readonly rankedSessionId: string | null;
    };

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

export function getRunRecord(mode: RunMode, result: GameplayResult): RunRecord {
  if (mode.kind === 'standard' && result.outcome === 'finished') {
    return {
      kind: 'save',
      result,
      rankedSessionId: mode.rankedSessionId,
    };
  }
  return { kind: 'none' };
}
