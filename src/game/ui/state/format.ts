import type { LaneCount } from '../../../rhythm/types.js';
import { msToSec } from '../../../time.js';

const SECONDS_PER_MINUTE = 60;
const SCORE_FORMAT = new Intl.NumberFormat('en-US');

export function formatScore(score: number): string {
  return SCORE_FORMAT.format(score);
}

export function formatAccuracy(accuracy: number): string {
  return `${(accuracy * 100).toFixed(2)}%`;
}

export function formatClockTime(timeMs: number): string {
  const totalSeconds = Math.floor(msToSec(timeMs));
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatLaneCount(laneCount: LaneCount): string {
  return `${laneCount}K`;
}

export function formatKeyCode(code: string): string {
  const match = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(code);
  if (match !== null) {
    return match[1] ?? match[2] ?? code;
  }
  return code === 'Space' ? 'SPACE' : code;
}
