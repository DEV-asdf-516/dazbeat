import type { Judgment, JudgmentCounts } from './types.js';

// 부동소수 가중치를 더하면 경계에 딱 맞는 판정 수가 경계보다 작게 나와 등급이 내려가므로 정수 점수 합을 한 번만 나눈다.
export const ACCURACY_POINTS: Record<Judgment, number> = {
  perfect: 100,
  great: 80,
  good: 30,
  bad: 10,
  miss: 0,
};

export function calculateAccuracy(counts: JudgmentCounts): number {
  const total = counts.perfect + counts.great + counts.good + counts.bad + counts.miss;
  if (total === 0) {
    return 0;
  }
  const points =
    counts.perfect * ACCURACY_POINTS.perfect +
    counts.great * ACCURACY_POINTS.great +
    counts.good * ACCURACY_POINTS.good +
    counts.bad * ACCURACY_POINTS.bad +
    counts.miss * ACCURACY_POINTS.miss;
  return points / (total * ACCURACY_POINTS.perfect);
}
