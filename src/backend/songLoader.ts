import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { z } from 'zod';
import { toParseIssue } from '../data/parseIssue.js';
import { DIFFICULTIES, SONG_CATEGORIES, ZODIACS } from '../data/songs.js';
import type { Song, SongBatch, SongBatchCursor, SongQuery } from '../data/songs.js';
import { isFiniteNumber, isOneOf, isString } from '../typeGuards.js';
import { readRecordField } from './recordField.js';

const SONG_BATCH_SIZE = 100;

const isCategory = isOneOf(SONG_CATEGORIES);
const isZodiac = isOneOf(ZODIACS);

type ChartIds = Song['chartIds'];

const chartRecord = z.object({
  id: z.string(),
  difficulty: z.enum(DIFFICULTIES),
});

// 차트가 없는 곡은 PocketBase 가 expand 나 charts_via_song 을 빼고 보낸다.
const chartsExpand = z.object({ charts_via_song: z.array(chartRecord).optional() }).optional();

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

export async function loadSongBatch(
  pb: PocketBase,
  query: SongQuery,
  after: SongBatchCursor | null,
): Promise<SongBatch> {
  // 사용자 검색어가 식에 들어가므로 모든 값은 pb.filter 로 바인딩한다.
  const conditions = [
    ...(query.category === 'all'
      ? []
      : [pb.filter('category = {:category}', { category: query.category })]),
    ...(query.title === '' ? [] : [pb.filter('title ~ {:title}', { title: query.title })]),
    ...(after === null
      ? []
      : [
          pb.filter(
            '(releasedOn < {:releasedOn} || (releasedOn = {:releasedOn} && id < {:recordId}))',
            { ...after },
          ),
        ]),
  ];
  const { items: songRecords } = await pb.collection('songs').getList(1, SONG_BATCH_SIZE, {
    sort: '-releasedOn,-id',
    skipTotal: true,
    expand: 'charts_via_song',
    fields: '*,expand.charts_via_song.id,expand.charts_via_song.difficulty',
    ...(conditions.length === 0 ? {} : { filter: conditions.join(' && ') }),
  });
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
