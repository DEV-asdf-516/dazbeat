import PocketBase from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLeaderboard, loadMyRankings, loadMyRecords } from '../../src/backend/rankings.js';
import { RankingRequestError } from '../../src/data/ranking.js';
import type { Leaderboard } from '../../src/data/ranking.js';

const BOARD: Leaderboard = {
  chartId: 'chart/1',
  chartRevision: 'rev-1',
  totalPlayers: 2,
  top: [
    {
      rank: 1,
      nickname: '별헤는밤',
      featuredAchievement: 'FIRST_CLEAR',
      score: 318400,
      accuracy: 0.9912,
      isMe: false,
    },
    {
      rank: 2,
      nickname: 'Dazbee',
      featuredAchievement: null,
      score: 296000,
      accuracy: 0.9655,
      isMe: true,
    },
  ],
  me: {
    rank: 2,
    nickname: 'Dazbee',
    featuredAchievement: null,
    score: 296000,
    accuracy: 0.9655,
  },
  hasPreviousRevisionRecord: true,
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

function client(): PocketBase {
  return new PocketBase('http://pb.test');
}

async function failureKind(request: Promise<unknown>): Promise<unknown> {
  const error = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(RankingRequestError);
  return error instanceof RankingRequestError ? error.kind : undefined;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadLeaderboard', () => {
  it('gets the leaderboard of the chart and parses its entries', async () => {
    const fetchMock = respondWith(200, BOARD);

    const board = await loadLeaderboard(client(), 'chart/1');

    expect(board).toEqual(BOARD);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(input)).pathname).toBe('/api/dazbeat/leaderboards/chart%2F1');
    expect(init?.method).toBe('GET');
  });

  it('parses a leaderboard without my record', async () => {
    const guestBoard = {
      ...BOARD,
      me: null,
      hasPreviousRevisionRecord: false,
    };
    respondWith(200, guestBoard);

    expect(await loadLeaderboard(client(), 'chart/1')).toEqual(guestBoard);
  });

  it('rejects a hidden or missing chart as notFound', async () => {
    respondWith(404, {
      status: 404,
      code: 'chart_not_found',
      message: 'The chart does not exist.',
    });

    expect(await failureKind(loadLeaderboard(client(), 'chart/1'))).toBe('notFound');
  });

  it.each([
    [
      'a server error',
      () =>
        respondWith(500, {
          status: 500,
          message: 'Something went wrong.',
        }),
    ],
    ['a network failure', () => stubFetch(() => Promise.reject(new TypeError('fetch failed')))],
  ])('rejects %s as failed', async (_case, respond) => {
    respond();

    expect(await failureKind(loadLeaderboard(client(), 'chart/1'))).toBe('failed');
  });
});

describe('loadMyRankings', () => {
  const FIRST_PAGE = {
    sort: 'score',
    laneCount: null,
    difficulty: null,
    cursor: null,
  } as const;
  const ACHIEVED_AT = '2026-10-21T09:12:33.000Z';
  const ITEM = {
    chartId: 'chart-1',
    songId: 'song-1',
    songTitle: '鳥',
    constellation: 'gemini',
    laneCount: 4,
    difficulty: 'easy',
    rank: 3,
    score: 309850,
    achievedAt: ACHIEVED_AT,
  };

  it('gets my top records and reads their achievement time', async () => {
    const fetchMock = respondWith(200, {
      items: [ITEM],
      next: null,
    });

    const { items, next } = await loadMyRankings(client(), FIRST_PAGE);

    expect(next).toBeNull();
    expect(items).toEqual([
      {
        chartId: 'chart-1',
        songId: 'song-1',
        songTitle: '鳥',
        constellation: 'gemini',
        laneCount: 4,
        difficulty: 'easy',
        rank: 3,
        score: 309850,
        achievedAtMs: Date.parse(ACHIEVED_AT),
      },
    ]);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(input)).pathname).toBe('/api/dazbeat/profile/rankings');
    expect(init?.method).toBe('GET');
  });

  it('sends the cursor and reads the next one', async () => {
    const next = {
      value: 1000,
      chartId: 'chart-1',
    };
    const fetchMock = respondWith(200, {
      items: [ITEM],
      next,
    });

    const page = await loadMyRankings(client(), {
      sort: 'achieved',
      laneCount: 4,
      difficulty: 'hard',
      cursor: {
        value: 500,
        chartId: 'chart-0',
      },
    });

    expect(page.next).toEqual(next);
    const { searchParams } = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(Object.fromEntries(searchParams)).toEqual({
      sort: 'achieved',
      laneCount: '4',
      difficulty: 'hard',
      afterValue: '500',
      afterChartId: 'chart-0',
    });
  });

  it('rejects a signed-out request as unauthorized', async () => {
    respondWith(401, {
      status: 401,
      message: 'The request requires valid record authorization token.',
    });

    expect(await failureKind(loadMyRankings(client(), FIRST_PAGE))).toBe('unauthorized');
  });

  it.each([
    [
      'a server error',
      () =>
        respondWith(500, {
          status: 500,
          message: 'Something went wrong.',
        }),
    ],
    ['a network failure', () => stubFetch(() => Promise.reject(new TypeError('fetch failed')))],
  ])('rejects %s as failed', async (_case, respond) => {
    respond();

    expect(await failureKind(loadMyRankings(client(), FIRST_PAGE))).toBe('failed');
  });
});

describe('loadMyRecords', () => {
  const RECORD = {
    songId: 'song-1',
    laneCount: 4,
    difficulty: 'easy',
    score: 309850,
    accuracy: 0.97,
    maxCombo: 120,
    cleared: true,
  };

  it('gets my best records', async () => {
    const fetchMock = respondWith(200, { items: [RECORD] });

    expect(await loadMyRecords(client())).toEqual([RECORD]);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(input)).pathname).toBe('/api/dazbeat/profile/records');
    expect(init?.method).toBe('GET');
  });

  it.each([
    ['an unknown lane count', { laneCount: 3 }],
    ['an unknown difficulty', { difficulty: 'impossible' }],
    ['a missing cleared flag', { cleared: undefined }],
  ])('rejects a response with %s', async (_case, fields) => {
    // JSON 으로 보낼 때 undefined 필드는 빠진다.
    respondWith(200, {
      items: [
        {
          ...RECORD,
          ...fields,
        },
      ],
    });

    await expect(loadMyRecords(client())).rejects.toThrow();
  });

  it('rejects a signed-out request as unauthorized', async () => {
    respondWith(401, {
      status: 401,
      message: 'The request requires valid record authorization token.',
    });

    expect(await failureKind(loadMyRecords(client()))).toBe('unauthorized');
  });
});
