import { ClientResponseError } from 'pocketbase';
import type PocketBase from 'pocketbase';
import { z } from 'zod';
import { RankingRequestError } from '../data/ranking.js';
import type { Leaderboard } from '../data/ranking.js';
import { HTTP_STATUS } from '../httpStatus.js';
import { sendApiRequest } from './apiRequest.js';

const LEADERBOARDS_PATH = '/api/dazbeat/leaderboards';
const CHARTS_PATH = '/api/dazbeat/charts';

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

/** 서버에 기록이 남지 않는 플레이어를 순위표 플레이어 수에만 더한다. 세지 않은 경우도 같은 응답이다. */
export async function reportGuestPlayer(
  pb: PocketBase,
  chartId: string,
  chartRevision: string,
): Promise<void> {
  await sendApiRequest(
    pb,
    `${CHARTS_PATH}/${encodeURIComponent(chartId)}/guest`,
    {
      method: 'POST',
      body: { chartRevision },
      // 연달아 끝낸 판의 요청을 SDK 가 같은 요청으로 보고 취소하지 않게 한다.
      requestKey: null,
    },
    z.unknown(),
    (error) => new RankingRequestError('failed', error),
  );
}
