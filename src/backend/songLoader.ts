import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { DIFFICULTIES, SONG_CATEGORIES, ZODIACS } from '../data/songs.js';
import type { Song } from '../data/songs.js';
import { isFiniteNumber, isOneOf, isString } from '../typeGuards.js';
import { readRecordField } from './recordField.js';

const isCategory = isOneOf(SONG_CATEGORIES);
const isZodiac = isOneOf(ZODIACS);
const isDifficulty = isOneOf(DIFFICULTIES);

type ChartIds = Song['chartIds'];

function isCredit(value: unknown): value is string[] | null {
  return value === null || (Array.isArray(value) && value.every(isString));
}

function groupChartIds(records: readonly RecordModel[]): Map<string, ChartIds> {
  const chartIdsBySong = new Map<string, ChartIds>();
  records.forEach((record) => {
    const id = readRecordField(record, 'charts', 'id', isString);
    const songId = readRecordField(record, 'charts', 'song', isString);
    const difficulty = readRecordField(record, 'charts', 'difficulty', isDifficulty);
    const chartIds = chartIdsBySong.get(songId) ?? {};
    chartIds[difficulty] = id;
    chartIdsBySong.set(songId, chartIds);
  });
  return chartIdsBySong;
}

function toSong(pb: PocketBase, record: RecordModel, chartIds: ChartIds | undefined): Song {
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
    chartIds: { ...chartIds },
    ...(visualTheme === '' ? {} : { visualTheme }),
    ...(credit === null ? {} : { credit }),
  };
}

export async function loadSongs(pb: PocketBase): Promise<Song[]> {
  const [songRecords, chartRecords] = await Promise.all([
    pb.collection('songs').getFullList({ sort: 'created,key' }),
    pb.collection('charts').getFullList({ fields: 'id,song,difficulty' }),
  ]);
  const chartIdsBySong = groupChartIds(chartRecords);
  return songRecords.map((record) => toSong(pb, record, chartIdsBySong.get(record.id)));
}
