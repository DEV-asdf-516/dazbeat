import { CHARTS, SONG_LIST_FIELDS, SONGS } from '../../../src/pbCollections.js';
import { collectionSpec, desc } from '../../../src/pbQuery.js';
import type { CompiledFilter, FilterValue } from '../../../src/pbQuery.js';
import { column, columns, joinOn, orderTerms } from '../../../src/pbSql.js';
import { selectRow, selectRows } from '../jsvm.js';
import type { DbApp, JsvmRuntime, QueryBuilderApp, SelectQuery } from '../jsvm.js';
import type { SongSearchChart, SongSearchPage, SongSearchRequest, TitleSearch } from './dto.js';

const SONG_SEARCH_BATCH_SIZE = 100;
const SONGS_TITLE_FTS = collectionSpec('songs_title_fts', ['songId']);
// 게임은 검색이 준 채보를 채보 기본 API 로 받으므로, 이 규칙이 검색의 범위(공개 곡, 에디터의 all 범위)와 같아야 한다.
// JSVM 은 규칙을 SQL 로 바꾸지 못해 규칙 검사가 레코드마다 쿼리 하나가 되므로 레코드별로 검사하지 않고, 규칙이 바뀌면 멈춘다.
const CHARTS_VIEW_RULE =
  'song.isPublished = true || (@request.auth.id != "" && @request.auth.isEditor = true)';

export interface SongSearchQuery {
  /** 곡 레코드 쿼리에 붙일 조각. 제목을 FTS 로 찾을 때만 join 이 있다. */
  readonly join: { readonly table: string; readonly on: string } | null;
  /** 거를 조건이 없으면 null 이다. */
  readonly condition: string | null;
  readonly orderBy: readonly string[];
  readonly limit: number;
  readonly shouldCount: boolean;
  readonly params: Readonly<Record<string, FilterValue>>;
}

function compileTitleClause(title: TitleSearch) {
  if (title.kind === 'prefix') {
    return {
      join: null,
      // 패턴의 %, _, \ 는 이스케이프해 글자 그대로 찾는다.
      expression: `${column(SONGS, 'title')} LIKE {:titlePrefix} ESCAPE '\\'`,
      params: { titlePrefix: `${title.term.replace(/[\\%_]/g, (char) => `\\${char}`)}%` },
    };
  }
  return {
    join: {
      table: SONGS_TITLE_FTS.name,
      on: joinOn(SONGS_TITLE_FTS, 'songId', SONGS, 'id'),
    },
    expression: `${SONGS_TITLE_FTS.name} MATCH {:match}`,
    params: { match: `"${title.term.replace(/"/g, '""')}"` },
  };
}

export function buildSongSearchQuery(request: SongSearchRequest): SongSearchQuery {
  const { title, category, cursor, scope } = request;
  const titleClause = title === null ? null : compileTitleClause(title);
  const clauses: CompiledFilter[] = [
    titleClause,
    scope === 'all'
      ? null
      : {
          expression: `${column(SONGS, 'isPublished')} = {:isPublished}`,
          params: { isPublished: true },
        },
    category === null
      ? null
      : {
          // 제목이 있으면 카테고리 인덱스는 그 카테고리 곡을 거의 다 읽게 되므로, 단항 + 로 막아 제목 인덱스를 쓰게 한다.
          expression: `${title === null ? '' : '+'}${column(SONGS, 'category')} = {:category}`,
          params: { category },
        },
    cursor === null
      ? null
      : {
          expression:
            `(${column(SONGS, 'releasedOn')} < {:afterReleasedOn} OR ` +
            `(${column(SONGS, 'releasedOn')} = {:afterReleasedOn} AND ${column(SONGS, 'id')} < {:afterId}))`,
          params: {
            afterReleasedOn: cursor.releasedOn,
            afterId: cursor.id,
          },
        },
  ].filter((clause) => clause !== null);
  return {
    join: titleClause?.join ?? null,
    condition:
      clauses.length === 0 ? null : clauses.map((clause) => clause.expression).join(' AND '),
    orderBy: orderTerms(SONGS, [desc('releasedOn'), desc('id')]),
    limit: SONG_SEARCH_BATCH_SIZE,
    shouldCount: cursor === null,
    params: clauses.reduce<Record<string, FilterValue>>(
      (all, clause) => ({
        ...all,
        ...clause.params,
      }),
      {},
    ),
  };
}

export function readSongSearchPage(
  runtime: Pick<JsvmRuntime, 'Record' | 'DynamicModel' | 'arrayOf' | 'dbx'>,
  app: QueryBuilderApp,
  search: SongSearchQuery,
): SongSearchPage {
  const { dbx } = runtime;
  const songsCollection = app.findCachedCollectionByNameOrId('songs');
  const chartsCollection = app.findCachedCollectionByNameOrId('charts');
  // 규칙이 없으면(null) 'null' 이 되어 기대값과 달라 멈춘다.
  if (String(chartsCollection.viewRule) !== CHARTS_VIEW_RULE) {
    throw new Error('Charts view rule no longer matches the search visibility');
  }
  // 목록과 개수는 같은 곡을 세야 하므로 같은 join 과 조건을 쓴다.
  const matchSearch = (query: SelectQuery) => {
    const joined =
      search.join === null ? query : query.innerJoin(search.join.table, dbx.exp(search.join.on));
    return search.condition === null
      ? joined
      : joined.andWhere(dbx.exp(search.condition, search.params));
  };
  const totalItems = search.shouldCount
    ? selectRow(
        runtime,
        { total: 'int' },
        matchSearch(app.db().select('COUNT(*) AS total').from(SONGS.name)),
      ).total
    : null;

  const matched = runtime.arrayOf(new runtime.Record(songsCollection));
  // 곡 목록이 쓰는 필드만 고른다. collectionId 와 collectionName 은 열이 아니라 컬렉션에서 따라온다.
  matchSearch(
    app.recordQuery(songsCollection).select(
      ...columns(
        SONGS,
        SONG_LIST_FIELDS.filter((field) => field !== 'collectionId' && field !== 'collectionName'),
      ),
    ),
  )
    .orderBy(...search.orderBy)
    .limit(search.limit + 1)
    .all(matched);
  const songs = matched.slice(0, search.limit);
  const hasMore = matched.length > search.limit;
  if (songs.length === 0) {
    return {
      totalItems,
      songs,
      chartsBySong: new Map(),
      hasMore,
    };
  }

  const charts = runtime.arrayOf(new runtime.Record(chartsCollection));
  // 목록에 필요한 열만 읽어 채보 data 열은 읽지 않는다.
  app
    .recordQuery(chartsCollection)
    .select(
      column(CHARTS, 'id'),
      column(CHARTS, 'song'),
      column(CHARTS, 'difficulty'),
      column(CHARTS, 'laneCount'),
    )
    .where(dbx.in(column(CHARTS, 'song'), ...songs.map((song) => song.id)))
    .all(charts);
  const chartsBySong = new Map<string, SongSearchChart[]>();
  charts.forEach((chart) => {
    const songId = chart.getString('song');
    const songCharts = chartsBySong.get(songId) ?? [];
    songCharts.push({
      id: chart.id,
      difficulty: chart.getString('difficulty'),
      laneCount: chart.getInt('laneCount'),
    });
    chartsBySong.set(songId, songCharts);
  });
  return {
    totalItems,
    songs,
    chartsBySong,
    hasMore,
  };
}

export function readChartSong(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>,
  app: DbApp,
  songId: string,
): { key: string; gameStartMs: number; gameEndMs: number } | undefined {
  const { dbx } = runtime;
  const [song] = selectRows(
    runtime,
    {
      key: 'text',
      gameStartMs: 'float',
      gameEndMs: 'float',
    },
    app
      .db()
      .select(...columns(SONGS, ['key', 'gameStartMs', 'gameEndMs']))
      .from(SONGS.name)
      .where(dbx.hashExp({ [column(SONGS, 'id')]: songId }))
      .limit(1),
  );
  return song;
}

export function readChartRevision(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>,
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
      .where(dbx.hashExp({ [column(CHARTS, 'id')]: chartId }))
      .limit(1),
  );
  return chart?.revision;
}
