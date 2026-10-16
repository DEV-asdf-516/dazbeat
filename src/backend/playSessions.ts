import { ClientResponseError } from 'pocketbase';
import type PocketBase from 'pocketbase';
import { z } from 'zod';
import type { PlaySubmission, VerifiedPlay } from '../data/playSubmission.js';
import type { Song } from '../data/songs.js';
import type { Difficulty } from '../rhythm/types.js';
import { getCurrentUser } from './auth.js';

const PLAY_SESSIONS_PATH = '/api/dazbeat/play-sessions';

// 서버 본문에 code 가 없는 응답(PocketBase 자체 오류·네트워크 실패)의 코드.
const STATUS_CODES: Readonly<Record<number, string>> = {
  0: 'network',
  401: 'unauthorized',
  413: 'payload_too_large',
  429: 'rate_limited',
};

export class PlaySessionError extends Error {
  override readonly name = 'PlaySessionError';
  /** HTTP 상태. 네트워크 실패는 0. */
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

// ClientResponseError 만 PlaySessionError 로 바꾸고, 그 밖의 오류는 그대로 던진다.
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

/**
 * 받은 채보 revision 으로 랭킹 세션을 발급받고 그 id 를 돌려준다.
 * 비로그인이면 요청하지 않고 null 을 돌려준다(랭킹 없이 플레이).
 */
export async function startPlaySession(
  pb: PocketBase,
  song: Song,
  difficulty: Difficulty,
  chartRevision: string,
): Promise<string | null> {
  if (getCurrentUser(pb) === null) {
    return null;
  }
  const chartId = song.chartIds[difficulty];
  if (chartId === undefined) {
    throw new Error(`No chart for song ${song.id} difficulty ${difficulty}`);
  }
  let response: unknown;
  try {
    response = await pb.send(PLAY_SESSIONS_PATH, {
      method: 'POST',
      body: {
        chartId,
        chartRevision,
      },
    });
  } catch (error) {
    throw toPlaySessionError(error);
  }
  return issuedSession.parse(response).sessionId;
}

/** 입력 기록을 제출하고 서버가 다시 계산한 결과를 돌려준다. */
export async function submitPlay(
  pb: PocketBase,
  sessionId: string,
  submission: PlaySubmission,
): Promise<VerifiedPlay> {
  let response: unknown;
  try {
    response = await pb.send(`${PLAY_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/result`, {
      method: 'POST',
      body: {
        inputOffsetMs: submission.inputOffsetMs,
        events: submission.events,
      },
    });
  } catch (error) {
    throw toPlaySessionError(error);
  }
  return verifiedPlay.parse(response);
}
