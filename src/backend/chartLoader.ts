import type PocketBase from 'pocketbase';
import { parseChart } from '../data/chartSchema.js';
import type { Song } from '../data/songs.js';
import type { Chart, Difficulty } from '../rhythm/types.js';
import { isString, readRecordField } from './recordField.js';

export async function loadChart(
  pb: PocketBase,
  song: Song,
  difficulty: Difficulty,
): Promise<Chart> {
  const chartId = song.chartIds[difficulty];
  if (chartId === undefined) {
    throw new Error(`No chart for song ${song.id} difficulty ${difficulty}`);
  }
  const record = await pb.collection('charts').getOne(chartId, { fields: 'data' });
  const data: unknown = record.data;
  return parseChart(data, song, difficulty);
}

/** 검증된 chart 를 저장하고 그 chart record id 를 돌려준다. 난이도에 chart id 가 없을 때만 새로 만든다. */
export async function saveChart(pb: PocketBase, song: Song, chart: Chart): Promise<string> {
  const chartId = song.chartIds[chart.difficulty];
  if (chartId !== undefined) {
    await pb.collection('charts').update(chartId, { data: chart });
    return chartId;
  }
  const songRecord = await pb
    .collection('songs')
    .getFirstListItem(pb.filter('key = {:key}', { key: song.id }), { fields: 'id' });
  const created = await pb.collection('charts').create({
    song: readRecordField(songRecord, 'songs', 'id', isString),
    difficulty: chart.difficulty,
    data: chart,
  });
  return readRecordField(created, 'charts', 'id', isString);
}
