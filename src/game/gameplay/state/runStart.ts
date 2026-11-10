import type { Song } from '../../../data/songs.js';
import type { Chart } from '../../../rhythm/types.js';
import type { PlayStart, ResultReport } from '../../app/sceneRoutes.js';

export interface RunSection {
  readonly chart: Chart;
  readonly gameStartMs: number;
  readonly report: ResultReport;
}

/** 시작 시각을 걸친 롱노트는 머리를 칠 수 없으므로 시작 전 노트와 함께 뺀다. */
export function getRunSection(
  start: PlayStart,
  chart: Chart,
  song: Pick<Song, 'gameStartMs' | 'gameEndMs'>,
): RunSection {
  switch (start.kind) {
    case 'whole':
      return {
        chart,
        gameStartMs: song.gameStartMs,
        report: { kind: 'graded' },
      };
    case 'from': {
      const notes = chart.notes.filter((note) => note.timeMs >= start.timeMs);
      return {
        chart: {
          ...chart,
          notes,
        },
        gameStartMs: start.timeMs - chart.offsetMs,
        report: {
          kind: 'section',
          startTimeMs: start.timeMs,
          endTimeMs: song.gameEndMs,
          noteCount: notes.length,
          totalNoteCount: chart.notes.length,
        },
      };
    }
  }
}
