import PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  changeNickname,
  isNicknameAvailable,
  loadProfile,
  setFeaturedAchievement,
} from '../../src/backend/profile.js';
import { ProfileRequestError } from '../../src/data/profile.js';
import { parseNickname } from '../../src/data/nickname.js';
import type { Nickname } from '../../src/data/nickname.js';
import { requireDefined } from '../../src/invariant.js';
import { ACHIEVEMENT_IDS } from '../../src/data/achievements.js';

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
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.signature`;

const USER_RECORD: RecordModel = {
  id: 'user1',
  collectionId: 'users_collection',
  collectionName: 'users',
  email: 'player@example.com',
  name: 'Player',
  verified: true,
  isEditor: false,
};

const EARNED_AT = '2026-10-21T09:12:33.000Z';

const stats = {
  playCount: 128,
  clearedSongCount: 42,
  sChartCount: 18,
  fullComboChartCount: 9,
  allPerfectChartCount: 3,
};

function achievementEntries() {
  return ACHIEVEMENT_IDS.map((id) => ({
    id,
    earnedAt: id === 'FIRST_CLEAR' ? EARNED_AT : null,
    current: id === 'FIRST_CLEAR' ? 1 : 0,
    target: 1,
  }));
}

function profileResponse(overrides: Record<string, unknown> = {}) {
  return {
    nickname: '과즙이4829',
    featuredAchievement: 'FIRST_CLEAR',
    stats,
    achievements: achievementEntries(),
    newAchievements: ['FIRST_CLEAR'],
    ...overrides,
  };
}

type FetchCall = [input: string, init?: RequestInit];

function respondWith(status: number, body: unknown) {
  const fetchMock = vi.fn<(...args: FetchCall) => Promise<Response>>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function getRequest(fetchMock: ReturnType<typeof respondWith>) {
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

function errorBody(status: number, code: string) {
  return {
    status,
    code,
    message: 'failed',
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadProfile', () => {
  it('gets the profile path and parses earned times into ms', async () => {
    const fetchMock = respondWith(200, profileResponse());

    const profile = await loadProfile(signedInClient());

    const request = getRequest(fetchMock);
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe('/api/dazbeat/profile');
    expect(request.authorization).toBe(TOKEN);
    expect(profile.nickname).toBe('과즙이4829');
    expect(profile.featuredAchievement).toBe('FIRST_CLEAR');
    expect(profile.stats).toEqual(stats);
    expect(profile.achievements.map(({ id }) => id)).toEqual(ACHIEVEMENT_IDS);
    expect(profile.achievements[0]).toEqual({
      id: 'FIRST_CLEAR',
      earnedAtMs: Date.parse(EARNED_AT),
      current: 1,
      target: 1,
    });
    expect(profile.achievements[1]?.earnedAtMs).toBeNull();
    expect([...profile.newAchievements]).toEqual(['FIRST_CLEAR']);
  });

  it('accepts no featured achievement', async () => {
    respondWith(200, profileResponse({ featuredAchievement: null }));

    const profile = await loadProfile(signedInClient());

    expect(profile.featuredAchievement).toBeNull();
  });

  it('rejects a profile missing one of the catalog achievements', async () => {
    respondWith(200, profileResponse({ achievements: achievementEntries().slice(1) }));

    await expect(loadProfile(signedInClient())).rejects.toThrow();
  });

  it('rejects a profile listing an achievement twice', async () => {
    const entries = achievementEntries();
    const duplicated = [...entries.slice(0, -1), entries[0]];
    respondWith(200, profileResponse({ achievements: duplicated }));

    await expect(loadProfile(signedInClient())).rejects.toThrow();
  });

  it('rejects a profile with an unknown achievement ID', async () => {
    const entries = achievementEntries();
    respondWith(
      200,
      profileResponse({
        achievements: [
          ...entries,
          {
            id: 'COMBO_100',
            earnedAt: null,
            current: 0,
            target: 1,
          },
        ],
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
  it('posts the nickname and resolves the stored value', async () => {
    const fetchMock = respondWith(200, { nickname: 'Star_01' });

    await expect(changeNickname(signedInClient(), nickname(' Star_01 '))).resolves.toBe('Star_01');

    const request = getRequest(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/api/dazbeat/profile/nickname');
    expect(request.body).toEqual({ nickname: 'Star_01' });
  });

  it.each([
    [400, 'invalid_nickname', 'invalidNickname'],
    [409, 'nickname_taken', 'nicknameTaken'],
    [400, 'invalid_request', 'failed'],
    [401, 'unauthorized', 'unauthorized'],
  ])('turns %i %s into %s', async (status, code, kind) => {
    respondWith(status, errorBody(status, code));

    const error = await captureError(changeNickname(signedInClient(), nickname('Star')));

    expect(error).toBeInstanceOf(ProfileRequestError);
    expect(error).toMatchObject({ kind });
  });
});

describe('isNicknameAvailable', () => {
  it.each([true, false])('asks with the nickname query and resolves %s', async (available) => {
    const fetchMock = respondWith(200, { available });

    await expect(isNicknameAvailable(signedInClient(), nickname('별빛_01'))).resolves.toBe(
      available,
    );

    const request = getRequest(fetchMock);
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe('/api/dazbeat/profile/nickname/available');
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
  it('posts the achievement and resolves the stored value', async () => {
    const fetchMock = respondWith(200, { featuredAchievement: 'FIRST_CLEAR' });

    await expect(setFeaturedAchievement(signedInClient(), 'FIRST_CLEAR')).resolves.toBe(
      'FIRST_CLEAR',
    );

    const request = getRequest(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/api/dazbeat/profile/featured');
    expect(request.body).toEqual({ achievement: 'FIRST_CLEAR' });
  });

  it('posts null to clear the featured achievement', async () => {
    const fetchMock = respondWith(200, { featuredAchievement: null });

    await expect(setFeaturedAchievement(signedInClient(), null)).resolves.toBeNull();

    expect(getRequest(fetchMock).body).toEqual({ achievement: null });
  });

  it('turns 409 achievement_not_earned into a notEarned error', async () => {
    respondWith(409, errorBody(409, 'achievement_not_earned'));

    const error = await captureError(setFeaturedAchievement(signedInClient(), 'FIRST_AP'));

    expect(error).toMatchObject({ kind: 'notEarned' });
  });
});
