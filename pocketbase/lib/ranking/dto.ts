import { DEFAULT_RANKED_CHART_SORT, RANKED_CHART_SORTS } from '../../../src/data/ranking.js';
import type { RankedChartCursor, RankedChartSort } from '../../../src/data/ranking.js';
import { DIFFICULTIES } from '../../../src/data/songs.js';
import { HTTP_STATUS } from '../../../src/httpStatus.js';
import { LANE_COUNTS } from '../../../src/rhythm/lanes.js';
import type { Difficulty, LaneCount } from '../../../src/rhythm/types.js';
import { isOneOf, isString } from '../../../src/typeGuards.js';

const MAX_CURSOR_CHART_ID_LENGTH = 64;

const isRankedChartSort = isOneOf(RANKED_CHART_SORTS);
const isDifficulty = isOneOf(DIFFICULTIES);
const isLaneCount = isOneOf(LANE_COUNTS);

type RankingRejectionCode =
  | 'chart_not_found'
  | 'invalid_cursor'
  | 'invalid_sort'
  | 'invalid_lane_count'
  | 'invalid_difficulty';

export const RANKING_REJECTIONS: Record<RankingRejectionCode, { status: number; message: string }> =
  {
    // 비공개 곡의 존재를 드러내지 않도록 없는 채보와 구분하지 않는다.
    chart_not_found: {
      status: HTTP_STATUS.notFound,
      message: 'The chart does not exist.',
    },
    invalid_cursor: {
      status: HTTP_STATUS.badRequest,
      message: 'afterValue and afterChartId must be valid and given together.',
    },
    invalid_sort: {
      status: HTTP_STATUS.badRequest,
      message: 'sort must be score or achieved.',
    },
    invalid_lane_count: {
      status: HTTP_STATUS.badRequest,
      message: 'laneCount must be 4, 5 or 6.',
    },
    invalid_difficulty: {
      status: HTTP_STATUS.badRequest,
      message: 'difficulty must be easy, normal, hard or expert.',
    },
  };

export class InvalidRankingRequestError extends Error {
  override readonly name = 'InvalidRankingRequestError';

  constructor(readonly code: RankingRejectionCode) {
    super(RANKING_REJECTIONS[code].message);
  }
}

export function parseRankedChartSort(sort: unknown): RankedChartSort {
  if (sort === undefined) {
    return DEFAULT_RANKED_CHART_SORT;
  }
  if (!isRankedChartSort(sort)) {
    throw new InvalidRankingRequestError('invalid_sort');
  }
  return sort;
}

export function parseRankedChartLaneCount(laneCount: unknown): LaneCount | null {
  if (laneCount === undefined) {
    return null;
  }
  const parsed = Number(laneCount);
  if (!isLaneCount(parsed)) {
    throw new InvalidRankingRequestError('invalid_lane_count');
  }
  return parsed;
}

export function parseRankedChartDifficulty(difficulty: unknown): Difficulty | null {
  if (difficulty === undefined) {
    return null;
  }
  if (!isDifficulty(difficulty)) {
    throw new InvalidRankingRequestError('invalid_difficulty');
  }
  return difficulty;
}

export function parseRankedChartCursor(
  sort: RankedChartSort,
  value: unknown,
  chartId: unknown,
): RankedChartCursor | null {
  if (value === undefined && chartId === undefined) {
    return null;
  }
  const parsedValue = Number(value);
  // 달성 시각 커서는 날짜로 바꿔 비교하므로 날짜 범위 밖의 수도 거절한다.
  const bound = sort === 'achieved' ? new Date(parsedValue).getTime() : parsedValue;
  if (
    value === '' ||
    !Number.isFinite(bound) ||
    !isString(chartId) ||
    chartId.length === 0 ||
    chartId.length > MAX_CURSOR_CHART_ID_LENGTH
  ) {
    throw new InvalidRankingRequestError('invalid_cursor');
  }
  return {
    value: parsedValue,
    chartId,
  };
}
