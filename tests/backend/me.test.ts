import PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '../../src/backend/auth.js';
import {
  changeNickname,
  isNicknameAvailable,
  loadMyRankings,
  loadMyRecords,
  loadProfile,
  setFeaturedAchievement,
} from '../../src/backend/me.js';
import { ProfileRequestError } from '../../src/data/profile.js';
import { RankingRequestError } from '../../src/data/ranking.js';
import { parseNickname } from '../../src/data/nickname.js';
import type { Nickname } from '../../src/data/nickname.js';
import { requireDefined } from '../../src/invariant.js';
import type { NamedAchievementDefinition } from '../../src/data/achievements.js';
import { msToSec } from '../../src/time.js';

function nickname(input: string): Nickname {
  return requireDefined(parseNickname(input), 'Invalid test nickname', input);
}

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

const TOKEN = `${base64Url({
  alg: 'HS256',
  typ: 'JWT',
})}.${base64Url({
  exp: Math.floor(msToSec(Date.now())) + 3600,
})}.signature`;

const USER_RECORD: RecordModel = {
  id: 'user1',
  collectionId: 'users_collection',
  collectionName: 'users',
  email: 'player@example.com',
  name: 'Player',
  verified: true,
  isEditor: false,
  nickname: '과즙이4829',
  featuredAchievement: '',
};

const EARNED_AT = '2026-10-21T09:12:33.000Z';

const stats = {
  playCount: 128,
  clearedSongCount: 42,
  sChartCount: 18,
  fullComboChartCount: 9,
  allPerfectChartCount: 3,
};

function servedOf(id: string, set: string, isRetired = false) {
  return {
    key: id,
    achievementSet: set,
    category: 'play',
    kind: 'plays',
    target: 1,
    mark: '',
    difficulty: '',
    zodiac: '',
    album: '',
    retired: isRetired,
    names: {
      ko: id,
      ja: id,
      en: id,
    },
  };
}

function definitionOf(
  id: string,
  set: NamedAchievementDefinition['set'],
  isRetired = false,
): NamedAchievementDefinition {
  return {
    id,
    set,
    category: 'play',
    rule: {
      kind: 'plays',
      target: 1,
    },
    isRetired,
    names: {
      ko: id,
      ja: id,
      en: id,
    },
  };
}

const ACTIVE: readonly [string, NamedAchievementDefinition['set']][] = [
  ['FIRST_CLEAR', 'rhythm'],
  ['PLAY_3', 'rhythm'],
  ['ZODIAC_ARIES', 'zodiac'],
  ['ALBUM_ORBIT_CLEAR', 'discography'],
];
const ACTIVE_IDS = ACTIVE.map(([id]) => id);

function achievementEntries() {
  return ACTIVE.map(([id, set]) => ({
    definition: servedOf(id, set),
    earnedAt: id === 'FIRST_CLEAR' ? EARNED_AT : null,
    current: id === 'FIRST_CLEAR' ? 1 : 0,
    target: 1,
  }));
}

function profileResponse(overrides: Record<string, unknown> = {}) {
  return {
    nickname: '과즙이4829',
    featuredAchievement: servedOf('FIRST_CLEAR', 'rhythm'),
    stats,
    achievements: achievementEntries(),
    retiredAchievements: [servedOf('S_20_CHARTS', 'rhythm', true)],
    albums: {
      album1: {
        key: 'orbit',
        name: 'Orbit',
      },
    },
    newAchievements: ['FIRST_CLEAR'],
    ...overrides,
  };
}

type FetchCall = [input: string, init?: RequestInit];

function stubFetch(response: (...args: FetchCall) => Promise<Response>) {
  const fetchMock = vi.fn<(...args: FetchCall) => Promise<Response>>(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function respondWith(status: number, body: unknown) {
  return stubFetch(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

function getRequest(fetchMock: ReturnType<typeof respondWith>) {
  const [input, init] = requireDefined(fetchMock.mock.calls[0], 'missing request');
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  return {
    url: new URL(input),
    method: init?.method,
    authorization: new Headers(init?.headers).get('Authorization'),
    body,
  };
}

function signedOutClient(): PocketBase {
  return new PocketBase('http://pb.test');
}

function signedInClient(): PocketBase {
  const pb = new PocketBase('http://pb.test');
  pb.authStore.save(TOKEN, USER_RECORD);
  return pb;
}

async function rankingFailureKind(request: Promise<unknown>): Promise<unknown> {
  const error = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(RankingRequestError);
  return error instanceof RankingRequestError ? error.kind : undefined;
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected rejection');
}

function errorBody(status: number, code: string) {
  return {
    status,
    code,
    message: 'failed',
  };
}

function fieldErrorBody(field: string, code: string) {
  return {
    status: 400,
    message: 'Failed to update record.',
    data: {
      [field]: {
        code,
        message: 'failed',
      },
    },
  };
}

function updatedUser(overrides: Record<string, unknown>) {
  return {
    ...USER_RECORD,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadProfile', () => {
  it('gets the profile path and builds the screen catalog from the served definitions', async () => {
    const fetchMock = respondWith(200, profileResponse());

    const profile = await loadProfile(signedInClient());

    const request = getRequest(fetchMock);
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe('/api/dazbeat/me/profile');
    expect(request.authorization).toBe(TOKEN);
    expect(profile.nickname).toBe('과즙이4829');
    expect(profile.featuredAchievement).toEqual(definitionOf('FIRST_CLEAR', 'rhythm'));
    expect(profile.stats).toEqual(stats);
    expect(profile.achievements.map(({ definition }) => definition.id)).toEqual(ACTIVE_IDS);
    expect(profile.achievements[0]).toEqual({
      definition: definitionOf('FIRST_CLEAR', 'rhythm'),
      earnedAtMs: Date.parse(EARNED_AT),
      current: 1,
      target: 1,
    });
    expect(profile.achievements[1]?.earnedAtMs).toBeNull();
    expect([...profile.newAchievements].map(({ id }) => id)).toEqual(['FIRST_CLEAR']);
    expect(profile.catalog.definitions.map(({ id }) => id)).toEqual([...ACTIVE_IDS, 'S_20_CHARTS']);
    expect(profile.catalog.albums).toEqual(
      new Map([
        [
          'album1',
          {
            key: 'orbit',
            name: 'Orbit',
          },
        ],
      ]),
    );
  });

  it('accepts no featured achievement', async () => {
    respondWith(200, profileResponse({ featuredAchievement: null }));

    const profile = await loadProfile(signedInClient());

    expect(profile.featuredAchievement).toBeNull();
  });

  it('accepts a retired featured achievement', async () => {
    respondWith(
      200,
      profileResponse({ featuredAchievement: servedOf('S_20_CHARTS', 'rhythm', true) }),
    );

    const profile = await loadProfile(signedInClient());

    expect(profile.featuredAchievement).toEqual(definitionOf('S_20_CHARTS', 'rhythm', true));
  });

  it('rejects a profile leaving a set without a visible achievement', async () => {
    respondWith(
      200,
      profileResponse({
        achievements: achievementEntries().filter(
          ({ definition }) => definition.key !== 'ZODIAC_ARIES',
        ),
      }),
    );

    await expect(loadProfile(signedInClient())).rejects.toThrow();
  });

  it('turns 401 into an unauthorized error', async () => {
    respondWith(401, errorBody(401, 'unauthorized'));

    const error = await captureError(loadProfile(signedInClient()));

    expect(error).toBeInstanceOf(ProfileRequestError);
    expect(error).toMatchObject({ kind: 'unauthorized' });
  });

  it('turns other server errors into a failed error', async () => {
    respondWith(500, errorBody(500, 'internal'));

    const error = await captureError(loadProfile(signedInClient()));

    expect(error).toMatchObject({ kind: 'failed' });
  });
});

describe('changeNickname', () => {
  it('patches the own users record and resolves the stored value', async () => {
    const fetchMock = respondWith(200, updatedUser({ nickname: 'Star_01' }));
    const pb = signedInClient();

    await expect(changeNickname(pb, nickname('star_01'))).resolves.toBe('Star_01');

    const request = getRequest(fetchMock);
    expect(request.method).toBe('PATCH');
    expect(request.url.pathname).toBe('/api/collections/users/records/user1');
    expect(request.body).toEqual({ nickname: 'star_01' });
    expect(getCurrentUser(pb)?.nickname).toBe('Star_01');
  });

  it('rejects without a request when nobody is signed in', async () => {
    const fetchMock = respondWith(200, updatedUser({ nickname: 'Star' }));

    const error = await captureError(
      changeNickname(new PocketBase('http://pb.test'), nickname('Star')),
    );

    expect(error).toBeInstanceOf(ProfileRequestError);
    expect(error).toMatchObject({ kind: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      '400 nickname invalid_nickname',
      400,
      fieldErrorBody('nickname', 'invalid_nickname'),
      'invalidNickname',
    ],
    [
      '400 nickname validation_not_unique',
      400,
      fieldErrorBody('nickname', 'validation_not_unique'),
      'nicknameTaken',
    ],
    ['401', 401, errorBody(401, 'unauthorized'), 'unauthorized'],
    [
      '404',
      404,
      {
        status: 404,
        message: 'Not found.',
        data: {},
      },
      'failed',
    ],
    [
      '400 code on another field',
      400,
      fieldErrorBody('isEditor', 'validation_not_unique'),
      'failed',
    ],
  ])('turns %s into %s', async (_case, status, body, kind) => {
    respondWith(status, body);

    const error = await captureError(changeNickname(signedInClient(), nickname('Star')));

    expect(error).toBeInstanceOf(ProfileRequestError);
    expect(error).toMatchObject({ kind });
  });
});

describe('isNicknameAvailable', () => {
  it.each([true, false])('asks with the nickname query and resolves %s', async (isAvailable) => {
    const fetchMock = respondWith(200, { available: isAvailable });

    await expect(isNicknameAvailable(signedInClient(), nickname('별빛_01'))).resolves.toBe(
      isAvailable,
    );

    const request = getRequest(fetchMock);
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe('/api/dazbeat/me/nickname/available');
    expect(request.url.searchParams.get('nickname')).toBe('별빛_01');
  });

  it('turns 400 invalid_nickname into invalidNickname', async () => {
    respondWith(400, errorBody(400, 'invalid_nickname'));

    const error = await captureError(isNicknameAvailable(signedInClient(), nickname('ab')));

    expect(error).toBeInstanceOf(ProfileRequestError);
    expect(error).toMatchObject({ kind: 'invalidNickname' });
  });
});

describe('setFeaturedAchievement', () => {
  it('patches the own users record and resolves the stored value', async () => {
    const fetchMock = respondWith(200, updatedUser({ featuredAchievement: 'FIRST_CLEAR' }));
    const pb = signedInClient();

    await expect(setFeaturedAchievement(pb, 'FIRST_CLEAR')).resolves.toBe('FIRST_CLEAR');

    const request = getRequest(fetchMock);
    expect(request.method).toBe('PATCH');
    expect(request.url.pathname).toBe('/api/collections/users/records/user1');
    expect(request.body).toEqual({ featuredAchievement: 'FIRST_CLEAR' });
    expect(getCurrentUser(pb)?.featuredAchievement).toBe('FIRST_CLEAR');
  });

  it('saves an empty value to clear the featured achievement', async () => {
    const pb = new PocketBase('http://pb.test');
    pb.authStore.save(TOKEN, updatedUser({ featuredAchievement: 'FIRST_CLEAR' }));
    const fetchMock = respondWith(200, updatedUser({ featuredAchievement: '' }));

    await expect(setFeaturedAchievement(pb, null)).resolves.toBeNull();

    expect(getRequest(fetchMock).body).toEqual({ featuredAchievement: '' });
    expect(getCurrentUser(pb)?.featuredAchievement).toBeNull();
  });

  it('turns 400 featuredAchievement achievement_not_earned into a notEarned error', async () => {
    respondWith(400, fieldErrorBody('featuredAchievement', 'achievement_not_earned'));

    const error = await captureError(setFeaturedAchievement(signedInClient(), 'PLAY_3'));

    expect(error).toMatchObject({ kind: 'notEarned' });
  });
});

describe('loadMyRankings', () => {
  const firstPage = {
    sort: 'score',
    laneCount: null,
    difficulty: null,
    cursor: null,
  } as const;
  const achievedAt = '2026-10-21T09:12:33.000Z';
  const item = {
    chartId: 'chart-1',
    songId: 'song-1',
    songTitle: '鳥',
    constellation: 'gemini',
    laneCount: 4,
    difficulty: 'easy',
    rank: 3,
    score: 309850,
    achievedAt,
  };

  it('gets my top records and reads their achievement time', async () => {
    const fetchMock = respondWith(200, {
      items: [item],
      next: null,
    });

    const { items, next } = await loadMyRankings(signedOutClient(), firstPage);

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
        achievedAtMs: Date.parse(achievedAt),
      },
    ]);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(input)).pathname).toBe('/api/dazbeat/me/rankings');
    expect(init?.method).toBe('GET');
  });

  it('sends the cursor and reads the next one', async () => {
    const next = {
      value: 1000,
      chartId: 'chart-1',
    };
    const fetchMock = respondWith(200, {
      items: [item],
      next,
    });

    const page = await loadMyRankings(signedOutClient(), {
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

    expect(await rankingFailureKind(loadMyRankings(signedOutClient(), firstPage))).toBe(
      'unauthorized',
    );
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

    expect(await rankingFailureKind(loadMyRankings(signedOutClient(), firstPage))).toBe('failed');
  });
});

describe('loadMyRecords', () => {
  const record = {
    songId: 'song-1',
    laneCount: 4,
    difficulty: 'easy',
    score: 309850,
    accuracy: 0.97,
    maxCombo: 120,
  };

  it('gets my best records', async () => {
    const fetchMock = respondWith(200, { items: [record] });

    expect(await loadMyRecords(signedOutClient())).toEqual([record]);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(input)).pathname).toBe('/api/dazbeat/me/records');
    expect(init?.method).toBe('GET');
  });

  it.each([
    ['an unknown lane count', { laneCount: 3 }],
    ['an unknown difficulty', { difficulty: 'impossible' }],
  ])('rejects a response with %s', async (_case, fields) => {
    // JSON 으로 보낼 때 undefined 필드는 빠진다.
    respondWith(200, {
      items: [
        {
          ...record,
          ...fields,
        },
      ],
    });

    await expect(loadMyRecords(signedOutClient())).rejects.toThrow();
  });

  it('rejects a signed-out request as unauthorized', async () => {
    respondWith(401, {
      status: 401,
      message: 'The request requires valid record authorization token.',
    });

    expect(await rankingFailureKind(loadMyRecords(signedOutClient()))).toBe('unauthorized');
  });
});
