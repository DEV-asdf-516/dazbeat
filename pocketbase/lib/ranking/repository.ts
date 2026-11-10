import { MY_RANK_LIMIT } from '../../../src/data/ranking.js';
import type {
  ChartTopRank,
  LeaderboardEntry,
  MyChartRecord,
  RankedChart,
  RankedChartQuery,
  RankedChartSort,
} from '../../../src/data/ranking.js';
import { DIFFICULTIES, ZODIACS } from '../../../src/data/songs.js';
import { CHARTS, SCORES, SONGS, USERS } from '../../../src/pbCollections.js';
import { asc, desc } from '../../../src/pbQuery.js';
import type { FilterValue } from '../../../src/pbQuery.js';
import {
  aliasColumn,
  aliasJoinOn,
  aliasTable,
  column,
  columnAs,
  columns,
  joinOn,
  orderTerms,
} from '../../../src/pbSql.js';
import { LANE_COUNTS } from '../../../src/rhythm/lanes.js';
import { isShallowEqual } from '../../../src/shallowEqual.js';
import { parseOneOf, selectRow, selectRows } from '../jsvm.js';
import type { DbApp, JsvmRecord, JsvmRuntime, RowOf, SelectQuery } from '../jsvm.js';

type QueryRuntime = Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>;

export interface ScorePartition {
  readonly chart: string;
  readonly chartRevision: string;
}

const RANKED = 'ranked';
const AHEAD = 'ahead';

/** 공동 순위 없이 점수, 정확도, 달성 시각, id 순으로 가른다. */
function isAheadOf(ahead: string, ranked: string): string {
  const of = (alias: string) => ({
    chart: aliasColumn(alias, SCORES, 'chart'),
    chartRevision: aliasColumn(alias, SCORES, 'chartRevision'),
    score: aliasColumn(alias, SCORES, 'score'),
    accuracy: aliasColumn(alias, SCORES, 'accuracy'),
    achievedAt: aliasColumn(alias, SCORES, 'achievedAt'),
    id: aliasColumn(alias, SCORES, 'id'),
  });
  const a = of(ahead);
  const r = of(ranked);
  // 점수 하한을 OR 밖에 따로 두어야 인덱스에서 앞선 점수 범위만 읽는다.
  return `${a.chart} = ${r.chart} AND ${a.chartRevision} = ${r.chartRevision} AND ${a.score} >= ${r.score} AND (
      ${a.score} > ${r.score}
      OR (${a.score} = ${r.score} AND ${a.accuracy} > ${r.accuracy})
      OR (${a.score} = ${r.score} AND ${a.accuracy} = ${r.accuracy} AND ${a.achievedAt} < ${r.achievedAt})
      OR (${a.score} = ${r.score} AND ${a.accuracy} = ${r.accuracy} AND ${a.achievedAt} = ${r.achievedAt} AND ${a.id} < ${r.id})
    )`;
}

// 세는 데 LIMIT 을 거는 상관 서브쿼리는 dbx builder 로 만들 수 없어 문장으로 쓴다.
const AHEAD_COUNT_FIELD = `(SELECT COUNT(*) FROM (SELECT 1 FROM ${aliasTable(SCORES, AHEAD)}
  WHERE ${isAheadOf(AHEAD, RANKED)} LIMIT {:aheadCountLimit})) AS aheadCount`;

export function readUserRank(
  runtime: QueryRuntime,
  app: DbApp,
  partition: ScorePartition,
  userId: string,
):
  | (Omit<LeaderboardEntry, 'isMe' | 'featuredAchievement'> & {
      readonly featuredAchievement: string;
    })
  | undefined {
  const [row] = selectRows(
    runtime,
    {
      nickname: 'text',
      featuredAchievement: 'text',
      score: 'float',
      accuracy: 'float',
      aheadCount: 'int',
    },
    app
      .db()
      .select(
        ...columns(USERS, ['nickname', 'featuredAchievement']),
        aliasColumn(RANKED, SCORES, 'score'),
        aliasColumn(RANKED, SCORES, 'accuracy'),
        AHEAD_COUNT_FIELD,
      )
      .from(aliasTable(SCORES, RANKED))
      .innerJoin(USERS.name, runtime.dbx.exp(aliasJoinOn(USERS, 'id', RANKED, SCORES, 'user')))
      .where(
        runtime.dbx.hashExp({
          [aliasColumn(RANKED, SCORES, 'user')]: userId,
          [aliasColumn(RANKED, SCORES, 'chart')]: partition.chart,
          [aliasColumn(RANKED, SCORES, 'chartRevision')]: partition.chartRevision,
        }),
      )
      .andBind({ aheadCountLimit: MY_RANK_LIMIT }),
  );
  return row === undefined
    ? undefined
    : {
        rank: 1 + row.aheadCount,
        nickname: row.nickname,
        featuredAchievement: row.featuredAchievement,
        score: row.score,
        accuracy: row.accuracy,
      };
}

export function readPublishedChartRevision(
  runtime: QueryRuntime,
  app: DbApp,
  chartId: string,
): string | undefined {
  const { dbx } = runtime;
  const [chart] = selectRows(
    runtime,
    { revision: 'text' },
    app
      .db()
      .select(column(CHARTS, 'revision'))
      .from(CHARTS.name)
      .innerJoin(SONGS.name, dbx.exp(joinOn(SONGS, 'id', CHARTS, 'song')))
      .where(
        dbx.hashExp({
          [column(CHARTS, 'id')]: chartId,
          [column(SONGS, 'isPublished')]: true,
        }),
      )
      .limit(1),
  );
  return chart?.revision;
}

function wherePartition(runtime: Pick<JsvmRuntime, 'dbx'>, partition: ScorePartition) {
  return runtime.dbx.hashExp({
    [column(SCORES, 'chart')]: partition.chart,
    [column(SCORES, 'chartRevision')]: partition.chartRevision,
  });
}

export function readTopScores(
  runtime: QueryRuntime,
  app: DbApp,
  partition: ScorePartition,
  limit: number,
) {
  return selectRows(
    runtime,
    {
      user: 'text',
      nickname: 'text',
      featuredAchievement: 'text',
      score: 'float',
      accuracy: 'float',
    },
    app
      .db()
      .select(
        ...columns(SCORES, ['user', 'score', 'accuracy']),
        ...columns(USERS, ['nickname', 'featuredAchievement']),
      )
      .from(SCORES.name)
      .innerJoin(USERS.name, runtime.dbx.exp(joinOn(USERS, 'id', SCORES, 'user')))
      .where(wherePartition(runtime, partition))
      .orderBy(
        ...orderTerms(SCORES, [desc('score'), desc('accuracy'), asc('achievedAt'), asc('id')]),
      )
      .limit(limit),
  );
}

export function readPartitionSize(
  runtime: QueryRuntime,
  app: DbApp,
  partition: ScorePartition,
): number {
  return selectRow(
    runtime,
    { total: 'int' },
    app
      .db()
      .select('COUNT(*) AS total')
      .from(SCORES.name)
      .where(wherePartition(runtime, partition)),
  ).total;
}

export function hasOtherRevisionScore(
  runtime: QueryRuntime,
  app: DbApp,
  key: { readonly chart: string; readonly revision: string; readonly userId: string },
): boolean {
  const { dbx } = runtime;
  const { total } = selectRow(
    runtime,
    { total: 'int' },
    app
      .db()
      .select('COUNT(*) AS total')
      .from(SCORES.name)
      .where(
        dbx.hashExp({
          [column(SCORES, 'user')]: key.userId,
          [column(SCORES, 'chart')]: key.chart,
        }),
      )
      .andWhere(dbx.not(dbx.hashExp({ [column(SCORES, 'chartRevision')]: key.revision }))),
  );
  return total > 0;
}

const RANKED_CHART_COLUMNS = {
  chartId: 'text',
  songId: 'text',
  songTitle: 'text',
  constellation: 'text',
  laneCount: 'int',
  difficulty: 'text',
  score: 'float',
  achievedAt: 'date',
  aheadCount: 'int',
} as const;

const RANKED_CHART_ID_FIELD = `${aliasColumn(RANKED, SCORES, 'chart')} AS chartId`;
const RANKED_CHART_FIELDS = [
  RANKED_CHART_ID_FIELD,
  columnAs(SONGS, 'id', 'songId'),
  columnAs(SONGS, 'title', 'songTitle'),
  column(SONGS, 'constellation'),
  aliasColumn(RANKED, SCORES, 'laneCount'),
  aliasColumn(RANKED, SCORES, 'difficulty'),
  aliasColumn(RANKED, SCORES, 'score'),
  aliasColumn(RANKED, SCORES, 'achievedAt'),
];

function selectUserCharts(
  runtime: QueryRuntime,
  app: DbApp,
  userId: string,
  aheadCountLimit: number,
  fields: readonly string[],
): SelectQuery {
  const { dbx } = runtime;
  return (
    app
      .db()
      .select(...fields, AHEAD_COUNT_FIELD)
      .from(aliasTable(SCORES, RANKED))
      // 통계가 있으면 플래너가 songs 전체부터 훑어 기록이 몇 개뿐인 사용자도 모든 채보를 읽는다.
      // SQLite 는 CROSS JOIN 의 순서를 바꾸지 않으므로 내 기록부터 읽게 고정한다.
      // 채보의 현재 revision 기록만 순위가 있다.
      .join(
        'CROSS JOIN',
        CHARTS.name,
        dbx.exp(
          `${aliasJoinOn(CHARTS, 'id', RANKED, SCORES, 'chart')} AND ${aliasJoinOn(CHARTS, 'revision', RANKED, SCORES, 'chartRevision')}`,
        ),
      )
      .join('CROSS JOIN', SONGS.name, dbx.exp(joinOn(SONGS, 'id', CHARTS, 'song')))
      .where(
        dbx.hashExp({
          [aliasColumn(RANKED, SCORES, 'user')]: userId,
          [column(SONGS, 'isPublished')]: true,
        }),
      )
      .andBind({ aheadCountLimit })
  );
}

function parseRankedChartRow(row: RowOf<typeof RANKED_CHART_COLUMNS>): RankedChart {
  return {
    chartId: row.chartId,
    songId: row.songId,
    songTitle: row.songTitle,
    constellation: parseOneOf(ZODIACS, 'Unknown zodiac', row.constellation),
    laneCount: parseOneOf(LANE_COUNTS, 'Unknown lane count', row.laneCount),
    difficulty: parseOneOf(DIFFICULTIES, 'Unknown difficulty', row.difficulty),
    rank: 1 + row.aheadCount,
    score: row.score,
    achievedAtMs: row.achievedAt,
  };
}

export function readUserTopRanks(
  runtime: QueryRuntime,
  app: DbApp,
  userId: string,
  maxRank: number,
): readonly ChartTopRank[] {
  return (
    selectRows(
      runtime,
      {
        chartId: 'text',
        aheadCount: 'int',
      },
      // 순위 밖 기록은 버리므로 앞선 기록을 maxRank 개까지만 센다.
      selectUserCharts(runtime, app, userId, maxRank, [RANKED_CHART_ID_FIELD]),
    )
      // WHERE 에서 aheadCount 별칭으로 거르면 SQLite 가 상관 서브쿼리를 채보 조인 전에 한 번 더 계산한다.
      .filter(({ aheadCount }) => aheadCount < maxRank)
      .map(({ chartId, aheadCount }) => ({
        chartId,
        rank: 1 + aheadCount,
      }))
  );
}

const RANKED_CHART_SORT_KEYS = {
  score: {
    column: aliasColumn(RANKED, SCORES, 'score'),
    toBound: (value: number): FilterValue => value,
  },
  achieved: {
    column: aliasColumn(RANKED, SCORES, 'achievedAt'),
    // PocketBase 는 날짜를 공백으로 가른 UTC 문자열로 저장한다.
    toBound: (value: number): FilterValue => new Date(value).toISOString().replace('T', ' '),
  },
} as const satisfies Record<RankedChartSort, unknown>;

/** 내 기록을 인덱스 순서대로 읽다가 limit 에서 멈추고, 순위는 돌려줄 행에만 계산한다. */
export function readUserRankedChartPage(
  runtime: QueryRuntime,
  app: DbApp,
  userId: string,
  aheadCountLimit: number,
  { sort, laneCount, difficulty, cursor }: RankedChartQuery,
  limit: number,
): readonly RankedChart[] {
  const { dbx } = runtime;
  const { column: sortColumn, toBound } = RANKED_CHART_SORT_KEYS[sort];
  const chart = aliasColumn(RANKED, SCORES, 'chart');
  const query = selectUserCharts(runtime, app, userId, aheadCountLimit, RANKED_CHART_FIELDS);
  const filtered = query.andWhere(
    dbx.hashExp({
      ...(laneCount === null ? {} : { [aliasColumn(RANKED, SCORES, 'laneCount')]: laneCount }),
      ...(difficulty === null ? {} : { [aliasColumn(RANKED, SCORES, 'difficulty')]: difficulty }),
    }),
  );
  return selectRows(
    runtime,
    RANKED_CHART_COLUMNS,
    (cursor === null
      ? filtered
      : filtered.andWhere(
          // 경계를 OR 밖에 따로 두어야 인덱스에서 커서 뒤부터 읽는다.
          dbx.exp(
            `${sortColumn} <= {:afterValue} AND (${sortColumn} < {:afterValue}
              OR (${sortColumn} = {:afterValue} AND ${chart} > {:afterChartId}))`,
            {
              afterValue: toBound(cursor.value),
              afterChartId: cursor.chartId,
            },
          ),
        )
    )
      .orderBy(`${sortColumn} DESC`, chart)
      .limit(limit),
  ).map(parseRankedChartRow);
}

export function readScoreChartFields(runtime: QueryRuntime, app: DbApp, chartId: string) {
  const { dbx } = runtime;
  const [chart] = selectRows(
    runtime,
    {
      laneCount: 'int',
      difficulty: 'text',
    },
    app
      .db()
      .select(...columns(CHARTS, ['laneCount', 'difficulty']))
      .from(CHARTS.name)
      .where(dbx.hashExp({ [column(CHARTS, 'id')]: chartId }))
      .limit(1),
  );
  return chart;
}

function readCopiedChartFields(chart: JsvmRecord) {
  return {
    laneCount: chart.getInt('laneCount'),
    difficulty: chart.getString('difficulty'),
  };
}

export function hasChangedScoreChartFields(before: JsvmRecord, after: JsvmRecord): boolean {
  return !isShallowEqual(readCopiedChartFields(before), readCopiedChartFields(after));
}

/** 기록 하나하나를 저장하면 인기 채보에서 수만 번 저장하게 되고, 복제 열만 고치므로 훅과 autodate 가 필요 없다. */
export function saveScoreChartFields(dbx: JsvmRuntime['dbx'], app: DbApp, chart: JsvmRecord): void {
  app
    .db()
    .update(SCORES.name, readCopiedChartFields(chart), dbx.hashExp({ chart: chart.id }))
    .execute();
}

export function readUserBestRecords(
  runtime: QueryRuntime,
  app: DbApp,
  userId: string,
): readonly MyChartRecord[] {
  const { dbx } = runtime;
  const rows = selectRows(
    runtime,
    {
      songId: 'text',
      laneCount: 'int',
      difficulty: 'text',
      score: 'float',
      accuracy: 'float',
      maxCombo: 'int',
      cleared: 'bool',
    },
    app
      .db()
      .select(
        columnAs(SONGS, 'key', 'songId'),
        // 레인과 난이도는 행이 많은 scores 의 커버링 인덱스에 담지 않으려고 charts 인덱스에서 읽는다.
        ...columns(CHARTS, ['laneCount', 'difficulty']),
        // 채보를 고쳐도 내 기록은 남도록 revision 을 가리지 않고 필드별로 합친다.
        `MAX(${column(SCORES, 'score')}) AS score`,
        `MAX(${column(SCORES, 'accuracy')}) AS accuracy`,
        `MAX(${column(SCORES, 'maxCombo')}) AS maxCombo`,
        `MAX(${column(SCORES, 'cleared')}) AS cleared`,
      )
      .from(SCORES.name)
      .innerJoin(CHARTS.name, dbx.exp(joinOn(CHARTS, 'id', SCORES, 'chart')))
      .innerJoin(SONGS.name, dbx.exp(joinOn(SONGS, 'id', CHARTS, 'song')))
      .where(
        dbx.hashExp({
          [column(SCORES, 'user')]: userId,
          [column(SONGS, 'isPublished')]: true,
        }),
      )
      .groupBy(column(SCORES, 'chart')),
  );
  return rows.map((row): MyChartRecord => ({
    songId: row.songId,
    laneCount: parseOneOf(LANE_COUNTS, 'Unknown lane count', row.laneCount),
    difficulty: parseOneOf(DIFFICULTIES, 'Unknown difficulty', row.difficulty),
    score: row.score,
    accuracy: row.accuracy,
    maxCombo: row.maxCombo,
    cleared: row.cleared,
  }));
}
