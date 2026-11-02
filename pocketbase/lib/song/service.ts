import { InvalidChartError, parseChart } from '../../../src/data/chartSchema.js';
import { parseJson } from '../../../src/json.js';
import type { DbApp, JsvmRuntime } from '../jsvm.js';
import { InvalidChartSaveError } from './dto.js';
import type { ChartRecord } from './dto.js';
import { readChartRevision, readChartSong } from './repository.js';

export function checkChartRecord(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>,
  app: DbApp,
  record: ChartRecord,
): void {
  const song = readChartSong(runtime, app, record.song);
  if (song === undefined) {
    throw new InvalidChartSaveError('invalid_chart', 'The chart song does not exist.');
  }
  try {
    parseChart(
      parseJson(record.data),
      {
        id: song.key,
        gameStartMs: song.gameStartMs,
        gameEndMs: song.gameEndMs,
      },
      record.difficulty,
      record.laneCount,
    );
  } catch (error) {
    if (error instanceof InvalidChartError) {
      throw new InvalidChartSaveError('invalid_chart', error.message);
    }
    throw error;
  }
}

export type ChartRevisionDecision =
  { readonly kind: 'current' } | { readonly kind: 'conflict'; readonly message: string };

export function decideChartRevision(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>,
  tx: DbApp,
  chartId: string,
  baseRevision: string,
): ChartRevisionDecision {
  return readChartRevision(runtime, tx, chartId) === baseRevision
    ? { kind: 'current' }
    : {
        kind: 'conflict',
        message: 'The chart was saved by someone else since it was loaded.',
      };
}
