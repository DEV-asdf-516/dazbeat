import { MY_RANK_LIMIT, TOP_RANK_LIMIT } from '../../../data/ranking.js';

export type TopRankTier = 'gold' | 'silver' | 'bronze' | 'plain';

const MEDAL_TIERS: Readonly<Record<number, TopRankTier>> = {
  1: 'gold',
  2: 'silver',
  3: 'bronze',
};

export function getTopRankTier(rank: number): TopRankTier | 'none' {
  if (rank < 1 || rank > TOP_RANK_LIMIT) {
    return 'none';
  }
  return MEDAL_TIERS[rank] ?? 'plain';
}

/** 상한을 넘으면 정확한 순위를 세지 않으므로 + 를 붙인다. */
export function getRankValue(rank: number): string {
  return rank > MY_RANK_LIMIT ? `${MY_RANK_LIMIT}+` : `${rank}`;
}

export function getPlainRankValue(rank: number): string | null {
  if (rank <= TOP_RANK_LIMIT) {
    return null;
  }
  return getRankValue(rank);
}
