import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACHIEVEMENT_IDS } from '../../../src/data/achievements.js';
import {
  ACHIEVEMENT_MARKS,
  EARNED_ACHIEVEMENTS,
  PLAY_RESULTS,
  SONG_MASTERIES,
} from '../../../src/pbCollections.js';
import { where } from '../../../src/pbQuery.js';
import { createClient, createTempDir, removeTempDir, startPocketBase } from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import {
  createChart,
  createSong,
  createUser,
  excludeLoopbackFromRateLimits,
  fakeChartData,
} from './testData.js';
import type { TestUser } from './testData.js';

const DEFAULT_NICKNAME = /^과즙이\d{4}$/;
// A clear mark on the only chart of the only leo song proves these, in catalog order.
const BACKFILLED_CLEAR_ACHIEVEMENTS = ['FIRST_CLEAR', 'ZODIAC_LEO', 'ZODIAC_1_COMPLETE'];
const ANY_ACHIEVEMENTS: unknown = expect.any(Array);
const ISO_TIMESTAMP: unknown = expect.stringMatching(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
);

interface ProfileResponse {
  nickname: string;
  featuredAchievement: string | null;
  stats: Record<string, number>;
  achievements: { id: string; earnedAt: string | null; current: number; target: number }[];
  newAchievements: string[];
}

let dataDir: string;
let server: PocketBaseServer;
let song: RecordModel;
let chart: RecordModel;
let userCount = 0;

async function newPlayer(): Promise<TestUser> {
  userCount += 1;
  return createUser(server, `profile${userCount}@example.com`);
}

function getProfile(client: PocketBase): Promise<ProfileResponse> {
  return client.send<ProfileResponse>('/api/dazbeat/profile', { method: 'GET' });
}

function changeNickname(client: PocketBase, body: unknown): Promise<{ nickname: string }> {
  return client.send<{ nickname: string }>('/api/dazbeat/profile/nickname', {
    method: 'POST',
    body,
  });
}

function checkNickname(client: PocketBase, nickname: string): Promise<{ available: boolean }> {
  return client.send<{ available: boolean }>('/api/dazbeat/profile/nickname/available', {
    method: 'GET',
    query: { nickname },
  });
}

function changeFeatured(
  client: PocketBase,
  body: unknown,
): Promise<{ featuredAchievement: string | null }> {
  return client.send<{ featuredAchievement: string | null }>('/api/dazbeat/profile/featured', {
    method: 'POST',
    body,
  });
}

function expectRejection(request: Promise<unknown>, status: number, code: string): Promise<void> {
  return expect(request).rejects.toMatchObject({
    status,
    response: {
      status,
      code,
    },
  });
}

async function storedNickname(userId: string): Promise<string> {
  return String((await server.superuser.collection('users').getOne(userId))['nickname']);
}

function backfillClearMark(userId: string): Promise<RecordModel> {
  return server.superuser.collection(ACHIEVEMENT_MARKS.name).create({
    user: userId,
    kind: 'clear',
    song: song.id,
    difficulty: 'easy',
    chart: chart.id,
    chartRevision: String(chart['revision']),
    constellation: '',
    source: 'backfill',
  });
}

function earn(userId: string, achievement: string): Promise<RecordModel> {
  return server.superuser.collection(EARNED_ACHIEVEMENTS.name).create({
    user: userId,
    achievement,
  });
}

beforeAll(async () => {
  dataDir = await createTempDir('profile');
  server = await startPocketBase({ dataDir });
  await excludeLoopbackFromRateLimits(server.superuser);
  song = await createSong(server.superuser, 'profile', 5_000, { constellation: 'leo' });
  chart = await createChart(server.superuser, song.id, 'easy', fakeChartData('profile', 'easy'));
});

afterAll(async () => {
  await server?.stop();
  await removeTempDir(dataDir);
});

describe('GET /api/dazbeat/profile', () => {
  it('answers the nickname, stats and all achievements of a new user', async () => {
    const player = await newPlayer();

    const profile = await getProfile(player.client);

    expect(profile).toEqual({
      nickname: await storedNickname(player.id),
      featuredAchievement: null,
      stats: {
        playCount: 0,
        clearedSongCount: 0,
        sChartCount: 0,
        fullComboChartCount: 0,
        allPerfectChartCount: 0,
      },
      achievements: ANY_ACHIEVEMENTS,
      newAchievements: [],
    });
    expect(profile.nickname).toMatch(DEFAULT_NICKNAME);
    expect(profile.achievements.map(({ id }) => id)).toEqual(ACHIEVEMENT_IDS);
    expect(profile.achievements.every(({ earnedAt }) => earnedAt === null)).toBe(true);
    expect(profile.achievements.find(({ id }) => id === 'FIRST_CLEAR')).toEqual({
      id: 'FIRST_CLEAR',
      earnedAt: null,
      current: 0,
      target: 1,
    });
    expect(profile.achievements.find(({ id }) => id === 'ZODIAC_LEO')).toMatchObject({
      current: 0,
      target: 1,
    });
  });

  it('grants what backfilled marks prove once and reports them as new only then', async () => {
    const player = await newPlayer();
    await backfillClearMark(player.id);

    const first = await getProfile(player.client);

    expect(first.newAchievements).toEqual(BACKFILLED_CLEAR_ACHIEVEMENTS);
    expect(first.stats).toMatchObject({
      playCount: 0,
      clearedSongCount: 1,
    });
    const earned = first.achievements.filter(({ earnedAt }) => earnedAt !== null);
    expect(earned.map(({ id }) => id)).toEqual(BACKFILLED_CLEAR_ACHIEVEMENTS);
    expect(earned[0]).toEqual({
      id: 'FIRST_CLEAR',
      earnedAt: ISO_TIMESTAMP,
      current: 1,
      target: 1,
    });

    const second = await getProfile(player.client);

    expect(second.newAchievements).toEqual([]);
    expect(second.achievements).toEqual(first.achievements);
    const earnedFilter = where(EARNED_ACHIEVEMENTS, [{ user: player.id }]);
    const stored = await server.superuser.collection(EARNED_ACHIEVEMENTS.name).getFullList({
      filter: server.superuser.filter(earnedFilter.expression, earnedFilter.params),
    });
    expect(stored).toHaveLength(BACKFILLED_CLEAR_ACHIEVEMENTS.length);
  });
});

describe('POST /api/dazbeat/profile/nickname', () => {
  it.each([
    ['two characters', '가나', '가나'],
    ['sixteen characters', 'abcdefghij가나다라마바', 'abcdefghij가나다라마바'],
    ['surrounding spaces', '  Star_-9  ', 'Star_-9'],
    ['a decomposed syllable', '\u1103\u1161\u1105\u1161', '다라'],
  ])('saves %s normalized', async (_case, nickname, expected) => {
    const player = await newPlayer();

    await expect(changeNickname(player.client, { nickname })).resolves.toEqual({
      nickname: expected,
    });
    expect(await storedNickname(player.id)).toBe(expected);
  });

  it.each([
    ['one character', '가'],
    ['seventeen characters', 'abcdefghij가나다라마바사'],
    ['a symbol outside _ and -', 'star!'],
  ])('rejects %s with invalid_nickname', async (_case, nickname) => {
    const player = await newPlayer();
    const before = await storedNickname(player.id);

    await expectRejection(changeNickname(player.client, { nickname }), 400, 'invalid_nickname');
    expect(await storedNickname(player.id)).toBe(before);
  });

  it('rejects a malformed body with invalid_request', async () => {
    const player = await newPlayer();

    await expectRejection(changeNickname(player.client, { name: 'Star' }), 400, 'invalid_request');
  });

  it('rejects a nickname another user holds in any letter case', async () => {
    const holder = await newPlayer();
    const other = await newPlayer();
    await changeNickname(holder.client, { nickname: 'Orion' });
    const before = await storedNickname(other.id);

    await expectRejection(
      changeNickname(other.client, { nickname: 'ORION' }),
      409,
      'nickname_taken',
    );
    expect(await storedNickname(other.id)).toBe(before);
  });

  it('accepts the own nickname unchanged and in another letter case', async () => {
    const player = await newPlayer();
    await changeNickname(player.client, { nickname: 'Vega' });

    await expect(changeNickname(player.client, { nickname: 'Vega' })).resolves.toEqual({
      nickname: 'Vega',
    });
    await expect(changeNickname(player.client, { nickname: 'vega' })).resolves.toEqual({
      nickname: 'vega',
    });
    expect(await storedNickname(player.id)).toBe('vega');
  });
});

describe('GET /api/dazbeat/profile/nickname/available', () => {
  it('reports a nickname another user holds in any letter case as unavailable', async () => {
    const holder = await newPlayer();
    const other = await newPlayer();
    await changeNickname(holder.client, { nickname: 'Rigel' });

    await expect(checkNickname(other.client, 'RIGEL')).resolves.toEqual({ available: false });
    await expect(checkNickname(other.client, 'Rigel2')).resolves.toEqual({ available: true });
  });

  it('reports the own nickname as available', async () => {
    const player = await newPlayer();
    await changeNickname(player.client, { nickname: 'Deneb' });

    await expect(checkNickname(player.client, 'deneb')).resolves.toEqual({ available: true });
  });

  it('rejects a nickname outside the rule with invalid_nickname', async () => {
    const player = await newPlayer();

    await expectRejection(checkNickname(player.client, 'star!'), 400, 'invalid_nickname');
  });

  it('rejects a guest', async () => {
    await expect(
      createClient(server.url).send('/api/dazbeat/profile/nickname/available', {
        method: 'GET',
        query: { nickname: 'Altair' },
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('POST /api/dazbeat/profile/featured', () => {
  it('features an earned achievement and clears it', async () => {
    const player = await newPlayer();
    await earn(player.id, 'FIRST_CLEAR');

    await expect(changeFeatured(player.client, { achievement: 'FIRST_CLEAR' })).resolves.toEqual({
      featuredAchievement: 'FIRST_CLEAR',
    });
    expect((await getProfile(player.client)).featuredAchievement).toBe('FIRST_CLEAR');

    await expect(changeFeatured(player.client, { achievement: null })).resolves.toEqual({
      featuredAchievement: null,
    });
    expect((await getProfile(player.client)).featuredAchievement).toBeNull();
  });

  it('answers an unchanged featured achievement without saving the user', async () => {
    const player = await newPlayer();
    await earn(player.id, 'FIRST_CLEAR');
    await changeFeatured(player.client, { achievement: 'FIRST_CLEAR' });
    const { updated } = await server.superuser.collection('users').getOne(player.id);

    await expect(changeFeatured(player.client, { achievement: 'FIRST_CLEAR' })).resolves.toEqual({
      featuredAchievement: 'FIRST_CLEAR',
    });
    expect((await server.superuser.collection('users').getOne(player.id)).updated).toBe(updated);
  });

  it('rejects an achievement the user has not earned', async () => {
    const player = await newPlayer();

    await expectRejection(
      changeFeatured(player.client, { achievement: 'FIRST_AP' }),
      409,
      'achievement_not_earned',
    );
    expect((await getProfile(player.client)).featuredAchievement).toBeNull();
  });

  it.each([
    ['an unknown ID', { achievement: 'NOT_AN_ACHIEVEMENT' }],
    ['a missing achievement', {}],
  ])('rejects %s with invalid_request', async (_case, body) => {
    const player = await newPlayer();

    await expectRejection(changeFeatured(player.client, body), 400, 'invalid_request');
  });
});

describe('profile routes', () => {
  it('require a signed-in user', async () => {
    const guest = createClient(server.url);

    await expect(getProfile(guest)).rejects.toMatchObject({ status: 401 });
    await expect(changeNickname(guest, { nickname: 'Guest' })).rejects.toMatchObject({
      status: 401,
    });
    await expect(changeFeatured(guest, { achievement: null })).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('accounts', () => {
  it('get a four-digit default nickname while four-digit values remain', async () => {
    const players = [await newPlayer(), await newPlayer()];

    const nicknames = await Promise.all(players.map((player) => storedNickname(player.id)));

    for (const nickname of nicknames) {
      expect(nickname).toMatch(DEFAULT_NICKNAME);
    }
    expect(new Set(nicknames).size).toBe(nicknames.length);
  });

  it('all sign up with distinct default nicknames when created at once', async () => {
    const players = await Promise.all(Array.from({ length: 12 }, () => newPlayer()));

    const nicknames = await Promise.all(players.map((player) => storedNickname(player.id)));

    expect(new Set(nicknames).size).toBe(players.length);
  });

  it('take their achievement records with them when deleted', async () => {
    const player = await newPlayer();
    await backfillClearMark(player.id);
    await getProfile(player.client);
    await server.superuser.collection(PLAY_RESULTS.name).create({
      user: player.id,
      session: `session-${player.id}`,
      song: song.id,
      chart: chart.id,
      difficulty: 'easy',
      laneCount: 4,
      chartRevision: String(chart['revision']),
      constellation: 'leo',
      score: 900_000,
      accuracy: 0.95,
      maxCombo: 2,
      counts: {
        perfect: 2,
        great: 0,
        good: 0,
        bad: 0,
        miss: 0,
      },
      cleared: true,
    });
    await server.superuser.collection(SONG_MASTERIES.name).create({
      user: player.id,
      song: song.id,
      kind: 'clear',
    });
    const ownFilters = [
      [PLAY_RESULTS.name, where(PLAY_RESULTS, [{ user: player.id }])],
      [ACHIEVEMENT_MARKS.name, where(ACHIEVEMENT_MARKS, [{ user: player.id }])],
      [SONG_MASTERIES.name, where(SONG_MASTERIES, [{ user: player.id }])],
      [EARNED_ACHIEVEMENTS.name, where(EARNED_ACHIEVEMENTS, [{ user: player.id }])],
    ] as const;
    const countOwn = () =>
      Promise.all(
        ownFilters.map(
          async ([collection, filter]) =>
            (
              await server.superuser.collection(collection).getFullList({
                filter: server.superuser.filter(filter.expression, filter.params),
              })
            ).length,
        ),
      );
    expect((await countOwn()).every((count) => count > 0)).toBe(true);

    await server.superuser.collection('users').delete(player.id);

    expect(await countOwn()).toEqual([0, 0, 0, 0]);
  });
});
