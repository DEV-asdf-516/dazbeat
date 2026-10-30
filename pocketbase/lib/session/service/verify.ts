import { InvalidChartError, parseChart } from '../../../../src/data/chartSchema.js';
import {
  InvalidPlaySubmissionError,
  parsePlaySubmission,
} from '../../../../src/data/playSubmission.js';
import { getDistance, getProgress } from '../../../../src/range.js';
import { getPlayDurationMs } from '../../../../src/rhythm/playTiming.js';
import { replayGameplay } from '../../../../src/rhythm/replay.js';
import type { ReplayHit } from '../../../../src/rhythm/replay.js';
import type {
  Difficulty,
  FinishedGameplayResult,
  LaneCount,
} from '../../../../src/rhythm/types.js';
import type { PlayRejectionCode, VerificationSong } from '../dto.js';

/** 세션은 플레이 시작 전에 발급되므로 정상 플레이는 플레이 길이 이상 걸린다. 10% 는 발급 지연 허용. */
export const MIN_PLAY_ELAPSED_RATIO = 0.9;

export type PlayVerification =
  | { kind: 'verified'; result: FinishedGameplayResult; autoplayCheck: AutoplayCheck }
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
    const elapsedMs = nowMs - session.issuedAtMs;
    const minElapsedMs =
      MIN_PLAY_ELAPSED_RATIO * getPlayDurationMs(song.gameStartMs, song.gameEndMs);
    if (elapsedMs < minElapsedMs) {
      return rejected('too_short');
    }
    const { events } = parsePlaySubmission(submission, song, parsedChart);
    const { result, hits } = replayGameplay(parsedChart, events);
    if (result.outcome === 'failed') {
      return rejected('not_finished');
    }
    return {
      kind: 'verified',
      result,
      autoplayCheck: checkAutoplay(hits),
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

export type AutoplayReason = 'low_std_dev' | 'zero_cluster' | 'synced_chords';

export interface InputStats {
  sampleCount: number;
  chordCount: number;
  meanOffsetMs: number | null;
  stdDevMs: number | null;
  nearZeroRatio: number | null;
  syncedChordRatio: number | null;
}

export type AutoplayCheck =
  | { kind: 'unjudged' | 'clear'; stats: InputStats; reasons: readonly [] }
  | {
      kind: 'suspicious';
      stats: InputStats;
      reasons: readonly [AutoplayReason, ...AutoplayReason[]];
    };

// 실제 플레이 데이터 없이 정한 보수적인 처음 값이다. 기록된 inputStats 를 보고 다시 정한다.
const AUTOPLAY_THRESHOLDS = {
  minSampleCount: 50,
  minChordCount: 10,
  nearZeroMs: 1,
  syncedChordSpreadMs: 1,
  maxStdDevMs: 2,
  minNearZeroRatio: 0.5,
  minSyncedChordRatio: 0.95,
};

function getRatio(count: number, total: number): number | null {
  return total === 0 ? null : getProgress(count, 0, total);
}

export function checkAutoplay(hits: readonly ReplayHit[]): AutoplayCheck {
  const sampleCount = hits.length;
  const chords = new Map<
    number,
    { minInputTimeMs: number; maxInputTimeMs: number; count: number }
  >();
  let offsetSumMs = 0;
  let nearZeroCount = 0;
  for (const { noteTimeMs, inputTimeMs } of hits) {
    offsetSumMs += inputTimeMs - noteTimeMs;
    if (getDistance(inputTimeMs, noteTimeMs) <= AUTOPLAY_THRESHOLDS.nearZeroMs) {
      nearZeroCount++;
    }
    const chord = chords.get(noteTimeMs);
    if (chord === undefined) {
      chords.set(noteTimeMs, {
        minInputTimeMs: inputTimeMs,
        maxInputTimeMs: inputTimeMs,
        count: 1,
      });
    } else {
      chord.minInputTimeMs = Math.min(chord.minInputTimeMs, inputTimeMs);
      chord.maxInputTimeMs = Math.max(chord.maxInputTimeMs, inputTimeMs);
      chord.count++;
    }
  }

  let chordCount = 0;
  let syncedChordCount = 0;
  for (const { minInputTimeMs, maxInputTimeMs, count } of chords.values()) {
    if (count < 2) {
      continue;
    }
    chordCount++;
    if (getDistance(maxInputTimeMs, minInputTimeMs) <= AUTOPLAY_THRESHOLDS.syncedChordSpreadMs) {
      syncedChordCount++;
    }
  }

  const meanOffsetMs = sampleCount === 0 ? null : offsetSumMs / sampleCount;
  let squaredDeviationSumMs = 0;
  let stdDevMs: number | null = null;
  if (meanOffsetMs !== null) {
    for (const { noteTimeMs, inputTimeMs } of hits) {
      squaredDeviationSumMs += (inputTimeMs - noteTimeMs - meanOffsetMs) ** 2;
    }
    stdDevMs = Math.sqrt(squaredDeviationSumMs / sampleCount);
  }
  const stats: InputStats = {
    sampleCount,
    chordCount,
    meanOffsetMs,
    stdDevMs,
    nearZeroRatio: getRatio(nearZeroCount, sampleCount),
    syncedChordRatio: getRatio(syncedChordCount, chordCount),
  };

  if (sampleCount < AUTOPLAY_THRESHOLDS.minSampleCount) {
    return {
      kind: 'unjudged',
      stats,
      reasons: [],
    };
  }
  const reasons: AutoplayReason[] = [];
  if (squaredDeviationSumMs <= sampleCount * AUTOPLAY_THRESHOLDS.maxStdDevMs ** 2) {
    reasons.push('low_std_dev');
  }
  if (nearZeroCount >= sampleCount * AUTOPLAY_THRESHOLDS.minNearZeroRatio) {
    reasons.push('zero_cluster');
  }
  if (
    chordCount >= AUTOPLAY_THRESHOLDS.minChordCount &&
    syncedChordCount >= chordCount * AUTOPLAY_THRESHOLDS.minSyncedChordRatio
  ) {
    reasons.push('synced_chords');
  }
  const [firstReason, ...otherReasons] = reasons;
  return firstReason === undefined
    ? {
        kind: 'clear',
        stats,
        reasons: [],
      }
    : {
        kind: 'suspicious',
        stats,
        reasons: [firstReason, ...otherReasons],
      };
}
