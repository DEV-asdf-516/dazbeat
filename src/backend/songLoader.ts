import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { z } from 'zod';
import { toParseIssue } from '../data/parseIssue.js';
import { DIFFICULTIES, SONG_CATEGORIES, ZODIACS } from '../data/songs.js';
import type {
  ChartIds,
  Song,
  SongBatch,
  SongBatchCursor,
  SongQuery,
  SongScope,
} from '../data/songs.js';
import { CHARTS } from '../pbCollections.js';
import { backRelation } from '../pbQuery.js';
import { LANE_COUNTS } from '../rhythm/lanes.js';
import { isFiniteNumber, isOneOf, isString } from '../typeGuards.js';
import { readRecordField } from './recordField.js';

const SONG_CHARTS = backRelation(CHARTS, 'song', ['id', 'difficulty', 'laneCount']);
const SONG_SEARCH_PATH = '/api/dazbeat/songs/search';

const isCategory = isOneOf(SONG_CATEGORIES);
const isZodiac = isOneOf(ZODIACS);

const chartRecord = z.object({
  id: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  laneCount: z.literal(LANE_COUNTS),
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
  totalItems: z.number().nullable(),
  next: z
    .object({
      releasedOn: z.string(),
      recordId: z.string(),
    })
    .nullable(),
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
  (result.data?.charts_via_song ?? []).forEach(({ id, difficulty, laneCount }) => {
    chartIds[laneCount] = {
      ...chartIds[laneCount],
      [difficulty]: id,
    };
  });
  return chartIds;
}

function parseSongRecord(pb: PocketBase, record: RecordModel): Song {
  const credit = readRecordField(record, 'songs', 'credit', isCredit);
  const previewStartMs = readRecordField(record, 'songs', 'previewStartMs', isFiniteNumber);
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
    ...(previewStartMs === 0 ? {} : { previewStartMs }),
    ...(credit === null ? {} : { credit }),
  };
}

export async function loadSongBatch(
  pb: PocketBase,
  scope: SongScope,
  query: SongQuery,
  cursor: SongBatchCursor | null,
): Promise<SongBatch> {
  // SDK 자동 취소는 같은 경로의 다른 feed 요청까지 취소하므로 끈다.
  const response = await pb.send<unknown>(SONG_SEARCH_PATH, {
    method: 'GET',
    requestKey: null,
    query: {
      ...(query.title === '' ? {} : { title: query.title }),
      ...(query.category === 'all' ? {} : { category: query.category }),
      ...(scope === 'all' ? { scope: 'all' } : {}),
      afterReleasedOn: cursor?.releasedOn,
      afterId: cursor?.recordId,
    },
  });
  const result = songSearchResponse.safeParse(response);
  if (!result.success) {
    const { path, reason } = toParseIssue(result.error, 'response');
    throw new Error(`Invalid songs search response: ${path} ${reason}`);
  }
  return {
    songs: result.data.items.map((record) => parseSongRecord(pb, record)),
    next: result.data.next,
    totalCount: result.data.totalItems,
  };
}
