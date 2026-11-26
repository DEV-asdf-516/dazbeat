import type { Difficulty, FinishedGameplayResult, LaneCount } from '../rhythm/types.js';
import { isFiniteNumber, isRecord } from '../typeGuards.js';

export interface ChartRecord {
  score: number;
  accuracy: number;
  maxCombo: number;
}

export type ChartRecords = ReadonlyMap<string, ChartRecord>;

export function recordKey(songId: string, laneCount: LaneCount, difficulty: Difficulty): string {
  return `${songId}/${laneCount}k/${difficulty}`;
}

export function parseChartRecord(value: unknown): ChartRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { score, accuracy, maxCombo } = value;
  return isFiniteNumber(score) && isFiniteNumber(accuracy) && isFiniteNumber(maxCombo)
    ? {
        score,
        accuracy,
        maxCombo,
      }
    : undefined;
}

export function getChartRecord(
  records: ChartRecords,
  songId: string,
  laneCount: LaneCount,
  difficulty: Difficulty,
): ChartRecord | null {
  return records.get(recordKey(songId, laneCount, difficulty)) ?? null;
}

export function mergeBestRecord(
  existing: ChartRecord | undefined,
  result: FinishedGameplayResult,
): ChartRecord {
  const best = existing ?? result;
  return {
    score: Math.max(best.score, result.score),
    accuracy: Math.max(best.accuracy, result.accuracy),
    maxCombo: Math.max(best.maxCombo, result.maxCombo),
  };
}
