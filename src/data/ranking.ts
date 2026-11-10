import type { Difficulty, LaneCount } from '../rhythm/types.js';
import type { Zodiac } from './songs.js';

export const TOP_RANK_LIMIT = 20;
// 순위는 앞선 기록을 세서 구하므로 세는 수에 상한을 둔다. 깊은 순위까지 세면 한 페이지가 읽는 인덱스가
// PocketBase 페이지 캐시(32MB)를 넘어 요청마다 캐시 밖에서 다시 읽느라 수십 배 느려진다.
export const MY_RANK_LIMIT = 100;

export interface PlayRanking {
  readonly rank: number;
  readonly isNewBest: boolean;
}

export type PlayReview =
  | { readonly kind: 'approved'; readonly ranking: PlayRanking | null }
  | { readonly kind: 'pending' };

export interface LeaderboardEntry {
  readonly rank: number;
  readonly nickname: string;
  readonly featuredAchievement: string | null;
  readonly score: number;
  readonly accuracy: number;
  readonly isMe: boolean;
}

export interface Leaderboard {
  readonly chartId: string;
  readonly chartRevision: string;
  readonly totalPlayers: number;
  readonly top: readonly LeaderboardEntry[];
  readonly me: Omit<LeaderboardEntry, 'isMe'> | null;
  readonly hasPreviousRevisionRecord: boolean;
}

export interface RankedChart {
  readonly chartId: string;
  readonly songId: string;
  readonly songTitle: string;
  readonly constellation: Zodiac;
  readonly laneCount: LaneCount;
  readonly difficulty: Difficulty;
  readonly rank: number;
  readonly score: number;
  readonly achievedAtMs: number;
}

export const RANKED_CHART_SORTS = ['score', 'achieved'] as const;

export type RankedChartSort = (typeof RANKED_CHART_SORTS)[number];

export const DEFAULT_RANKED_CHART_SORT: RankedChartSort = 'score';

export interface RankedChartCursor {
  readonly value: number;
  readonly chartId: string;
}

export interface RankedChartQuery {
  readonly sort: RankedChartSort;
  readonly laneCount: LaneCount | null;
  readonly difficulty: Difficulty | null;
  readonly cursor: RankedChartCursor | null;
}

export interface RankedChartPage {
  readonly items: readonly RankedChart[];
  readonly next: RankedChartCursor | null;
}

export interface ChartTopRank {
  readonly chartId: string;
  readonly rank: number;
}

export interface MyChartRecord {
  readonly songId: string;
  readonly laneCount: LaneCount;
  readonly difficulty: Difficulty;
  readonly score: number;
  readonly accuracy: number;
  readonly maxCombo: number;
  readonly cleared: boolean;
}

export type RankingRequestErrorKind = 'notFound' | 'unauthorized' | 'failed';

export class RankingRequestError extends Error {
  override readonly name = 'RankingRequestError';
  readonly kind: RankingRequestErrorKind;

  constructor(kind: RankingRequestErrorKind, cause: unknown) {
    super(`Ranking request failed: ${kind}`, { cause });
    this.kind = kind;
  }
}
