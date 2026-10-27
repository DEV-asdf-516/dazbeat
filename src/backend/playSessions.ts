import { ClientResponseError } from 'pocketbase';
import type PocketBase from 'pocketbase';
import { z } from 'zod';
import { findAchievement } from '../data/achievements.js';
import type { PreparedChart, VerifiedPlay } from '../data/playSession.js';
import type { PlaySubmission } from '../data/playSubmission.js';
import type { ChartRef } from '../data/songs.js';
import { HTTP_STATUS } from '../httpStatus.js';
import { isString } from '../typeGuards.js';
import { getCurrentUser } from './auth.js';
import type { ChartCache } from './ChartCache.js';
import type { LoadedChart } from './charts.js';
import { sendApiRequest } from './apiRequest.js';

const PLAY_SESSIONS_PATH = '/api/dazbeat/play-sessions';

const STATUS_CODES: Readonly<Record<number, string>> = {
  0: 'network',
  [HTTP_STATUS.unauthorized]: 'unauthorized',
  [HTTP_STATUS.payloadTooLarge]: 'payload_too_large',
  [HTTP_STATUS.tooManyRequests]: 'rate_limited',
};

class PlaySessionError extends Error {
  override readonly name = 'PlaySessionError';
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`Play session request failed: ${status} ${code}`);
    this.status = status;
    this.code = code;
  }
}

const issuedSession = z.object({ sessionId: z.string() });

// 서버가 먼저 배포되지 않았으면 newAchievements 가 없다. 알림은 선택 기능이라 모르는 ID 는 빼고 결과는 그대로 받는다.
const verifiedPlay = z
  .object({
    score: z.number(),
    accuracy: z.number(),
    maxCombo: z.number(),
    cleared: z.boolean(),
    bestScore: z.number(),
    newAchievements: z.array(z.string()).default([]),
  })
  .transform(({ newAchievements, ...play }) => ({
    ...play,
    newAchievements: newAchievements.flatMap((id) => {
      const achievement = findAchievement(id);
      if (achievement === undefined) {
        console.warn('Ignoring unknown achievement in play result', id);
        return [];
      }
      return [achievement.id];
    }),
  }));

function toPlaySessionError(error: unknown): unknown {
  if (!(error instanceof ClientResponseError)) {
    return error;
  }
  const code: unknown = error.response['code'];
  return new PlaySessionError(
    error.status,
    isString(code) ? code : (STATUS_CODES[error.status] ?? `http_${error.status}`),
  );
}

export async function preparePlay(
  pb: PocketBase,
  charts: ChartCache,
  ref: ChartRef,
): Promise<PreparedChart> {
  const issue = async ({ chart, revision }: LoadedChart): Promise<PreparedChart> => {
    if (getCurrentUser(pb) === null) {
      return {
        chart,
        rankedSessionId: null,
      };
    }
    const issued = await sendApiRequest(
      pb,
      PLAY_SESSIONS_PATH,
      {
        method: 'POST',
        body: {
          chartId: ref.chartId,
          chartRevision: revision,
        },
      },
      issuedSession,
      toPlaySessionError,
    );
    return {
      chart,
      rankedSessionId: issued.sessionId,
    };
  };

  const withoutSession = ({ chart }: LoadedChart, error: unknown): PreparedChart => {
    console.warn('Failed to start ranked play session', error);
    return {
      chart,
      rankedSessionId: null,
    };
  };

  const loaded = await charts.load(ref);
  return issue(loaded).catch(async (error: unknown) => {
    if (!(error instanceof PlaySessionError && error.code === 'chart_changed')) {
      return withoutSession(loaded, error);
    }
    const reloaded = await charts.reload(ref);
    return issue(reloaded).catch((retryError: unknown) => withoutSession(reloaded, retryError));
  });
}

export async function submitPlay(
  pb: PocketBase,
  sessionId: string,
  submission: PlaySubmission,
): Promise<VerifiedPlay> {
  return sendApiRequest(
    pb,
    `${PLAY_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/result`,
    {
      method: 'POST',
      body: {
        inputOffsetMs: submission.inputOffsetMs,
        events: submission.events,
      },
    },
    verifiedPlay,
    toPlaySessionError,
  );
}
