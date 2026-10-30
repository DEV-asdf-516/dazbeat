import { CHARTS, SONG_LIST_FIELDS, SONGS } from '../../../src/pbCollections.js';
import { collectionSpec } from '../../../src/pbQuery.js';
import type { CompiledFilter, FilterValue } from '../../../src/pbQuery.js';
import { column, columns } from '../../../src/pbSql.js';
import { selectRow } from '../jsvm.js';
import type { JsvmRecord, JsvmRuntime, QueryBuilderApp, SelectQuery } from '../jsvm.js';
import type { SongSearchChart, SongSearchPage, SongSearchRequest } from './dto.js';

const SONG_SEARCH_BATCH_SIZE = 100;
const SONGS_TITLE_FTS = collectionSpec('songs_title_fts', ['songId']);

export interface SongSearchQuery {
  /** 곡 레코드 쿼리에 붙일 조각. 제목을 FTS 로 찾을 때만 join 이 있다. */
  readonly join: { readonly table: string; readonly on: string } | null;
  readonly condition: string;
  readonly orderBy: readonly string[];
  readonly limit: number;
  readonly shouldCount: boolean;
  readonly params: Readonly<Record<string, FilterValue>>;
}

export function buildSongSearchQuery(request: SongSearchRequest): SongSearchQuery {
  const { title, category, cursor, scope } = request;
  const titleClause =
    title.kind === 'prefix'
      ? {
          join: null,
          // 패턴의 %, _, \ 는 이스케이프해 글자 그대로 찾는다.
          expression: `${column(SONGS, 'title')} LIKE {:titlePrefix} ESCAPE '\\'`,
          params: { titlePrefix: `${title.term.replace(/[\\%_]/g, (char) => `\\${char}`)}%` },
        }
      : {
          join: {
            table: SONGS_TITLE_FTS.name,
            on: `${column(SONGS_TITLE_FTS, 'songId')} = ${column(SONGS, 'id')}`,
          },
          expression: `${SONGS_TITLE_FTS.name} MATCH {:match}`,
          params: { match: `"${title.term.replace(/"/g, '""')}"` },
        };
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
          // 카테고리 인덱스는 그 카테고리 곡을 거의 다 읽게 되므로, 단항 + 로 막아 제목 인덱스를 쓰게 한다.
          expression: `+${column(SONGS, 'category')} = {:category}`,
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
  const { join } = titleClause;
  return {
    join,
    condition: clauses.map((clause) => clause.expression).join(' AND '),
    orderBy: [`${column(SONGS, 'releasedOn')} DESC`, `${column(SONGS, 'id')} DESC`],
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
  canRead: (record: JsvmRecord, rule: string | null) => boolean,
): SongSearchPage {
  const { dbx } = runtime;
  const songsCollection = app.findCachedCollectionByNameOrId('songs');
  // 목록과 개수는 같은 곡을 세야 하므로 같은 join 과 조건을 쓴다.
  const matchSearch = (query: SelectQuery) =>
    (search.join === null
      ? query
      : query.innerJoin(search.join.table, dbx.exp(search.join.on))
    ).andWhere(dbx.exp(search.condition, search.params));
  // 개수는 레코드별 list rule 없이 SQL 로 센다. 기본 범위는 공개 곡만, all 범위는 검색어를 해석할 때
  // 에디터와 superuser 에게만 허용하므로, 요청자가 볼 수 없는 곡의 수는 드러나지 않는다.
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
    .limit(search.limit)
    .all(matched);
  const songs = matched.filter((song) => canRead(song, songsCollection.listRule));
  // SQL limit 보다 짧은 페이지가 마지막이다.
  const hasMore = matched.length === search.limit;
  if (songs.length === 0) {
    return {
      totalItems,
      songs,
      chartsBySong: new Map(),
      hasMore,
    };
  }

  const chartsCollection = app.findCachedCollectionByNameOrId('charts');
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
  charts
    .filter((chart) => canRead(chart, chartsCollection.viewRule))
    .forEach((chart) => {
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
