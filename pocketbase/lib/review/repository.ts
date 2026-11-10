import { DIFFICULTIES, ZODIACS } from '../../../src/data/songs.js';
import type { Zodiac } from '../../../src/data/songs.js';
import { parseJson } from '../../../src/json.js';
import { PLAY_RESULTS, PLAY_REVIEWS } from '../../../src/pbCollections.js';
import { where } from '../../../src/pbQuery.js';
import { LANE_COUNTS } from '../../../src/rhythm/lanes.js';
import type {
  Difficulty,
  FinishedGameplayResult,
  JudgmentCounts,
  LaneCount,
} from '../../../src/rhythm/types.js';
import { isFiniteNumber, isRecord } from '../../../src/typeGuards.js';
import { saveRecord } from '../achievement/repository.js';
import { parseOneOf } from '../jsvm.js';
import type { JsvmApp, JsvmRecord, JsvmRuntime } from '../jsvm.js';
import type { AutoplayCheck, AutoplayReason, InputStats } from '../session/service/verify.js';
import type { ReviewDecision, ReviewStatus } from './dto.js';

export interface PlayResultFields {
  readonly user: string;
  readonly session: string;
  readonly song: string;
  readonly chart: string;
  readonly difficulty: Difficulty;
  readonly laneCount: LaneCount;
  readonly chartRevision: string;
  readonly constellation: Zodiac;
  readonly score: number;
  readonly accuracy: number;
  readonly maxCombo: number;
  readonly counts: FinishedGameplayResult['counts'];
  readonly cleared: boolean;
  readonly autoplayCheck: AutoplayCheck['kind'];
  readonly autoplayReasons: readonly AutoplayReason[];
  readonly inputStats: InputStats;
  readonly reviewStatus: ReviewStatus;
  readonly achievedAtMs: number;
}

export function savePlayResult(
  runtime: JsvmRuntime,
  tx: JsvmApp,
  fields: PlayResultFields,
): string {
  const { achievedAtMs, ...stored } = fields;
  return saveRecord(runtime, tx, PLAY_RESULTS.name, {
    ...stored,
    achievedAt: new Date(achievedAtMs).toISOString(),
  }).id;
}

function readStoredNumber(stored: Record<string, unknown>, field: string): number {
  const value = stored[field];
  if (!isFiniteNumber(value)) {
    throw new Error(`Invalid stored number: ${field}`);
  }
  return value;
}

function parseCounts(text: string): JudgmentCounts {
  const counts = parseJson(text);
  // 이 서버가 저장한 JSON 열이라 형식이 다르면 개발 오류다.
  if (!isRecord(counts)) {
    throw new Error(`Invalid stored counts: ${text}`);
  }
  return {
    perfect: readStoredNumber(counts, 'perfect'),
    great: readStoredNumber(counts, 'great'),
    good: readStoredNumber(counts, 'good'),
    bad: readStoredNumber(counts, 'bad'),
    miss: readStoredNumber(counts, 'miss'),
  };
}

export function parsePlayResultRecord(record: JsvmRecord) {
  return {
    userId: record.getString('user'),
    song: {
      id: record.getString('song'),
      constellation: parseOneOf(
        ZODIACS,
        'Unknown constellation',
        record.getString('constellation'),
      ),
    },
    chart: {
      id: record.getString('chart'),
      difficulty: parseOneOf(DIFFICULTIES, 'Unknown difficulty', record.getString('difficulty')),
      laneCount: parseOneOf(LANE_COUNTS, 'Unknown lane count', record.getInt('laneCount')),
    },
    chartRevision: record.getString('chartRevision'),
    result: {
      score: record.getFloat('score'),
      accuracy: record.getFloat('accuracy'),
      maxCombo: record.getInt('maxCombo'),
      counts: parseCounts(record.getString('counts')),
      cleared: record.getBool('cleared'),
    },
    achievedAtMs: record.getDateTime('achievedAt').time().unixMilli(),
  };
}

export function findPlayResultRecord(tx: JsvmApp, id: string): JsvmRecord | undefined {
  const filter = where(PLAY_RESULTS, [{ id }]);
  return tx.findRecordsByFilter(PLAY_RESULTS.name, filter.expression, '', 1, 0, filter.params)[0];
}

export function savePlayReview(
  runtime: JsvmRuntime,
  tx: JsvmApp,
  review: {
    readonly playResult: string;
    readonly decision: ReviewDecision;
    readonly reviewerId: string;
    readonly reviewerEmail: string;
    readonly note: string;
  },
): void {
  saveRecord(runtime, tx, PLAY_REVIEWS.name, review);
}
