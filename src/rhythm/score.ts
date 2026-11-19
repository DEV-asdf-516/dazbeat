import type { Judgment, JudgmentCounts } from './types.js';

export const JUDGMENT_SCORES: Record<Judgment, number> = {
  perfect: 1000,
  great: 700,
  good: 300,
  bad: 100,
  miss: 0,
};

// 콤보가 길수록 노트마다 판정 점수에 보너스를 얹는다. 상한을 둬 판정 정확도가 점수 대부분을 정하게 한다.
const COMBO_BONUS_STEP = 50;
const COMBO_BONUS_PERCENT_PER_STEP = 1;
const COMBO_BONUS_MAX_PERCENT = 10;
const PERCENT = 100;

// 클라이언트와 서버가 같은 점수를 내도록 정수 퍼센트로 계산하고 내림한다.
export function getJudgmentScore(judgment: Judgment, combo: number): number {
  const bonusPercent = Math.min(
    Math.floor(combo / COMBO_BONUS_STEP) * COMBO_BONUS_PERCENT_PER_STEP,
    COMBO_BONUS_MAX_PERCENT,
  );
  return Math.floor((JUDGMENT_SCORES[judgment] * (PERCENT + bonusPercent)) / PERCENT);
}

export function getNextCombo(combo: number, judgment: Judgment): number {
  switch (judgment) {
    case 'perfect':
    case 'great':
      return combo + 1;
    case 'good':
      return 1;
    case 'bad':
    case 'miss':
      return 0;
  }
}

export function isFullCombo(counts: JudgmentCounts): boolean {
  return counts.good === 0 && counts.bad === 0 && counts.miss === 0;
}

export function isAllPerfect(counts: JudgmentCounts): boolean {
  return counts.great === 0 && isFullCombo(counts);
}
