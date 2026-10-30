import {
  ACHIEVEMENT_MARK_KINDS,
  parseAchievementDefinition,
} from '../../../src/data/achievements.js';
import { InvalidAchievementDefinitionError } from '../../../src/data/achievements.js';
import type { AchievementId, AchievementMark } from '../../../src/data/achievements.js';
import { DIFFICULTIES, ZODIACS } from '../../../src/data/songs.js';
import type { Zodiac } from '../../../src/data/songs.js';
import {
  EARNED_CHART_MARKS,
  ACHIEVEMENTS,
  ALBUMS,
  CHARTS,
  EARNED_ACHIEVEMENTS,
  PLAY_RESULTS,
  EARNED_SONG_MARKS,
  SONGS,
} from '../../../src/pbCollections.js';
import { column, columns } from '../../../src/pbSql.js';
import type { Difficulty } from '../../../src/rhythm/types.js';
import { parseOneOf, selectRow, selectRows } from '../jsvm.js';
import type { DbApp, JsvmApp, JsvmRecord, JsvmRuntime } from '../jsvm.js';
import type { PublishedSong, StoredAchievement, StoredMark, UserAchievements } from './dto.js';

const ACHIEVEMENT_COLUMNS = [
  'key',
  'achievementSet',
  'category',
  'kind',
  'target',
  'mark',
  'difficulty',
  'zodiac',
  'album',
  'retired',
  'nameKo',
  'nameJa',
  'nameEn',
] as const;

export function readAchievements(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>,
  app: DbApp,
  key?: AchievementId,
): StoredAchievement[] {
  const query = app
    .db()
    .select(...columns(ACHIEVEMENTS, ACHIEVEMENT_COLUMNS))
    .from(ACHIEVEMENTS.name)
    .orderBy(column(ACHIEVEMENTS, 'sortOrder'), column(ACHIEVEMENTS, 'key'));
  if (key !== undefined) {
    query.where(runtime.dbx.hashExp({ [column(ACHIEVEMENTS, 'key')]: key }));
  }
  const rows = selectRows(
    runtime,
    {
      key: 'text',
      achievementSet: 'text',
      category: 'text',
      kind: 'text',
      target: 'int',
      mark: 'text',
      difficulty: 'text',
      zodiac: 'text',
      album: 'text',
      retired: 'bool',
      nameKo: 'text',
      nameJa: 'text',
      nameEn: 'text',
    },
    query,
  );
  return rows.flatMap(({ nameKo, nameJa, nameEn, ...fields }) => {
    try {
      return [
        {
          fields,
          names: {
            ko: nameKo,
            ja: nameJa,
            en: nameEn,
          },
          definition: parseAchievementDefinition(fields),
        },
      ];
    } catch (error) {
      if (error instanceof InvalidAchievementDefinitionError) {
        // 앨범 삭제로 album 이 비는 것처럼 저장 검사 뒤에 무효가 된 행은 그 업적만 빼고 계속한다.
        console.warn(
          `Skipping invalid achievement ${fields.key}: ${error.field} ${error.code} (${error.message})`,
        );
        return [];
      }
      throw error;
    }
  });
}

export function readMarks(runtime: JsvmRuntime, app: JsvmApp, userId: string): StoredMark[] {
  // 채보가 지워졌거나 revision 이 바뀌었거나 곡이 비공개인 증거를 가려내려고 채보, 곡과 붙여 읽는다.
  const { dbx } = runtime;
  const markRows = selectRows(
    runtime,
    {
      kind: 'text',
      song: 'text',
      difficulty: 'text',
      chart: 'text',
      chartRevision: 'text',
      constellation: 'text',
      isCurrent: 'bool',
    },
    app
      .db()
      .select(
        ...columns(EARNED_CHART_MARKS, [
          'kind',
          'song',
          'difficulty',
          'chart',
          'chartRevision',
          'constellation',
        ]),
        `(${column(CHARTS, 'revision')} IS ${column(EARNED_CHART_MARKS, 'chartRevision')}
          AND ${column(SONGS, 'isPublished')} IS TRUE) AS isCurrent`,
      )
      .from(EARNED_CHART_MARKS.name)
      .leftJoin(
        CHARTS.name,
        dbx.exp(`${column(CHARTS, 'id')} = ${column(EARNED_CHART_MARKS, 'chart')}`),
      )
      .leftJoin(
        SONGS.name,
        dbx.exp(`${column(SONGS, 'id')} = ${column(EARNED_CHART_MARKS, 'song')}`),
      )
      .where(dbx.hashExp({ [column(EARNED_CHART_MARKS, 'user')]: userId })),
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

export function readEarnedState(
  runtime: JsvmRuntime,
  app: JsvmApp,
  userId: string,
): {
  readonly playCount: number;
  readonly songMarks: readonly { song: string; kind: AchievementMark }[];
  readonly earnedAtMsById: ReadonlyMap<AchievementId, number>;
} {
  const { dbx } = runtime;
  const { total: playCount } = selectRow(
    runtime,
    { total: 'int' },
    app
      .db()
      .select('COUNT(*) AS total')
      .from(PLAY_RESULTS.name)
      .where(dbx.hashExp({ [column(PLAY_RESULTS, 'user')]: userId })),
  );
  const songMarks = selectRows(
    runtime,
    {
      song: 'text',
      kind: 'text',
    },
    app
      .db()
      .select(...columns(EARNED_SONG_MARKS, ['song', 'kind']))
      .from(EARNED_SONG_MARKS.name)
      .where(dbx.hashExp({ [column(EARNED_SONG_MARKS, 'user')]: userId })),
  ).map((row) => ({
    song: row.song,
    kind: parseOneOf(ACHIEVEMENT_MARK_KINDS, 'Unknown achievement mark', row.kind),
  }));
  const earnedAtMsById = new Map(
    selectRows(
      runtime,
      {
        achievement: 'text',
        earnedAt: 'date',
      },
      app
        .db()
        .select(...columns(EARNED_ACHIEVEMENTS, ['achievement', 'earnedAt']))
        .from(EARNED_ACHIEVEMENTS.name)
        .where(dbx.hashExp({ [column(EARNED_ACHIEVEMENTS, 'user')]: userId })),
    ).map((row) => [row.achievement, row.earnedAt] as const),
  );
  return {
    playCount,
    songMarks,
    earnedAtMsById,
  };
}

export function readPublishedSongs(runtime: JsvmRuntime, app: JsvmApp): PublishedSong[] {
  // 채보 data 열은 크고 수가 많아 곡과 제공 난이도 조합만 읽고, 곡별로 묶는 건 여기서 한다.
  const { dbx } = runtime;
  const songs = new Map<
    string,
    {
      id: string;
      constellation: Zodiac;
      album: string | null;
      difficulties: [Difficulty, ...Difficulty[]];
    }
  >();
  for (const row of selectRows(
    runtime,
    {
      id: 'text',
      constellation: 'text',
      album: 'text',
      difficulty: 'text',
    },
    app
      .db()
      .select(...columns(SONGS, ['id', 'constellation', 'album']), column(CHARTS, 'difficulty'))
      .distinct(true)
      .from(SONGS.name)
      .innerJoin(CHARTS.name, dbx.exp(`${column(CHARTS, 'song')} = ${column(SONGS, 'id')}`))
      .where(dbx.hashExp({ [column(SONGS, 'isPublished')]: true })),
  )) {
    const difficulty = parseOneOf(DIFFICULTIES, 'Unknown difficulty', row.difficulty);
    const song = songs.get(row.id);
    if (song === undefined) {
      songs.set(row.id, {
        id: row.id,
        constellation: parseOneOf(ZODIACS, 'Unknown constellation', row.constellation),
        album: row.album === '' ? null : row.album,
        difficulties: [difficulty],
      });
    } else {
      song.difficulties.push(difficulty);
    }
  }
  return [...songs.values()];
}

export function readAlbumNames(runtime: JsvmRuntime, app: JsvmApp): ReadonlyMap<string, string> {
  return new Map(
    selectRows(
      runtime,
      {
        id: 'text',
        name: 'text',
      },
      app
        .db()
        .select(...columns(ALBUMS, ['id', 'name']))
        .from(ALBUMS.name),
    ).map(({ id, name }) => [id, name] as const),
  );
}

export function saveUserAchievements(
  runtime: JsvmRuntime,
  tx: JsvmApp,
  userId: string,
  achievements: UserAchievements,
): UserAchievements {
  for (const songMark of achievements.newSongMarks) {
    saveRecord(runtime, tx, EARNED_SONG_MARKS.name, {
      user: userId,
      song: songMark.song,
      kind: songMark.kind,
    });
  }
  const earnedAtMsById = new Map(achievements.earnedAtMsById);
  for (const id of achievements.newAchievements) {
    const record = saveRecord(runtime, tx, EARNED_ACHIEVEMENTS.name, {
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

export function saveRecord(
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
