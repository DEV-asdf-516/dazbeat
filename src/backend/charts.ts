import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { parseChart } from '../data/chartSchema.js';
import type { ChartRef, Song } from '../data/songs.js';
import { CHARTS, SONGS } from '../pbCollections.js';
import { select, where } from '../pbQuery.js';
import type { Chart, Difficulty } from '../rhythm/types.js';
import { isString } from '../typeGuards.js';
import { readRecordField } from './recordField.js';

export interface LoadedChart {
  chart: Chart;
  revision: string;
}

export interface SavedChart {
  chartId: string;
  loaded: LoadedChart;
}

function toLoadedChart(record: RecordModel, song: Song, difficulty: Difficulty): LoadedChart {
  const data: unknown = record['data'];
  return {
    chart: parseChart(data, song, difficulty),
    revision: readRecordField(record, 'charts', 'revision', isString),
  };
}

export async function loadChart(pb: PocketBase, ref: ChartRef): Promise<LoadedChart> {
  const record = await pb
    .collection('charts')
    .getOne(ref.chartId, select(CHARTS, ['data', 'revision']));
  return toLoadedChart(record, ref.song, ref.difficulty);
}

export async function saveChart(pb: PocketBase, song: Song, chart: Chart): Promise<SavedChart> {
  const chartId = song.chartIds[chart.difficulty];
  if (chartId !== undefined) {
    const updated = await pb.collection('charts').update(chartId, { data: chart });
    return {
      chartId,
      loaded: toLoadedChart(updated, song, chart.difficulty),
    };
  }
  const songFilter = where(SONGS, [{ key: song.id }]);
  const songRecord = await pb
    .collection(SONGS.name)
    .getFirstListItem(pb.filter(songFilter.expression, songFilter.params), select(SONGS, ['id']));
  const created = await pb.collection('charts').create({
    song: readRecordField(songRecord, 'songs', 'id', isString),
    difficulty: chart.difficulty,
    data: chart,
  });
  return {
    chartId: readRecordField(created, 'charts', 'id', isString),
    loaded: toLoadedChart(created, song, chart.difficulty),
  };
}
