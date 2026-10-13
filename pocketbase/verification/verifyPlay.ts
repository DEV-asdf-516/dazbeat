import { InvalidChartError, parseChart } from '../../src/data/chartSchema.js';
import { InvalidPlaySubmissionError, parsePlaySubmission } from '../../src/data/playSubmission.js';
import { getPlayDurationMs } from '../../src/rhythm/playTiming.js';
import { replayGameplay } from '../../src/rhythm/replay.js';
import type { Chart, Difficulty, FinishedGameplayResult } from '../../src/rhythm/types.js';
import type { PlaySubmission } from '../../src/data/playSubmission.js';

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

export const PLAY_REJECTION_STATUS: Record<PlayRejectionCode, number> = {
  session_expired: 410,
  chart_changed: 409,
  chart_invalid: 500,
  too_short: 422,
  invalid_events: 400,
  not_finished: 422,
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
  return { kind: 'rejected', code };
}

/** 세션 정책·채보·제출 본문을 판정하고, 통과하면 입력 기록을 리플레이한 완주 결과를 돌려준다. */
export function verifyPlay(input: PlayVerificationInput): PlayVerification {
  const { song, difficulty, chart, session, submission, nowMs } = input;
  if (nowMs > session.expiresAtMs) {
    return rejected('session_expired');
  }
  if (chart.revision !== session.chartRevision) {
    return rejected('chart_changed');
  }
  let parsedChart: Chart;
  try {
    parsedChart = parseChart(
      chart.data,
      { id: song.key, gameStartMs: song.gameStartMs, gameEndMs: song.gameEndMs },
      difficulty,
    );
  } catch (error) {
    if (error instanceof InvalidChartError) {
      return rejected('chart_invalid');
    }
    throw error;
  }
  if (nowMs - session.issuedAtMs < MIN_PLAY_ELAPSED_RATIO * getSongPlayDurationMs(song)) {
    return rejected('too_short');
  }
  let parsedSubmission: PlaySubmission;
  try {
    parsedSubmission = parsePlaySubmission(submission, song, parsedChart);
  } catch (error) {
    if (error instanceof InvalidPlaySubmissionError) {
      return rejected('invalid_events');
    }
    throw error;
  }
  const result = replayGameplay(parsedChart, parsedSubmission.events);
  if (result.outcome === 'failed') {
    return rejected('not_finished');
  }
  return { kind: 'verified', result };
}
