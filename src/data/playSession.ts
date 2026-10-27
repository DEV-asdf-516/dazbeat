import type { Chart } from '../rhythm/types.js';
import type { AchievementId } from './achievements.js';

/** 비로그인·발급 실패면 rankedSessionId 가 null 이고 랭킹 없이 플레이한다. */
export interface PreparedChart {
  chart: Chart;
  rankedSessionId: string | null;
}

export interface VerifiedPlay {
  score: number;
  accuracy: number;
  maxCombo: number;
  cleared: boolean;
  bestScore: number;
  newAchievements: readonly AchievementId[];
}
