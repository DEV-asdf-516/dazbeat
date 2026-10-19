import PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChartCache } from '../../src/backend/ChartCache.js';
import { preparePlay, submitPlay } from '../../src/backend/playSessions.js';
import type { PlaySubmission } from '../../src/data/playSubmission.js';
import type { ChartRef, Song } from '../../src/data/songs.js';

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

const normalChart: ChartRef = {
  song,
  difficulty: 'normal',
  chartId: 'chart_normal',
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

function stubFetch(response: (...args: FetchCall) => Promise<Response>) {
  const fetchMock = vi.fn<(...args: FetchCall) => Promise<Response>>(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function respondWith(status: number, body: unknown) {
  return stubFetch(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

function getRequest(fetchMock: ReturnType<typeof stubFetch>, index = 0) {
  const call = fetchMock.mock.calls[index];
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
  vi.restoreAllMocks();
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

    expect(error).toMatchObject({
      name: 'PlaySessionError',
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

    expect(error).toMatchObject({
      name: 'PlaySessionError',
      status,
      code,
    });
  });

  it('rejects a network failure as status 0 network', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    const error = await captureError(submitPlay(signedInClient(), 'session1', submission));

    expect(error).toMatchObject({
      name: 'PlaySessionError',
      status: 0,
      code: 'network',
    });
  });
});

describe('preparePlay', () => {
  const CHART_PATH = '/api/collections/charts/records/chart_normal';
  const SESSIONS_PATH = '/api/dazbeat/play-sessions';
  const REVISION_B = 'b'.repeat(64);

  function chartData(timeMs: number) {
    return {
      songId: 'test-song',
      difficulty: 'normal',
      offsetMs: 0,
      notes: [
        {
          type: 'tap',
          timeMs,
          lane: 0,
        },
      ],
    };
  }

  function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status });
  }

  const chartChanged = () =>
    json(409, {
      status: 409,
      code: 'chart_changed',
      message: 'Chart changed.',
    });

  function stubRoutes(routes: Record<string, (Response | Error)[]>) {
    return stubFetch((input) => {
      const reply = routes[new URL(input).pathname]?.shift();
      if (reply === undefined) {
        throw new Error(`unexpected request ${input}`);
      }
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
    });
  }

  function requests(fetchMock: ReturnType<typeof stubFetch>) {
    return fetchMock.mock.calls.map(([input, init]) => {
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      return {
        path: new URL(input).pathname,
        body,
      };
    });
  }

  function setUp(pb: PocketBase) {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    return {
      pb,
      charts: new ChartCache(pb),
    };
  }

  it('requests the chart only for the first of two plays and issues each with its revision', async () => {
    const fetchMock = stubRoutes({
      [CHART_PATH]: [
        json(200, {
          data: chartData(1000),
          revision: REVISION,
        }),
      ],
      [SESSIONS_PATH]: [json(200, { sessionId: 'session1' }), json(200, { sessionId: 'session2' })],
    });
    const { pb, charts } = setUp(signedInClient());

    await expect(preparePlay(pb, charts, normalChart)).resolves.toEqual({
      chart: chartData(1000),
      rankedSessionId: 'session1',
    });
    await expect(preparePlay(pb, charts, normalChart)).resolves.toEqual({
      chart: chartData(1000),
      rankedSessionId: 'session2',
    });
    const issueBody = {
      chartId: 'chart_normal',
      chartRevision: REVISION,
    };
    expect(requests(fetchMock)).toEqual([
      {
        path: CHART_PATH,
        body: undefined,
      },
      {
        path: SESSIONS_PATH,
        body: issueBody,
      },
      {
        path: SESSIONS_PATH,
        body: issueBody,
      },
    ]);
  });

  it('posts the chart id and revision with the auth token and resolves the session id', async () => {
    const fetchMock = stubRoutes({
      [CHART_PATH]: [
        json(200, {
          data: chartData(1000),
          revision: REVISION,
        }),
      ],
      [SESSIONS_PATH]: [
        json(200, {
          sessionId: 'session1',
          expiresAt: '2026-10-09T00:00:00.000Z',
        }),
      ],
    });
    const { pb, charts } = setUp(signedInClient());

    await expect(preparePlay(pb, charts, normalChart)).resolves.toEqual({
      chart: chartData(1000),
      rankedSessionId: 'session1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const request = getRequest(fetchMock, 1);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/api/dazbeat/play-sessions');
    expect(request.authorization).toBe(TOKEN);
    expect(request.body).toEqual({
      chartId: 'chart_normal',
      chartRevision: REVISION,
    });
  });

  it('resolves the chart without a session when the response has no string sessionId', async () => {
    stubRoutes({
      [CHART_PATH]: [
        json(200, {
          data: chartData(1000),
          revision: REVISION,
        }),
      ],
      [SESSIONS_PATH]: [json(200, { sessionId: 1 })],
    });
    const { pb, charts } = setUp(signedInClient());

    await expect(preparePlay(pb, charts, normalChart)).resolves.toEqual({
      chart: chartData(1000),
      rankedSessionId: null,
    });
  });

  it('requests only the chart and resolves a null session when signed out', async () => {
    const fetchMock = stubRoutes({
      [CHART_PATH]: [
        json(200, {
          data: chartData(1000),
          revision: REVISION,
        }),
      ],
    });
    const { pb, charts } = setUp(new PocketBase('http://pb.test'));

    await expect(preparePlay(pb, charts, normalChart)).resolves.toEqual({
      chart: chartData(1000),
      rankedSessionId: null,
    });
    expect(requests(fetchMock).map((request) => request.path)).toEqual([CHART_PATH]);
  });

  it('reloads the chart once and reissues with the new revision after chart_changed', async () => {
    const fetchMock = stubRoutes({
      [CHART_PATH]: [
        json(200, {
          data: chartData(1000),
          revision: REVISION,
        }),
        json(200, {
          data: chartData(2000),
          revision: REVISION_B,
        }),
      ],
      [SESSIONS_PATH]: [
        chartChanged(),
        json(200, { sessionId: 'session1' }),
        json(200, { sessionId: 'session2' }),
      ],
    });
    const { pb, charts } = setUp(signedInClient());

    await expect(preparePlay(pb, charts, normalChart)).resolves.toEqual({
      chart: chartData(2000),
      rankedSessionId: 'session1',
    });
    await expect(preparePlay(pb, charts, normalChart)).resolves.toEqual({
      chart: chartData(2000),
      rankedSessionId: 'session2',
    });
    expect(requests(fetchMock)).toEqual([
      {
        path: CHART_PATH,
        body: undefined,
      },
      {
        path: SESSIONS_PATH,
        body: {
          chartId: 'chart_normal',
          chartRevision: REVISION,
        },
      },
      {
        path: CHART_PATH,
        body: undefined,
      },
      {
        path: SESSIONS_PATH,
        body: {
          chartId: 'chart_normal',
          chartRevision: REVISION_B,
        },
      },
      {
        path: SESSIONS_PATH,
        body: {
          chartId: 'chart_normal',
          chartRevision: REVISION_B,
        },
      },
    ]);
  });

  it.each([
    ['chart_changed again', chartChanged],
    [
      'rate limited',
      () =>
        json(429, {
          status: 429,
          code: 'session_rate_limited',
          message: 'Too many.',
        }),
    ],
    ['a network failure', () => new TypeError('Failed to fetch')],
  ])(
    'resolves the new chart without a session when the reissue fails with %s',
    async (_, failure) => {
      const fetchMock = stubRoutes({
        [CHART_PATH]: [
          json(200, {
            data: chartData(1000),
            revision: REVISION,
          }),
          json(200, {
            data: chartData(2000),
            revision: REVISION_B,
          }),
        ],
        [SESSIONS_PATH]: [chartChanged(), failure()],
      });
      const { pb, charts } = setUp(signedInClient());

      await expect(preparePlay(pb, charts, normalChart)).resolves.toEqual({
        chart: chartData(2000),
        rankedSessionId: null,
      });
      expect(requests(fetchMock).map((request) => request.path)).toEqual([
        CHART_PATH,
        SESSIONS_PATH,
        CHART_PATH,
        SESSIONS_PATH,
      ]);
    },
  );

  it('rejects when the chart reload after chart_changed fails', async () => {
    const fetchMock = stubRoutes({
      [CHART_PATH]: [
        json(200, {
          data: chartData(1000),
          revision: REVISION,
        }),
        json(500, {
          status: 500,
          message: 'Failed.',
          data: {},
        }),
      ],
      [SESSIONS_PATH]: [chartChanged()],
    });
    const { pb, charts } = setUp(signedInClient());

    await expect(preparePlay(pb, charts, normalChart)).rejects.toThrow();
    expect(requests(fetchMock).map((request) => request.path)).toEqual([
      CHART_PATH,
      SESSIONS_PATH,
      CHART_PATH,
    ]);
  });

  it.each([
    [
      'rate limited',
      () =>
        json(429, {
          status: 429,
          code: 'session_rate_limited',
          message: 'Too many.',
        }),
    ],
    ['a network failure', () => new TypeError('Failed to fetch')],
  ])(
    'resolves the first chart without a session or reload when issuing fails with %s',
    async (_, failure) => {
      const fetchMock = stubRoutes({
        [CHART_PATH]: [
          json(200, {
            data: chartData(1000),
            revision: REVISION,
          }),
        ],
        [SESSIONS_PATH]: [failure()],
      });
      const { pb, charts } = setUp(signedInClient());

      await expect(preparePlay(pb, charts, normalChart)).resolves.toEqual({
        chart: chartData(1000),
        rankedSessionId: null,
      });
      expect(requests(fetchMock).map((request) => request.path)).toEqual([
        CHART_PATH,
        SESSIONS_PATH,
      ]);
    },
  );
});
