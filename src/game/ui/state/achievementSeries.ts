import type { AchievementDefinition, AchievementRule } from '../../../data/achievements.js';

// 단계 점은 같은 계열(rule.kind + mark + difficulty) 안에서 target 이 몇 번째인지 보여 준다.
// 플레이, 황도 단계, 별자리 여행은 기호 자체가 단계를 보여 주고, 별자리 완성은 단계가 없다.
// 퇴역 업적도 대표 업적으로 남아 그려지므로, 퇴역 정의까지 세야 점 수가 바뀌지 않는다.
export function getStageDotCount(
  { rule }: AchievementDefinition,
  definitions: readonly AchievementDefinition[],
): number {
  switch (rule.kind) {
    case 'songs':
    case 'charts':
    case 'songMarks': {
      const series = getSeries(rule);
      return definitions.filter(
        ({ rule: other }) =>
          (other.kind === 'songs' || other.kind === 'charts' || other.kind === 'songMarks') &&
          getSeries(other) === series &&
          other.target <= rule.target,
      ).length;
    }
    case 'plays':
    case 'zodiacVisits':
    case 'zodiacComplete':
    case 'zodiacCompletions':
    case 'album':
      return 0;
  }
}

// 플레이 궤적, 황도 단계, 별자리 여행 기호는 같은 계열에서 target 이 더 작은 정의 수로 그림을 고른다.
// 대시보드에서 목표값을 끼워 넣으면 뒤 단계의 그림이 한 칸씩 밀리는 것을 받아들였다(사용자 결정).
export function getSeriesOrdinal(
  rule: Extract<AchievementRule, { target: number }>,
  definitions: readonly AchievementDefinition[],
): number {
  const series = getSeries(rule);
  return definitions.filter(
    ({ rule: other }) =>
      'target' in other && getSeries(other) === series && other.target < rule.target,
  ).length;
}

function getSeries(rule: AchievementRule): string {
  const mark = 'mark' in rule ? rule.mark : '';
  const difficulty = rule.kind === 'charts' ? (rule.difficulty ?? '') : '';
  return `${rule.kind}:${mark}:${difficulty}`;
}
