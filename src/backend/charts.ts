import { ClientResponseError } from 'pocketbase';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { parseChart } from '../data/chartSchema.js';
import type { ChartRef, Song } from '../data/songs.js';
import { HTTP_STATUS } from '../httpStatus.js';
import { CHARTS, SONGS } from '../pbCollections.js';
import { select, where } from '../pbQuery.js';
import type { Chart, Difficulty, LaneCount } from '../rhythm/types.js';
import { isString } from '../typeGuards.js';
import { readRecordField } from './recordField.js';

export interface LoadedChart {
  chart: Chart;
  revision: string;
}

export type SaveChartResult =
  | { readonly kind: 'saved'; readonly chartId: string; readonly loaded: LoadedChart }
  | { readonly kind: 'conflict' };

function parseLoadedChartRecord(
  record: RecordModel,
  song: Song,
  difficulty: Difficulty,
  laneCount: LaneCount,
): LoadedChart {
  const data: unknown = record['data'];
  return {
    chart: parseChart(data, song, difficulty, laneCount),
    revision: readRecordField(record, 'charts', 'revision', isString),
  };
}

export async function loadChart(pb: PocketBase, ref: ChartRef): Promise<LoadedChart> {
  const record = await pb
    .collection('charts')
    .getOne(ref.chartId, select(CHARTS, ['data', 'revision']));
  return parseLoadedChartRecord(record, ref.song, ref.difficulty, ref.laneCount);
}

export async function saveChart(
  pb: PocketBase,
  song: Song,
  chart: Chart,
  baseRevision: string | null,
): Promise<SaveChartResult> {
  const chartId = song.chartIds[chart.laneCount]?.[chart.difficulty];
  if (chartId !== undefined) {
    if (baseRevision === null) {
      throw new Error('Updating a saved chart requires the revision it was loaded with.');
    }
    try {
      const updated = await pb.collection('charts').update(chartId, {
        data: chart,
        baseRevision,
      });
      return {
        kind: 'saved',
        chartId,
        loaded: parseLoadedChartRecord(updated, song, chart.difficulty, chart.laneCount),
      };
    } catch (error) {
      // 다른 곳에서 먼저 저장해 기준 revision 이 낡았다.
      if (error instanceof ClientResponseError && error.status === HTTP_STATUS.conflict) {
        return { kind: 'conflict' };
      }
      throw error;
    }
  }
  const songFilter = where(SONGS, [{ key: song.id }]);
  const songRecord = await pb
    .collection(SONGS.name)
    .getFirstListItem(pb.filter(songFilter.expression, songFilter.params), select(SONGS, ['id']));
  const created = await pb.collection('charts').create({
    song: readRecordField(songRecord, 'songs', 'id', isString),
    difficulty: chart.difficulty,
    laneCount: chart.laneCount,
    data: chart,
  });
  return {
    kind: 'saved',
    chartId: readRecordField(created, 'charts', 'id', isString),
    loaded: parseLoadedChartRecord(created, song, chart.difficulty, chart.laneCount),
  };
}
