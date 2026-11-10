import { DIFFICULTIES, ZODIACS } from '../../../src/data/songs.js';
import {
  CHARTS,
  PLAY_SESSION_QUOTAS,
  PLAY_SESSIONS,
  SCORES,
  SONGS,
} from '../../../src/pbCollections.js';
import { where } from '../../../src/pbQuery.js';
import { column, columnAs, columns, joinOn } from '../../../src/pbSql.js';
import { LANE_COUNTS } from '../../../src/rhythm/lanes.js';
import type { Difficulty, FinishedGameplayResult, LaneCount } from '../../../src/rhythm/types.js';
import { parseOneOf, selectRows } from '../jsvm.js';
import type { DbApp, JsvmApp, JsvmRecord, JsvmRuntime } from '../jsvm.js';
import type { SessionQuota } from './dto.js';

type QueryRuntime = Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>;

export function readSessionChart(runtime: QueryRuntime, app: DbApp, chartId: string) {
  const { dbx } = runtime;
  const [chart] = selectRows(
    runtime,
    {
      id: 'text',
      revision: 'text',
      data: 'text',
      difficulty: 'text',
      laneCount: 'int',
      songKey: 'text',
      gameStartMs: 'float',
      gameEndMs: 'float',
    },
    app
      .db()
      .select(
        ...columns(CHARTS, ['id', 'revision', 'data', 'difficulty', 'laneCount']),
        columnAs(SONGS, 'key', 'songKey'),
        ...columns(SONGS, ['gameStartMs', 'gameEndMs']),
      )
      .from(CHARTS.name)
      .innerJoin(SONGS.name, dbx.exp(joinOn(SONGS, 'id', CHARTS, 'song')))
      .where(
        dbx.hashExp({
          [column(CHARTS, 'id')]: chartId,
          // 비공개 곡의 채보는 없는 채보처럼 거절한다.
          [column(SONGS, 'isPublished')]: true,
        }),
      )
      .limit(1),
  );
  return chart === undefined
    ? undefined
    : {
        ...chart,
        difficulty: parseOneOf(DIFFICULTIES, 'Unknown difficulty', chart.difficulty),
        laneCount: parseOneOf(LANE_COUNTS, 'Unknown lane count', chart.laneCount),
      };
}

export function readOwnSession(
  runtime: QueryRuntime,
  tx: DbApp,
  sessionId: string,
  userId: string,
) {
  const { dbx } = runtime;
  const [row] = selectRows(
    runtime,
    {
      chartData: 'text',
      chartRevision: 'text',
      issuedAt: 'text',
      expiresAt: 'text',
      songKey: 'text',
      gameStartMs: 'float',
      gameEndMs: 'float',
      difficulty: 'text',
      laneCount: 'int',
      chart: 'text',
      song: 'text',
      constellation: 'text',
      currentDifficulty: 'text',
      currentLaneCount: 'int',
    },
    tx
      .db()
      .select(
        ...columns(PLAY_SESSIONS, [
          'chartData',
          'chartRevision',
          'issuedAt',
          'expiresAt',
          'songKey',
          'gameStartMs',
          'gameEndMs',
          'difficulty',
          'laneCount',
        ]),
        columnAs(CHARTS, 'id', 'chart'),
        columnAs(CHARTS, 'difficulty', 'currentDifficulty'),
        columnAs(CHARTS, 'laneCount', 'currentLaneCount'),
        columnAs(SONGS, 'id', 'song'),
        column(SONGS, 'constellation'),
      )
      .from(PLAY_SESSIONS.name)
      .innerJoin(CHARTS.name, dbx.exp(joinOn(CHARTS, 'id', PLAY_SESSIONS, 'chart')))
      .innerJoin(SONGS.name, dbx.exp(joinOn(SONGS, 'id', CHARTS, 'song')))
      .where(
        dbx.hashExp({
          [column(PLAY_SESSIONS, 'id')]: sessionId,
          [column(PLAY_SESSIONS, 'user')]: userId,
        }),
      )
      .limit(1),
  );
  if (row === undefined) {
    return undefined;
  }
  // 검증은 발급 때 고정한 값으로, 랭킹·업적 귀속은 제출 시점의 채보·곡 값으로 한다.
  return {
    verification: {
      chartData: row.chartData,
      chartRevision: row.chartRevision,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      songKey: row.songKey,
      gameStartMs: row.gameStartMs,
      gameEndMs: row.gameEndMs,
      difficulty: parseOneOf(DIFFICULTIES, 'Unknown difficulty', row.difficulty),
      laneCount: parseOneOf(LANE_COUNTS, 'Unknown lane count', row.laneCount),
    },
    current: {
      chart: row.chart,
      song: row.song,
      constellation: parseOneOf(ZODIACS, 'Unknown constellation', row.constellation),
      difficulty: parseOneOf(DIFFICULTIES, 'Unknown difficulty', row.currentDifficulty),
      laneCount: parseOneOf(LANE_COUNTS, 'Unknown lane count', row.currentLaneCount),
    },
  };
}

export function readCurrentChart(runtime: QueryRuntime, tx: DbApp, chartId: string) {
  const { dbx } = runtime;
  const [chart] = selectRows(
    runtime,
    {
      revision: 'text',
      isPublished: 'bool',
    },
    tx
      .db()
      .select(column(CHARTS, 'revision'), column(SONGS, 'isPublished'))
      .from(CHARTS.name)
      .innerJoin(SONGS.name, dbx.exp(joinOn(SONGS, 'id', CHARTS, 'song')))
      .where(dbx.hashExp({ [column(CHARTS, 'id')]: chartId }))
      .limit(1),
  );
  return chart;
}

/**
 * 세션의 채보 data 스냅샷을 다시 읽지 않도록 레코드가 아니라 행으로 지운다. 레코드 훅·realtime 이벤트를
 * 거치지 않아도 되는 건 play_sessions 가 훅이 없고 다른 컬렉션이 relation 으로 가리키지 않는 서버 전용 컬렉션이라서다.
 */
export function deletePlaySessions(
  runtime: Pick<JsvmRuntime, 'dbx'>,
  tx: DbApp,
  target: { readonly id: string } | { readonly user: string },
): void {
  tx.db().delete(PLAY_SESSIONS.name, runtime.dbx.hashExp(target)).execute();
}

export function findQuotaRecord(tx: JsvmApp, userId: string): JsvmRecord | undefined {
  const quotaFilter = where(PLAY_SESSION_QUOTAS, [{ user: userId }]);
  return tx.findRecordsByFilter(
    PLAY_SESSION_QUOTAS.name,
    quotaFilter.expression,
    '',
    1,
    0,
    quotaFilter.params,
  )[0];
}

export function parseQuotaRecord(record: JsvmRecord): SessionQuota {
  return {
    windowStartedAtMs: record.getDateTime('windowStartedAt').time().unixMilli(),
    issuedCount: record.getInt('issuedCount'),
  };
}

export function saveSessionQuota(
  runtime: Pick<JsvmRuntime, 'Record'>,
  tx: JsvmApp,
  target: { readonly userId: string; readonly record: JsvmRecord | undefined },
  quota: SessionQuota,
): void {
  let { record } = target;
  if (record === undefined) {
    record = new runtime.Record(tx.findCachedCollectionByNameOrId(PLAY_SESSION_QUOTAS.name));
    record.set('user', target.userId);
  }
  record.set('windowStartedAt', new Date(quota.windowStartedAtMs).toISOString());
  record.set('issuedCount', quota.issuedCount);
  tx.save(record);
}

export function savePlaySession(
  runtime: Pick<JsvmRuntime, 'Record'>,
  tx: JsvmApp,
  session: {
    readonly userId: string;
    readonly chart: {
      readonly id: string;
      readonly revision: string;
      readonly data: string;
      readonly songKey: string;
      readonly gameStartMs: number;
      readonly gameEndMs: number;
      readonly difficulty: Difficulty;
      readonly laneCount: LaneCount;
    };
    readonly issuedAtMs: number;
    readonly expiresAtMs: number;
  },
): string {
  const record = new runtime.Record(tx.findCachedCollectionByNameOrId(PLAY_SESSIONS.name));
  record.set('user', session.userId);
  record.set('chart', session.chart.id);
  record.set('chartRevision', session.chart.revision);
  // 요청과 비교한 채보 원문을 바이트 그대로 저장해야 sha256 이 chartRevision 과 같다.
  // 객체를 다시 직렬화하면 달라져 모든 제출이 실패할 수 있다.
  record.set('chartData', session.chart.data);
  record.set('issuedAt', new Date(session.issuedAtMs).toISOString());
  record.set('expiresAt', new Date(session.expiresAtMs).toISOString());
  record.set('songKey', session.chart.songKey);
  record.set('gameStartMs', session.chart.gameStartMs);
  record.set('gameEndMs', session.chart.gameEndMs);
  record.set('difficulty', session.chart.difficulty);
  record.set('laneCount', session.chart.laneCount);
  tx.save(record);
  return record.id;
}

export interface ScoreKey {
  readonly user: string;
  readonly chart: string;
  readonly chartRevision: string;
}

export function findScoreRecord(tx: JsvmApp, key: ScoreKey): JsvmRecord | undefined {
  const bestFilter = where(SCORES, [key]);
  return tx.findRecordsByFilter(SCORES.name, bestFilter.expression, '', 1, 0, bestFilter.params)[0];
}

export function parseScoreRecord(record: JsvmRecord): number {
  return record.getFloat('score');
}

export function saveBestScore(
  runtime: Pick<JsvmRuntime, 'Record'>,
  tx: JsvmApp,
  target: { readonly key: ScoreKey; readonly record: JsvmRecord | undefined },
  result: Pick<FinishedGameplayResult, 'score' | 'accuracy' | 'maxCombo' | 'counts' | 'cleared'>,
  achievedAtMs: number,
): void {
  const { key } = target;
  let { record } = target;
  if (record === undefined) {
    record = new runtime.Record(tx.findCachedCollectionByNameOrId(SCORES.name));
    record.set('user', key.user);
    record.set('chart', key.chart);
    record.set('chartRevision', key.chartRevision);
  }
  record.set('score', result.score);
  record.set('accuracy', result.accuracy);
  record.set('maxCombo', result.maxCombo);
  record.set('cleared', result.cleared);
  record.set('counts', result.counts);
  record.set('achievedAt', new Date(achievedAtMs).toISOString());
  tx.save(record);
}
