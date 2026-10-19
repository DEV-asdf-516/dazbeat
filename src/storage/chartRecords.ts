import type { Difficulty, FinishedGameplayResult } from '../rhythm/types.js';
import { isBoolean, isFiniteNumber, isRecord } from '../typeGuards.js';

export interface ChartRecord {
  score: number;
  accuracy: number;
  maxCombo: number;
  cleared: boolean;
}

export type ChartRecords = ReadonlyMap<string, ChartRecord>;

export function recordKey(songId: string, difficulty: Difficulty): string {
  return `${songId}/${difficulty}`;
}

export function parseChartRecord(value: unknown): ChartRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { score, accuracy, maxCombo, cleared } = value;
  return isFiniteNumber(score) &&
    isFiniteNumber(accuracy) &&
    isFiniteNumber(maxCombo) &&
    isBoolean(cleared)
    ? {
        score,
        accuracy,
        maxCombo,
        cleared,
      }
    : undefined;
}

export function getChartRecord(
  records: ChartRecords,
  songId: string,
  difficulty: Difficulty,
): ChartRecord | null {
  return records.get(recordKey(songId, difficulty)) ?? null;
}

export function mergeBestRecord(
  existing: ChartRecord | undefined,
  result: FinishedGameplayResult,
): ChartRecord {
  if (existing === undefined) {
    const { score, accuracy, maxCombo, cleared } = result;
    return {
      score,
      accuracy,
      maxCombo,
      cleared,
    };
  }
  return {
    score: Math.max(existing.score, result.score),
    accuracy: Math.max(existing.accuracy, result.accuracy),
    maxCombo: Math.max(existing.maxCombo, result.maxCombo),
    cleared: existing.cleared || result.cleared,
  };
}
