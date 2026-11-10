import type { Chart } from '../rhythm/types.js';
import type { NamedAchievementDefinition } from './achievements.js';
import type { PlayReview } from './ranking.js';

/** 비로그인·발급 실패면 랭킹 없이 플레이한다. 발급 실패는 결과 화면이 알린다. */
export type RankingSession =
  | { readonly kind: 'signedOut' }
  | { readonly kind: 'issued'; readonly sessionId: string }
  | { readonly kind: 'issueFailed' };

export interface PreparedChart {
  chart: Chart;
  ranking: RankingSession;
}

export interface VerifiedPlay {
  score: number;
  accuracy: number;
  maxCombo: number;
  cleared: boolean;
  newAchievements: readonly NamedAchievementDefinition[];
  review: PlayReview;
}

/** rejected 는 서버가 응답으로 거절한 경우, unknown 은 응답을 받지 못해 저장됐는지 모르는 경우다. */
export type RankingSubmission =
  | { readonly kind: 'saved'; readonly play: VerifiedPlay }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'unknown' };
