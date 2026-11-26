import PocketBase from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLeaderboard } from '../../src/backend/rankings.js';
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
