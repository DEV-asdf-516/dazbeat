import { ClientResponseError } from 'pocketbase';
import type PocketBase from 'pocketbase';
import { z } from 'zod';
import type { PreparedChart, VerifiedPlay } from '../data/playSession.js';
import type { PlaySubmission } from '../data/playSubmission.js';
import type { ChartRef } from '../data/songs.js';
import { getCurrentUser } from './auth.js';
import type { ChartCache } from './ChartCache.js';
import type { LoadedChart } from './charts.js';

const PLAY_SESSIONS_PATH = '/api/dazbeat/play-sessions';

const STATUS_CODES: Readonly<Record<number, string>> = {
  0: 'network',
  401: 'unauthorized',
  413: 'payload_too_large',
  429: 'rate_limited',
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

const verifiedPlay = z.object({
  score: z.number(),
  accuracy: z.number(),
  maxCombo: z.number(),
  cleared: z.boolean(),
  bestScore: z.number(),
});

function toPlaySessionError(error: unknown): unknown {
  if (!(error instanceof ClientResponseError)) {
    return error;
  }
  const code: unknown = error.response['code'];
  return new PlaySessionError(
    error.status,
    typeof code === 'string' ? code : (STATUS_CODES[error.status] ?? `http_${error.status}`),
  );
}

async function postPlaySession<T>(
  pb: PocketBase,
  path: string,
  body: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: unknown;
  try {
    response = await pb.send(path, {
      method: 'POST',
      body,
    });
  } catch (error) {
    throw toPlaySessionError(error);
  }
  return schema.parse(response);
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
    const issued = await postPlaySession(
      pb,
      PLAY_SESSIONS_PATH,
      {
        chartId: ref.chartId,
        chartRevision: revision,
      },
      issuedSession,
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
  return postPlaySession(
    pb,
    `${PLAY_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/result`,
    {
      inputOffsetMs: submission.inputOffsetMs,
      events: submission.events,
    },
    verifiedPlay,
  );
}
