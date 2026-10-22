import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { z } from 'zod';
import { toParseIssue } from '../data/parseIssue.js';
import { DIFFICULTIES, SONG_CATEGORIES, ZODIACS } from '../data/songs.js';
import type { Song, SongBatch, SongBatchCursor, SongQuery } from '../data/songs.js';
import { CHARTS, SONGS } from '../pbCollections.js';
import { after, backRelation, desc, select, sort, where } from '../pbQuery.js';
import { isFiniteNumber, isOneOf, isString } from '../typeGuards.js';
import { readRecordField } from './recordField.js';

const SONG_BATCH_SIZE = 100;
const SONG_ORDER = [desc('releasedOn'), desc('id')];
const SONG_CHARTS = backRelation(CHARTS, 'song', ['id', 'difficulty']);
const SONG_SEARCH_PATH = '/api/dazbeat/songs/search';

const isCategory = isOneOf(SONG_CATEGORIES);
const isZodiac = isOneOf(ZODIACS);

type ChartIds = Song['chartIds'];

const chartRecord = z.object({
  id: z.string(),
  difficulty: z.enum(DIFFICULTIES),
});

// 차트가 없는 곡은 PocketBase 가 expand 나 charts_via_song 을 빼고 보낸다.
const chartsExpand = z.object({ [SONG_CHARTS.name]: z.array(chartRecord).optional() }).optional();

const songSearchResponse = z.object({
  items: z.array(
    z.looseObject({
      id: z.string(),
      collectionId: z.string(),
      collectionName: z.string(),
    }),
  ),
});

function isCredit(value: unknown): value is string[] | null {
  return value === null || (Array.isArray(value) && value.every(isString));
}

function readChartIds(record: RecordModel): ChartIds {
  const result = chartsExpand.safeParse(record.expand);
  if (!result.success) {
    const { path, reason } = toParseIssue(result.error, 'expand');
    throw new Error(`Invalid songs record ${record.id}: ${path} ${reason}`);
  }
  const chartIds: ChartIds = {};
  (result.data?.charts_via_song ?? []).forEach(({ id, difficulty }) => {
    chartIds[difficulty] = id;
  });
  return chartIds;
}

function toSong(pb: PocketBase, record: RecordModel): Song {
  const visualTheme = readRecordField(record, 'songs', 'visualTheme', isString);
  const credit = readRecordField(record, 'songs', 'credit', isCredit);
  return {
    id: readRecordField(record, 'songs', 'key', isString),
    title: readRecordField(record, 'songs', 'title', isString),
    category: readRecordField(record, 'songs', 'category', isCategory),
    youtubeVideoId: readRecordField(record, 'songs', 'youtubeVideoId', isString),
    jacketUrl: pb.files.getURL(record, readRecordField(record, 'songs', 'jacket', isString)),
    accentColor: readRecordField(record, 'songs', 'accentColor', isFiniteNumber),
    constellation: readRecordField(record, 'songs', 'constellation', isZodiac),
    gameStartMs: readRecordField(record, 'songs', 'gameStartMs', isFiniteNumber),
    gameEndMs: readRecordField(record, 'songs', 'gameEndMs', isFiniteNumber),
    chartIds: readChartIds(record),
    ...(visualTheme === '' ? {} : { visualTheme }),
    ...(credit === null ? {} : { credit }),
  };
}

async function listSongRecords(
  pb: PocketBase,
  query: SongQuery,
  cursor: SongBatchCursor | null,
): Promise<RecordModel[]> {
  const filter = where(SONGS, [
    query.category === 'all' ? null : { category: query.category },
    cursor === null
      ? null
      : after(SONG_ORDER, {
          releasedOn: cursor.releasedOn,
          id: cursor.recordId,
        }),
  ]);
  const { items } = await pb.collection(SONGS.name).getList(1, SONG_BATCH_SIZE, {
    sort: sort(SONGS, SONG_ORDER),
    skipTotal: true,
    requestKey: null,
    ...select(SONGS, '*', [SONG_CHARTS]),
    ...(filter === null ? {} : { filter: pb.filter(filter.expression, filter.params) }),
  });
  return items;
}

async function searchSongRecords(
  pb: PocketBase,
  query: SongQuery,
  cursor: SongBatchCursor | null,
): Promise<RecordModel[]> {
  const response = await pb.send<unknown>(SONG_SEARCH_PATH, {
    method: 'GET',
    requestKey: null,
    query: {
      title: query.title,
      ...(query.category === 'all' ? {} : { category: query.category }),
      ...(cursor === null
        ? {}
        : {
            afterReleasedOn: cursor.releasedOn,
            afterId: cursor.recordId,
          }),
    },
  });
  const result = songSearchResponse.safeParse(response);
  if (!result.success) {
    const { path, reason } = toParseIssue(result.error, 'response');
    throw new Error(`Invalid songs search response: ${path} ${reason}`);
  }
  return result.data.items;
}

export async function loadSongBatch(
  pb: PocketBase,
  query: SongQuery,
  cursor: SongBatchCursor | null,
): Promise<SongBatch> {
  // SDK 자동 취소는 같은 경로의 다른 feed 요청까지 취소하므로 두 경로 모두 끈다.
  const songRecords =
    query.title === ''
      ? await listSongRecords(pb, query, cursor)
      : await searchSongRecords(pb, query, cursor);
  const last = songRecords.at(-1);
  if (last === undefined) {
    return {
      songs: [],
      next: null,
    };
  }
  return {
    songs: songRecords.map((record) => toSong(pb, record)),
    next:
      songRecords.length === SONG_BATCH_SIZE
        ? {
            releasedOn: readRecordField(last, 'songs', 'releasedOn', isString),
            recordId: last.id,
          }
        : null,
  };
}
