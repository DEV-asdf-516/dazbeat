import { InvalidChartError, parseChart } from '../../src/data/chartSchema.js';
import { InvalidPlaySubmissionError, parsePlaySubmission } from '../../src/data/playSubmission.js';
import { getPlayDurationMs } from '../../src/rhythm/playTiming.js';
import { replayGameplay } from '../../src/rhythm/replay.js';
import type { Difficulty, FinishedGameplayResult, LaneCount } from '../../src/rhythm/types.js';
import { HTTP_STATUS } from '../../src/httpStatus.js';
import { secToMs } from '../../src/time.js';

/**
 * 플레이 길이 이후의 세션 유효 시간. 일시정지가 길다고 판을 무효로 만들지 않도록 넉넉히 두고,
 * 세션을 몰아 두는 남용은 발급 때 이전 세션을 지우는 사용자당 활성 세션 1개 규칙이 막는다.
 */
export const SESSION_GRACE_MS = secToMs(12 * 60 * 60);
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
    status: HTTP_STATUS.gone,
    message: 'The play session has expired.',
  },
  chart_changed: {
    status: HTTP_STATUS.conflict,
    message: 'The chart has changed since the play session was issued.',
  },
  chart_invalid: {
    status: HTTP_STATUS.internalServerError,
    message: 'The stored chart is invalid.',
  },
  too_short: {
    status: HTTP_STATUS.unprocessableContent,
    message: 'The result was submitted sooner than the play could finish.',
  },
  invalid_events: {
    status: HTTP_STATUS.badRequest,
    message: 'The submitted input events are invalid.',
  },
  not_finished: {
    status: HTTP_STATUS.unprocessableContent,
    message: 'The replayed play did not finish.',
  },
};

export type PlayVerification =
  | { kind: 'verified'; result: FinishedGameplayResult }
  | { kind: 'rejected'; code: PlayRejectionCode };

export interface PlayVerificationInput {
  song: VerificationSong;
  difficulty: Difficulty;
  /** 차트 레코드의 레인 수. 스냅샷 JSON 의 값이 아니라 이 값을 기대값으로 파싱해 둘의 불일치를 거부한다. */
  laneCount: LaneCount;
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
  const { song, difficulty, laneCount, chart, session, submission, nowMs } = input;
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
      laneCount,
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
