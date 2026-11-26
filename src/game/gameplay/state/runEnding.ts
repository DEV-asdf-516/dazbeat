import type { RankingSession } from '../../../data/playSession.js';
import { isFullCombo } from '../../../rhythm/score.js';
import type {
  FinishedGameplayResult,
  GameplayProgress,
  GameplayResult,
} from '../../../rhythm/types.js';

export type RunMode =
  { readonly kind: 'standard'; readonly ranking: RankingSession } | { readonly kind: 'practice' };

export type RecordUpload =
  | { readonly kind: 'local'; readonly chartRevision: string } // 비로그인 완주: 이 브라우저에만 남는다
  | { readonly kind: 'issueFailed'; readonly chartRevision: string } // 세션 발급 실패: 온라인 미등록
  | { readonly kind: 'submit'; readonly sessionId: string };

export type RunRecord =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'save';
      readonly result: FinishedGameplayResult;
      readonly upload: RecordUpload;
    };

// 비로그인 완주는 이 브라우저 저장이 기록의 전부라, 저장에 실패하면 남긴 기록이 없다.
export type SavedUpload = RecordUpload | { readonly kind: 'none' };

export function getUnsavedUpload(upload: RecordUpload): SavedUpload {
  return upload.kind === 'local' ? { kind: 'none' } : upload;
}

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
      upload: getRecordUpload(mode.ranking),
    };
  }
  return { kind: 'none' };
}

function getRecordUpload(ranking: RankingSession): RecordUpload {
  switch (ranking.kind) {
    case 'signedOut':
      return {
        kind: 'local',
        chartRevision: ranking.chartRevision,
      };
    case 'issueFailed':
      return {
        kind: 'issueFailed',
        chartRevision: ranking.chartRevision,
      };
    case 'issued':
      return {
        kind: 'submit',
        sessionId: ranking.sessionId,
      };
  }
}
