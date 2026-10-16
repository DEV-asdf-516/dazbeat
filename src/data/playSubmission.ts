import { z } from 'zod';
import { formatPath } from './chartSchema.js';
import type { Song } from './songs.js';
import { JUDGMENT_WINDOWS } from '../rhythm/judgment.js';
import { LANES } from '../rhythm/lanes.js';
import { getPlaybackStartMs, INPUT_OFFSET_RANGE_MS } from '../rhythm/playTiming.js';
import type { Chart, InputEvent } from '../rhythm/types.js';

export interface PlaySubmission {
  inputOffsetMs: number;
  events: readonly InputEvent[];
}

export interface VerifiedPlay {
  score: number;
  accuracy: number;
  maxCombo: number;
  cleared: boolean;
  bestScore: number;
}

/** 4레인 누르기+떼기로 정상 연타를 넘는 초당 이벤트 수. */
export const MAX_INPUT_EVENTS_PER_SECOND = 40;
/** 재생 리싱크로 판정 시계가 밀릴 수 있는 여유. */
export const EVENT_TIME_SLACK_MS = 1000;

const MS_PER_SECOND = 1000;

export class InvalidPlaySubmissionError extends Error {
  override readonly name = 'InvalidPlaySubmissionError';
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`Invalid play submission: ${path} ${reason}`);
    this.path = path;
  }
}

type SubmissionSong = Pick<Song, 'gameStartMs' | 'gameEndMs'>;

interface EventTimeRangeMs {
  minMs: number;
  maxMs: number;
}

const inputOffsetMs = z.number().min(INPUT_OFFSET_RANGE_MS.min).max(INPUT_OFFSET_RANGE_MS.max);

const inputEvent = z.strictObject({
  lane: z.literal(LANES),
  kind: z.enum(['press', 'release']),
  songTimeMs: z.number(),
});

// 이벤트 시각 범위와 개수 상한은 offset 에 따라 달라지므로 offset 만 먼저 확정한다.
const offsetSchema = z.object({ inputOffsetMs });

function getEventTimeRangeMs(
  song: SubmissionSong,
  chart: Chart,
  submittedOffsetMs: number,
): EventTimeRangeMs {
  const judgmentOffsetMs = submittedOffsetMs + chart.offsetMs;
  return {
    minMs: getPlaybackStartMs(song.gameStartMs) + judgmentOffsetMs - EVENT_TIME_SLACK_MS,
    maxMs:
      song.gameEndMs + Math.max(judgmentOffsetMs, JUDGMENT_WINDOWS.badMs) + EVENT_TIME_SLACK_MS,
  };
}

// 이벤트 단위 스키마로는 알 수 없는, 시각 범위와 이벤트 간 순서에 대한 조건.
function checkEventTimeline(
  events: readonly InputEvent[],
  range: EventTimeRangeMs,
  ctx: z.RefinementCtx,
): void {
  let previousTimeMs = Number.NEGATIVE_INFINITY;
  for (const [index, { songTimeMs }] of events.entries()) {
    const fail = (message: string): void => {
      ctx.addIssue({
        code: 'custom',
        path: ['events', index, 'songTimeMs'],
        message,
      });
    };
    if (songTimeMs < range.minMs) {
      fail(`is before ${range.minMs}`);
    } else if (songTimeMs > range.maxMs) {
      fail(`is after ${range.maxMs}`);
    } else if (songTimeMs < previousTimeMs) {
      fail('is not in songTimeMs non-decreasing order');
    }
    previousTimeMs = songTimeMs;
  }
}

function submissionSchema(range: EventTimeRangeMs) {
  const maxEvents = Math.ceil(
    ((range.maxMs - range.minMs) / MS_PER_SECOND) * MAX_INPUT_EVENTS_PER_SECOND,
  );
  return z
    .object({
      inputOffsetMs,
      events: z.array(inputEvent).max(maxEvents),
    })
    .superRefine((submission, ctx) => checkEventTimeline(submission.events, range, ctx));
}

function parseWith<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const [issue] = result.error.issues;
    throw new InvalidPlaySubmissionError(
      formatPath(issue?.path ?? [], 'submission'),
      issue?.message ?? 'is invalid',
    );
  }
  return result.data;
}

/** 제출 본문에서 입력 offset 과 입력 기록만 읽는다. 다른 필드(점수·판정 개수 등)는 결과에 들어가지 않는다. */
export function parsePlaySubmission(
  input: unknown,
  song: SubmissionSong,
  chart: Chart,
): PlaySubmission {
  const { inputOffsetMs: submittedOffsetMs } = parseWith(offsetSchema, input);
  return parseWith(submissionSchema(getEventTimeRangeMs(song, chart, submittedOffsetMs)), input);
}
