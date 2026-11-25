import type { Chart } from '../rhythm/types.js';
import type { NamedAchievementDefinition } from './achievements.js';
import type { PlayReview } from './ranking.js';

/** 비로그인·발급 실패면 랭킹 없이 플레이한다. 발급 실패는 결과 화면이 알린다. */
export type RankingSession =
  // 기록이 서버에 남지 않는 판은 순위표 플레이어 수에만 더하도록 채보 revision 을 들고 간다.
  | { readonly kind: 'signedOut'; readonly chartRevision: string }
  | { readonly kind: 'issued'; readonly sessionId: string }
  | { readonly kind: 'issueFailed'; readonly chartRevision: string };

export interface PreparedChart {
  chart: Chart;
  ranking: RankingSession;
}

export interface VerifiedPlay {
  score: number;
  accuracy: number;
  maxCombo: number;
  newAchievements: readonly NamedAchievementDefinition[];
  review: PlayReview;
}

/** rejected 는 서버가 응답으로 거절한 경우, unknown 은 응답을 받지 못해 저장됐는지 모르는 경우다. */
export type RankingSubmission =
  | { readonly kind: 'saved'; readonly play: VerifiedPlay }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'unknown' };
