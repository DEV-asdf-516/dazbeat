import { ACHIEVEMENT_MARK_KINDS, findAchievement } from '../../src/data/achievements.js';
import type { AchievementId } from '../../src/data/achievements.js';
import { DIFFICULTIES, ZODIACS } from '../../src/data/songs.js';
import type { Zodiac } from '../../src/data/songs.js';
import { requireDefined } from '../../src/invariant.js';
import {
  ACHIEVEMENT_MARKS,
  CHARTS,
  EARNED_ACHIEVEMENTS,
  PLAY_RESULTS,
  SONG_MASTERIES,
  SONGS,
} from '../../src/pbCollections.js';
import { column, columns, condition, join } from '../../src/pbSql.js';
import type { Difficulty, FinishedGameplayResult, LaneCount } from '../../src/rhythm/types.js';
import { evaluateAchievements, getPlayMarks } from './achievements.js';
import type {
  AchievementCatalogSnapshot,
  AchievementEvaluation,
  AchievementMarkRecord,
} from './achievements.js';
import { queryRow, queryRows } from './jsvm.js';
import type { JsvmApp, JsvmRecord, JsvmRuntime } from './jsvm.js';

export interface UserAchievements extends AchievementEvaluation {
  /** 이번 동기화에서 새로 지급한 것을 포함한 획득 시각. */
  readonly earnedAtMsById: ReadonlyMap<AchievementId, number>;
}

interface StoredMark extends AchievementMarkRecord {
  readonly chart: string;
  readonly chartRevision: string;
}

export function recordVerifiedPlay(
  runtime: JsvmRuntime,
  tx: JsvmApp,
  play: {
    readonly userId: string;
    readonly sessionId: string;
    readonly song: { readonly id: string; readonly constellation: Zodiac };
    readonly chart: {
      readonly id: string;
      readonly difficulty: Difficulty;
      readonly laneCount: LaneCount;
      /** 이 트랜잭션에서 읽은 채보의 현재 revision. */
      readonly currentRevision: string;
    };
    // 소비한 세션의 revision 이다. 증거는 실제로 검증한 채보만 증명해야 해서 scores 의 현재 revision 을 쓰지 않는다.
    readonly sessionChartRevision: string;
    readonly result: FinishedGameplayResult;
  },
): readonly AchievementId[] {
  const { userId, song, chart, sessionChartRevision, result } = play;
  saveNew(runtime, tx, PLAY_RESULTS.name, {
    user: userId,
    session: play.sessionId,
    song: song.id,
    chart: chart.id,
    difficulty: chart.difficulty,
    laneCount: chart.laneCount,
    chartRevision: sessionChartRevision,
    constellation: song.constellation,
    score: result.score,
    accuracy: result.accuracy,
    maxCombo: result.maxCombo,
    counts: result.counts,
    cleared: result.cleared,
  });
  const marks = readMarks(runtime, tx, userId);
  const existingKinds = new Set(
    marks
      .filter(
        (mark) =>
          mark.chart === chart.id &&
          mark.chartRevision === sessionChartRevision &&
          mark.constellation === song.constellation,
      )
      .map((mark) => mark.kind),
  );
  const playMarks = getPlayMarks(result)
    .filter((kind) => !existingKinds.has(kind))
    .map((kind) => {
      const stored = {
        kind,
        song: song.id,
        difficulty: chart.difficulty,
        chart: chart.id,
        chartRevision: sessionChartRevision,
        constellation: song.constellation,
      };
      saveNew(runtime, tx, ACHIEVEMENT_MARKS.name, {
        ...stored,
        user: userId,
        source: 'play',
      });
      return {
        ...stored,
        isCurrent: sessionChartRevision === chart.currentRevision,
      };
    });
  return saveEvaluation(
    runtime,
    tx,
    userId,
    evaluateWithMarks(runtime, tx, userId, [...marks, ...playMarks]),
  ).newAchievements;
}

/** 저장하지 않고 평가만 한다. 새로 지급할 것이 있는지 쓰기 트랜잭션 없이 알아볼 때 쓴다. */
export function evaluateUserAchievements(
  runtime: JsvmRuntime,
  app: JsvmApp,
  userId: string,
): UserAchievements {
  return evaluateWithMarks(runtime, app, userId, readMarks(runtime, app, userId));
}

export function syncAchievements(
  runtime: JsvmRuntime,
  tx: JsvmApp,
  userId: string,
): UserAchievements {
  return saveEvaluation(runtime, tx, userId, evaluateUserAchievements(runtime, tx, userId));
}

function readMarks(runtime: JsvmRuntime, app: JsvmApp, userId: string): StoredMark[] {
  // 채보가 지워졌거나 revision 이 바뀐 증거를 가려내려고 채보와 붙여 읽는다.
  const marksFilter = condition(ACHIEVEMENT_MARKS, { user: userId });
  const markRows = queryRows(
    runtime,
    app,
    {
      kind: 'text',
      song: 'text',
      difficulty: 'text',
      chart: 'text',
      chartRevision: 'text',
      constellation: 'text',
      isCurrent: 'bool',
    },
    `SELECT
        ${columns(ACHIEVEMENT_MARKS, ['kind', 'song', 'difficulty', 'chart', 'chartRevision', 'constellation'])},
        ${column(CHARTS, 'revision')} IS ${column(ACHIEVEMENT_MARKS, 'chartRevision')} AS isCurrent
      FROM ${ACHIEVEMENT_MARKS.name}
      ${join('LEFT JOIN', CHARTS, 'id', ACHIEVEMENT_MARKS, 'chart')}
      WHERE ${marksFilter.expression}`,
    marksFilter.params,
  );
  return markRows.map((row) => ({
    kind: parseOneOf(ACHIEVEMENT_MARK_KINDS, 'Unknown achievement mark', row.kind),
    song: row.song,
    difficulty: parseOneOf(DIFFICULTIES, 'Unknown difficulty', row.difficulty),
    chart: row.chart,
    chartRevision: row.chartRevision,
    isCurrent: row.isCurrent,
    constellation:
      row.constellation === ''
        ? null
        : parseOneOf(ZODIACS, 'Unknown constellation', row.constellation),
  }));
}

function evaluateWithMarks(
  runtime: JsvmRuntime,
  app: JsvmApp,
  userId: string,
  marks: readonly StoredMark[],
): UserAchievements {
  const playCountFilter = condition(PLAY_RESULTS, { user: userId });
  const { total: playCount } = queryRow(
    runtime,
    app,
    { total: 'int' },
    `SELECT COUNT(*) AS total FROM ${PLAY_RESULTS.name} WHERE ${playCountFilter.expression}`,
    playCountFilter.params,
  );
  const masteryFilter = condition(SONG_MASTERIES, { user: userId });
  const masteries = queryRows(
    runtime,
    app,
    {
      song: 'text',
      kind: 'text',
    },
    `SELECT ${columns(SONG_MASTERIES, ['song', 'kind'])}
      FROM ${SONG_MASTERIES.name}
      WHERE ${masteryFilter.expression}`,
    masteryFilter.params,
  ).map((row) => ({
    song: row.song,
    kind: parseOneOf(ACHIEVEMENT_MARK_KINDS, 'Unknown achievement mark', row.kind),
  }));
  const earnedFilter = condition(EARNED_ACHIEVEMENTS, { user: userId });
  const earnedAtMsById = new Map(
    queryRows(
      runtime,
      app,
      {
        achievement: 'text',
        earnedAt: 'date',
      },
      `SELECT ${columns(EARNED_ACHIEVEMENTS, ['achievement', 'earnedAt'])}
        FROM ${EARNED_ACHIEVEMENTS.name}
        WHERE ${earnedFilter.expression}`,
      earnedFilter.params,
    ).map(
      (row) =>
        [
          requireDefined(
            findAchievement(row.achievement),
            'Unknown earned achievement',
            row.achievement,
          ).id,
          row.earnedAt,
        ] as const,
    ),
  );

  const evaluation = evaluateAchievements({
    playCount,
    marks,
    masteries,
    earned: new Set(earnedAtMsById.keys()),
    catalog: readCatalog(runtime, app),
  });
  return {
    ...evaluation,
    earnedAtMsById,
  };
}

function readCatalog(runtime: JsvmRuntime, app: JsvmApp): AchievementCatalogSnapshot {
  // 채보 data 열은 크고 수가 많아 곡과 제공 난이도 조합만 읽고, 곡별로 묶는 건 여기서 한다.
  const catalogSongs = new Map<
    string,
    { id: string; constellation: Zodiac; difficulties: Difficulty[] }
  >();
  for (const row of queryRows(
    runtime,
    app,
    {
      id: 'text',
      constellation: 'text',
      difficulty: 'text',
    },
    `SELECT DISTINCT
        ${columns(SONGS, ['id', 'constellation'])},
        ${column(CHARTS, 'difficulty')}
      FROM ${SONGS.name}
      ${join('JOIN', CHARTS, 'song', SONGS, 'id')}`,
  )) {
    const song = catalogSongs.get(row.id) ?? {
      id: row.id,
      constellation: parseOneOf(ZODIACS, 'Unknown constellation', row.constellation),
      difficulties: [],
    };
    song.difficulties.push(parseOneOf(DIFFICULTIES, 'Unknown difficulty', row.difficulty));
    catalogSongs.set(row.id, song);
  }
  return {
    songs: [...catalogSongs.values()],
  };
}

function saveEvaluation(
  runtime: JsvmRuntime,
  tx: JsvmApp,
  userId: string,
  achievements: UserAchievements,
): UserAchievements {
  for (const mastery of achievements.newMasteries) {
    saveNew(runtime, tx, SONG_MASTERIES.name, {
      user: userId,
      song: mastery.song,
      kind: mastery.kind,
    });
  }
  const earnedAtMsById = new Map(achievements.earnedAtMsById);
  for (const id of achievements.newAchievements) {
    const record = saveNew(runtime, tx, EARNED_ACHIEVEMENTS.name, {
      user: userId,
      achievement: id,
    });
    earnedAtMsById.set(id, record.getDateTime('earnedAt').time().unixMilli());
  }
  return {
    ...achievements,
    earnedAtMsById,
  };
}

function saveNew(
  runtime: JsvmRuntime,
  tx: JsvmApp,
  collection: string,
  fields: Readonly<Record<string, unknown>>,
): JsvmRecord {
  const record = new runtime.Record(tx.findCachedCollectionByNameOrId(collection));
  for (const [field, value] of Object.entries(fields)) {
    record.set(field, value);
  }
  tx.save(record);
  return record;
}

// 아래 값은 select 필드라 스키마가 보장하므로, 벗어나면 개발 오류다.
function parseOneOf<T extends string>(values: readonly T[], message: string, value: string): T {
  return requireDefined(
    values.find((candidate) => candidate === value),
    message,
    value,
  );
}
