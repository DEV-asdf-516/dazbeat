import { MY_RANK_LIMIT, TOP_RANK_LIMIT } from '../../../src/data/ranking.js';
import type {
  ChartTopRank,
  Leaderboard,
  RankedChartPage,
  RankedChartQuery,
} from '../../../src/data/ranking.js';
import { requireDefined } from '../../../src/invariant.js';
import type { DbApp, JsvmRecord, JsvmRuntime } from '../jsvm.js';
import {
  hasOtherRevisionScore,
  readPartitionSize,
  readPublishedChartRevision,
  readScoreChartFields,
  readTopScores,
  readUserRank,
  readUserRankedChartPage,
  readUserTopRanks,
} from './repository.js';

type QueryRuntime = Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>;

const MY_RANKINGS_PAGE_SIZE = 20;

export type LeaderboardLoad =
  { readonly kind: 'loaded'; readonly leaderboard: Leaderboard } | { readonly kind: 'notFound' };

export function loadLeaderboard(
  runtime: QueryRuntime,
  app: DbApp,
  chartId: string,
  userId: string | null,
): LeaderboardLoad {
  const chartRevision = readPublishedChartRevision(runtime, app, chartId);
  if (chartRevision === undefined) {
    return { kind: 'notFound' };
  }
  const partition = {
    chart: chartId,
    chartRevision,
  };
  const top = readTopScores(runtime, app, partition, TOP_RANK_LIMIT).map((row, index) => ({
    rank: index + 1,
    nickname: row.nickname,
    featuredAchievement: row.featuredAchievement === '' ? null : row.featuredAchievement,
    score: row.score,
    accuracy: row.accuracy,
    isMe: row.user === userId,
  }));
  const totalPlayers = readPartitionSize(runtime, app, partition);
  const myRank = userId === null ? undefined : readUserRank(runtime, app, partition, userId);
  const me =
    myRank === undefined
      ? null
      : {
          ...myRank,
          featuredAchievement:
            myRank.featuredAchievement === '' ? null : myRank.featuredAchievement,
        };
  return {
    kind: 'loaded',
    leaderboard: {
      chartId,
      chartRevision,
      totalPlayers,
      top,
      me,
      hasPreviousRevisionRecord:
        userId !== null &&
        me === null &&
        hasOtherRevisionScore(runtime, app, {
          chart: chartId,
          revision: chartRevision,
          userId,
        }),
    },
  };
}

export function loadMyRankings(
  runtime: QueryRuntime,
  app: DbApp,
  userId: string,
  query: RankedChartQuery,
): RankedChartPage {
  // 한 개 더 읽어 다음 페이지가 있는지 본다. 마지막 페이지에서 빈 요청을 한 번 더 보내지 않는다.
  const charts = readUserRankedChartPage(
    runtime,
    app,
    userId,
    MY_RANK_LIMIT,
    query,
    MY_RANKINGS_PAGE_SIZE + 1,
  );
  if (charts.length <= MY_RANKINGS_PAGE_SIZE) {
    return {
      items: charts,
      next: null,
    };
  }
  const last = requireDefined(
    charts[MY_RANKINGS_PAGE_SIZE - 1],
    'Ranked chart page without a last item',
    MY_RANKINGS_PAGE_SIZE,
  );
  return {
    items: charts.slice(0, MY_RANKINGS_PAGE_SIZE),
    next: {
      value: {
        score: last.score,
        achieved: last.achievedAtMs,
      }[query.sort],
      chartId: last.chartId,
    },
  };
}

export function loadMyTopRanks(
  runtime: QueryRuntime,
  app: DbApp,
  userId: string,
): readonly ChartTopRank[] {
  return readUserTopRanks(runtime, app, userId, TOP_RANK_LIMIT);
}

/** 어떤 경로로 기록을 만들어도 채보의 레인과 난이도를 복제하도록 레코드 훅에서 부른다. */
export function fillScoreChartFields(runtime: QueryRuntime, app: DbApp, record: JsvmRecord): void {
  const chart = readScoreChartFields(runtime, app, record.getString('chart'));
  if (chart === undefined) {
    return;
  }
  record.set('laneCount', chart.laneCount);
  record.set('difficulty', chart.difficulty);
}
