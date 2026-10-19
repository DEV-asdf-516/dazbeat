import { InvalidChartError, parseChart } from '../../src/data/chartSchema.js';
import { InvalidPlaySubmissionError, parsePlaySubmission } from '../../src/data/playSubmission.js';
import { getPlayDurationMs } from '../../src/rhythm/playTiming.js';
import { replayGameplay } from '../../src/rhythm/replay.js';
import type { Difficulty, FinishedGameplayResult } from '../../src/rhythm/types.js';

/** 로딩·버퍼링·일시정지를 허용하는, 플레이 길이 이후의 세션 유효 시간. */
export const SESSION_GRACE_MS = 15 * 60 * 1000;
/** 세션은 플레이 시작 전에 발급되므로 정상 플레이는 플레이 길이 이상 걸린다. 10% 는 발급 지연 허용. */
export const MIN_PLAY_ELAPSED_RATIO = 0.9;

export interface VerificationSong {
  key: string;
  gameStartMs: number;
  gameEndMs: number;
}

export type PlayRejectionCode =
  | 'session_expired'
  | 'chart_changed'
  | 'chart_invalid'
  | 'too_short'
  | 'invalid_events'
  | 'not_finished';

export const PLAY_REJECTION_RESPONSES: Record<
  PlayRejectionCode,
  { status: number; message: string }
> = {
  session_expired: {
    status: 410,
    message: 'The play session has expired.',
  },
  chart_changed: {
    status: 409,
    message: 'The chart has changed since the play session was issued.',
  },
  chart_invalid: {
    status: 500,
    message: 'The stored chart is invalid.',
  },
  too_short: {
    status: 422,
    message: 'The result was submitted sooner than the play could finish.',
  },
  invalid_events: {
    status: 400,
    message: 'The submitted input events are invalid.',
  },
  not_finished: {
    status: 422,
    message: 'The replayed play did not finish.',
  },
};

export type PlayVerification =
  | { kind: 'verified'; result: FinishedGameplayResult }
  | { kind: 'rejected'; code: PlayRejectionCode };

export interface PlayVerificationInput {
  song: VerificationSong;
  difficulty: Difficulty;
  chart: { revision: string; data: unknown };
  session: { chartRevision: string; issuedAtMs: number; expiresAtMs: number };
  submission: unknown;
  nowMs: number;
}

function getSongPlayDurationMs(song: VerificationSong): number {
  return getPlayDurationMs(song.gameStartMs, song.gameEndMs);
}

export function getSessionExpiresAtMs(song: VerificationSong, issuedAtMs: number): number {
  return issuedAtMs + getSongPlayDurationMs(song) + SESSION_GRACE_MS;
}

function rejected(code: PlayRejectionCode): PlayVerification {
  return {
    kind: 'rejected',
    code,
  };
}

export function verifyPlay(input: PlayVerificationInput): PlayVerification {
  const { song, difficulty, chart, session, submission, nowMs } = input;
  if (nowMs > session.expiresAtMs) {
    return rejected('session_expired');
  }
  if (chart.revision !== session.chartRevision) {
    return rejected('chart_changed');
  }
  try {
    const parsedChart = parseChart(
      chart.data,
      {
        id: song.key,
        gameStartMs: song.gameStartMs,
        gameEndMs: song.gameEndMs,
      },
      difficulty,
    );
    if (nowMs - session.issuedAtMs < MIN_PLAY_ELAPSED_RATIO * getSongPlayDurationMs(song)) {
      return rejected('too_short');
    }
    const { events } = parsePlaySubmission(submission, song, parsedChart);
    const result = replayGameplay(parsedChart, events);
    if (result.outcome === 'failed') {
      return rejected('not_finished');
    }
    return {
      kind: 'verified',
      result,
    };
  } catch (error) {
    if (error instanceof InvalidChartError) {
      return rejected('chart_invalid');
    }
    if (error instanceof InvalidPlaySubmissionError) {
      return rejected('invalid_events');
    }
    throw error;
  }
}
