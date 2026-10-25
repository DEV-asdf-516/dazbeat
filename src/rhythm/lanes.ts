import type { Lane, LaneCount } from './types.js';

export const LANE_COUNTS: readonly LaneCount[] = [4, 5, 6];

export function getLanes(laneCount: LaneCount): readonly Lane[] {
  return Array.from({ length: laneCount }, (_, lane) => lane);
}
