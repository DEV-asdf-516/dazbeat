import { ClientResponseError } from 'pocketbase';
import type PocketBase from 'pocketbase';
import { z } from 'zod';
import { RankingRequestError } from '../data/ranking.js';
import type {
  ChartTopRank,
  Leaderboard,
  MyChartRecord,
  RankedChart,
  RankedChartQuery,
  RankedChartPage,
} from '../data/ranking.js';
import { DIFFICULTIES, ZODIACS } from '../data/songs.js';
import { LANE_COUNTS } from '../rhythm/lanes.js';
import { HTTP_STATUS } from '../httpStatus.js';
import { sendApiRequest } from './apiRequest.js';

const LEADERBOARDS_PATH = '/api/dazbeat/leaderboards';
const MY_RANKINGS_PATH = '/api/dazbeat/profile/rankings';
const MY_TOP_RANKS_PATH = '/api/dazbeat/profile/top-ranks';
const MY_RECORDS_PATH = '/api/dazbeat/profile/records';

const rankedRecord = {
  rank: z.number().int().positive(),
  score: z.number(),
  accuracy: z.number(),
};

const rankedPlayer = {
  ...rankedRecord,
  nickname: z.string(),
  featuredAchievement: z.string().nullable(),
};

const leaderboardSchema = z.object({
  chartId: z.string(),
  chartRevision: z.string(),
  totalPlayers: z.number().int().nonnegative(),
  top: z.array(
    z.object({
      ...rankedPlayer,
      isMe: z.boolean(),
    }),
  ),
  me: z.object(rankedPlayer).nullable(),
  hasPreviousRevisionRecord: z.boolean(),
});

/** 404 는 채보가 없거나 곡이 비공개인 것이다. */
export async function loadLeaderboard(pb: PocketBase, chartId: string): Promise<Leaderboard> {
  return sendApiRequest(
    pb,
    `${LEADERBOARDS_PATH}/${encodeURIComponent(chartId)}`,
    { method: 'GET' },
    leaderboardSchema,
    (error) =>
      new RankingRequestError(
        error instanceof ClientResponseError && error.status === HTTP_STATUS.notFound
          ? 'notFound'
          : 'failed',
        error,
      ),
  );
}

const myRankingsSchema = z.object({
  items: z.array(
    z
      .object({
        chartId: z.string(),
        songId: z.string(),
        songTitle: z.string(),
        constellation: z.literal(ZODIACS),
        laneCount: z.literal(LANE_COUNTS),
        difficulty: z.enum(DIFFICULTIES),
        rank: z.number().int().positive(),
        score: z.number(),
        achievedAt: z.iso.datetime(),
      })
      .transform(({ achievedAt, ...chart }): RankedChart => ({
        ...chart,
        achievedAtMs: Date.parse(achievedAt),
      })),
  ),
  next: z
    .object({
      value: z.number(),
      chartId: z.string(),
    })
    .nullable(),
});

const myTopRanksSchema = z.object({
  items: z.array(
    z.object({
      chartId: z.string(),
      rank: z.number().int().positive(),
    }),
  ),
});

const myRecordsSchema = z.object({
  items: z.array(
    z.object({
      songId: z.string(),
      laneCount: z.literal(LANE_COUNTS),
      difficulty: z.enum(DIFFICULTIES),
      score: z.number(),
      accuracy: z.number(),
      maxCombo: z.number(),
      cleared: z.boolean(),
    }),
  ),
});

function toMyRankingsError(error: unknown): RankingRequestError {
  return new RankingRequestError(
    error instanceof ClientResponseError && error.status === HTTP_STATUS.unauthorized
      ? 'unauthorized'
      : 'failed',
    error,
  );
}

export async function loadMyRankings(
  pb: PocketBase,
  { sort, laneCount, difficulty, cursor }: RankedChartQuery,
): Promise<RankedChartPage> {
  return sendApiRequest(
    pb,
    MY_RANKINGS_PATH,
    {
      method: 'GET',
      query: {
        sort,
        laneCount,
        difficulty,
        afterValue: cursor?.value,
        afterChartId: cursor?.chartId,
      },
    },
    myRankingsSchema,
    toMyRankingsError,
  );
}

export async function loadMyTopRanks(pb: PocketBase): Promise<readonly ChartTopRank[]> {
  const { items } = await sendApiRequest(
    pb,
    MY_TOP_RANKS_PATH,
    { method: 'GET' },
    myTopRanksSchema,
    toMyRankingsError,
  );
  return items;
}

export async function loadMyRecords(pb: PocketBase): Promise<readonly MyChartRecord[]> {
  const { items } = await sendApiRequest(
    pb,
    MY_RECORDS_PATH,
    { method: 'GET' },
    myRecordsSchema,
    toMyRankingsError,
  );
  return items;
}
