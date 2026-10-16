import PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaySessionError, startPlaySession, submitPlay } from '../../src/backend/playSessions.js';
import type { PlaySubmission } from '../../src/data/playSubmission.js';
import type { Song } from '../../src/data/songs.js';

const song: Song = {
  id: 'test-song',
  title: 'Test Song',
  category: 'original',
  youtubeVideoId: 'aaaaaaaaaaa',
  jacketUrl: 'http://pb.test/api/files/songs/s1/jacket.png',
  accentColor: 0xffffff,
  constellation: 'gemini',
  gameStartMs: 0,
  gameEndMs: 10000,
  chartIds: { normal: 'chart_normal' },
};

const REVISION = 'a'.repeat(64);

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// getCurrentUser 가 유효하다고 보도록 만료가 한 시간 뒤인 JWT 모양 토큰.
const TOKEN = `${base64Url({
  alg: 'HS256',
  typ: 'JWT',
})}.${base64Url({
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.signature`;

const USER_RECORD: RecordModel = {
  id: 'user1',
  collectionId: 'users_collection',
  collectionName: 'users',
  email: 'player@example.com',
  name: 'Player',
  avatar: 'avatar.png',
  verified: true,
  isEditor: false,
};

const submission: PlaySubmission = {
  inputOffsetMs: 12,
  events: [
    {
      lane: 0,
      kind: 'press',
      songTimeMs: 1000,
    },
    {
      lane: 0,
      kind: 'release',
      songTimeMs: 1100,
    },
  ],
};

const verifiedResponse = {
  score: 1000000,
  accuracy: 100,
  maxCombo: 1,
  counts: {
    perfect: 1,
    great: 0,
    good: 0,
    bad: 0,
    miss: 0,
  },
  cleared: true,
  bestScore: 1000000,
};

type FetchCall = [input: string, init?: RequestInit];

function stubFetch(response: () => Promise<Response>) {
  const fetchMock = vi.fn<(...args: FetchCall) => Promise<Response>>(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function respondWith(status: number, body: unknown) {
  return stubFetch(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

function getRequest(fetchMock: ReturnType<typeof stubFetch>) {
  const call = fetchMock.mock.calls[0];
  if (call === undefined) {
    throw new Error('missing request');
  }
  const [input, init] = call;
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  return {
    url: new URL(input),
    method: init?.method,
    authorization: new Headers(init?.headers).get('Authorization'),
    body,
  };
}

function signedInClient(): PocketBase {
  const pb = new PocketBase('http://pb.test');
  pb.authStore.save(TOKEN, USER_RECORD);
  return pb;
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected rejection');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('startPlaySession', () => {
  it('posts the chart id and revision with the auth token and resolves the session id', async () => {
    const fetchMock = respondWith(200, {
      sessionId: 'session1',
      expiresAt: '2026-10-09T00:00:00.000Z',
    });

    await expect(startPlaySession(signedInClient(), song, 'normal', REVISION)).resolves.toBe(
      'session1',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = getRequest(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/api/dazbeat/play-sessions');
    expect(request.authorization).toBe(TOKEN);
    expect(request.body).toEqual({
      chartId: 'chart_normal',
      chartRevision: REVISION,
    });
  });

  it('resolves null without requesting when signed out', async () => {
    const fetchMock = respondWith(200, { sessionId: 'session1' });

    await expect(
      startPlaySession(new PocketBase('http://pb.test'), song, 'normal', REVISION),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects without requesting when the difficulty has no chart id', async () => {
    const fetchMock = respondWith(200, { sessionId: 'session1' });

    await expect(startPlaySession(signedInClient(), song, 'hard', REVISION)).rejects.toThrow(Error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when the response has no string sessionId', async () => {
    respondWith(200, { sessionId: 1 });

    await expect(startPlaySession(signedInClient(), song, 'normal', REVISION)).rejects.toThrow();
  });

  it('rejects with the server error code', async () => {
    respondWith(409, {
      status: 409,
      code: 'chart_changed',
      message: 'Chart changed.',
    });

    const error = await captureError(startPlaySession(signedInClient(), song, 'normal', REVISION));

    expect(error).toBeInstanceOf(PlaySessionError);
    expect(error).toMatchObject({
      status: 409,
      code: 'chart_changed',
    });
  });

  it('rejects with the session rate limit code', async () => {
    respondWith(429, {
      status: 429,
      code: 'session_rate_limited',
      message: 'Too many play sessions were requested. Try again later.',
    });

    const error = await captureError(startPlaySession(signedInClient(), song, 'normal', REVISION));

    expect(error).toBeInstanceOf(PlaySessionError);
    expect(error).toMatchObject({
      status: 429,
      code: 'session_rate_limited',
    });
  });
});

describe('submitPlay', () => {
  it('posts only the input offset and events to the session result path', async () => {
    const fetchMock = respondWith(200, verifiedResponse);

    const withExtraFields = {
      ...submission,
      score: 999,
      userId: 'other',
    };
    await submitPlay(signedInClient(), 'session1', withExtraFields);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = getRequest(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/api/dazbeat/play-sessions/session1/result');
    expect(request.authorization).toBe(TOKEN);
    expect(request.body).toEqual({
      inputOffsetMs: submission.inputOffsetMs,
      events: submission.events,
    });
  });

  it('resolves the verified result', async () => {
    respondWith(200, verifiedResponse);

    await expect(submitPlay(signedInClient(), 'session1', submission)).resolves.toEqual({
      score: 1000000,
      accuracy: 100,
      maxCombo: 1,
      cleared: true,
      bestScore: 1000000,
    });
  });

  it('rejects when the response is not a verified result', async () => {
    respondWith(200, {
      ...verifiedResponse,
      cleared: 'yes',
    });

    await expect(submitPlay(signedInClient(), 'session1', submission)).rejects.toThrow();
  });

  it.each([
    [404, 'session_not_found'],
    [422, 'too_short'],
    [400, 'invalid_events'],
    [409, 'chart_changed'],
  ])('rejects HTTP %i with the server error code %s', async (status, code) => {
    respondWith(status, {
      status,
      code,
      message: 'Rejected.',
    });

    const error = await captureError(submitPlay(signedInClient(), 'session1', submission));

    expect(error).toBeInstanceOf(PlaySessionError);
    expect(error).toMatchObject({
      status,
      code,
    });
  });

  it.each([
    [401, 'unauthorized'],
    [413, 'payload_too_large'],
    [429, 'rate_limited'],
    [503, 'http_503'],
  ])('rejects HTTP %i without a code as %s', async (status, code) => {
    respondWith(status, {
      status,
      message: 'Rejected.',
      data: {},
    });

    const error = await captureError(submitPlay(signedInClient(), 'session1', submission));

    expect(error).toBeInstanceOf(PlaySessionError);
    expect(error).toMatchObject({
      status,
      code,
    });
  });

  it('rejects a network failure as status 0 network', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    const error = await captureError(submitPlay(signedInClient(), 'session1', submission));

    expect(error).toBeInstanceOf(PlaySessionError);
    expect(error).toMatchObject({
      status: 0,
      code: 'network',
    });
  });
});
