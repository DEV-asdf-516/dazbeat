import { z } from 'zod';
import type { Song } from './songs.js';
import { LANES } from '../rhythm/lanes.js';
import type { Chart, Difficulty, Note } from '../rhythm/types.js';

export class InvalidChartError extends Error {
  override readonly name = 'InvalidChartError';
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`Invalid chart: ${path} ${reason}`);
    this.path = path;
  }
}

export interface LoadedChart {
  chart: Chart;
  /** 랭킹 세션 발급 때 서버 채보와 같은지 확인하는 값. */
  revision: string;
}

// 채보 검증에 필요한 곡 정보만 받아, 시드·서버 검증도 전체 Song 없이 채보를 파싱할 수 있다.
type ChartSong = Pick<Song, 'id' | 'gameStartMs' | 'gameEndMs'>;

const lane = z.literal(LANES);

const note = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tap'), timeMs: z.number(), lane }),
  z
    .object({ type: z.literal('hold'), timeMs: z.number(), endTimeMs: z.number(), lane })
    .refine((hold) => hold.endTimeMs > hold.timeMs, {
      path: ['endTimeMs'],
      message: 'must be greater than timeMs',
    }),
]);

// 노트 단위 스키마로는 알 수 없는, 곡 구간·노트 간 관계에 대한 불변 조건.
function checkPlayableTimeline(
  notes: readonly Note[],
  song: ChartSong,
  ctx: z.RefinementCtx,
): void {
  const laneEndTimesMs = new Map<Note['lane'], number>();
  let previousTimeMs = Number.NEGATIVE_INFINITY;
  for (const [index, current] of notes.entries()) {
    const endMs = current.type === 'hold' ? current.endTimeMs : current.timeMs;
    const fail = (message: string): void => {
      ctx.addIssue({ code: 'custom', path: ['notes', index], message });
    };
    if (current.timeMs < song.gameStartMs) {
      fail('starts before gameStartMs');
    } else if (endMs > song.gameEndMs) {
      fail('ends after gameEndMs');
    } else if (current.timeMs < previousTimeMs) {
      fail('is not in timeMs non-decreasing order');
    } else if (current.timeMs <= (laneEndTimesMs.get(current.lane) ?? Number.NEGATIVE_INFINITY)) {
      fail(`overlaps the previous note in lane ${current.lane}`);
    }
    previousTimeMs = current.timeMs;
    laneEndTimesMs.set(current.lane, endMs);
  }
}

function chartSchema(song: ChartSong, difficulty: Difficulty) {
  return z
    .object({
      songId: z.literal(song.id),
      difficulty: z.literal(difficulty),
      offsetMs: z.number(),
      notes: z.array(note).min(1, 'must not be empty'),
    })
    .superRefine((chart, ctx) => checkPlayableTimeline(chart.notes, song, ctx));
}

export function formatPath(path: readonly PropertyKey[], rootName: string): string {
  return path.reduce<string>(
    (joined, key) => (typeof key === 'number' ? `${joined}[${key}]` : `${joined}.${String(key)}`),
    rootName,
  );
}

export function parseChart(input: unknown, song: ChartSong, difficulty: Difficulty): Chart {
  const result = chartSchema(song, difficulty).safeParse(input);
  if (!result.success) {
    const [issue] = result.error.issues;
    throw new InvalidChartError(
      formatPath(issue?.path ?? [], 'chart'),
      issue?.message ?? 'is invalid',
    );
  }
  return result.data;
}
