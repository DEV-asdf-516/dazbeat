import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EARNED_CHART_MARKS,
  EARNED_ACHIEVEMENTS,
  PLAY_RESULTS,
  EARNED_SONG_MARKS,
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
  readActiveAchievementKeys,
} from './testData.js';
import type { TestUser } from './testData.js';

const DEFAULT_NICKNAME = /^과즙이\d{4}$/;
// A clear mark on the only chart of the only leo song proves these, in catalog order.
const BACKFILLED_CLEAR_ACHIEVEMENTS = [
  'FIRST_CLEAR',
  'ALL_DIFFICULTIES_CLEAR',
  'ZODIAC_LEO',
  'ZODIAC_1_COMPLETE',
];
const ANY_ACHIEVEMENTS: unknown = expect.any(Array);
const ANY_OBJECT: unknown = expect.any(Object);

function servedKey(key: string): unknown {
  return expect.objectContaining({ key });
}
const ISO_TIMESTAMP: unknown = expect.stringMatching(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
);

interface ServedAchievement {
  key: string;
  retired: boolean;
  names: Record<string, string>;
}

interface ProfileResponse {
  nickname: string;
  featuredAchievement: ServedAchievement | null;
  stats: Record<string, number>;
  achievements: {
    definition: ServedAchievement;
    earnedAt: string | null;
    current: number;
    target: number;
  }[];
  retiredAchievements: ServedAchievement[];
  albumNames: Record<string, string>;
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

function checkNickname(client: PocketBase, nickname: string): Promise<{ available: boolean }> {
  return client.send<{ available: boolean }>('/api/dazbeat/profile/nickname/available', {
    method: 'GET',
    query: { nickname },
  });
}

function updateOwnUser(player: TestUser, body: Record<string, string>): Promise<RecordModel> {
  return player.client.collection('users').update(player.id, body);
}

function expectFieldRejection(
  request: Promise<unknown>,
  field: string,
  code: string,
): Promise<void> {
  return expect(request).rejects.toMatchObject({
    status: 400,
    response: { data: { [field]: { code } } },
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

async function storedFeatured(userId: string): Promise<string> {
  return String((await server.superuser.collection('users').getOne(userId))['featuredAchievement']);
}

function backfillClearMark(userId: string): Promise<RecordModel> {
  return server.superuser.collection(EARNED_CHART_MARKS.name).create({
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
      retiredAchievements: ANY_ACHIEVEMENTS,
      albumNames: ANY_OBJECT,
      newAchievements: [],
    });
    expect(profile.nickname).toMatch(DEFAULT_NICKNAME);
    const activeKeys = await readActiveAchievementKeys(server.superuser);
    expect(activeKeys).toHaveLength(117);
    expect(profile.achievements.map(({ definition }) => definition.key)).toEqual(activeKeys);
    expect(profile.retiredAchievements.every(({ retired }) => retired)).toBe(true);
    expect(profile.achievements.every(({ earnedAt }) => earnedAt === null)).toBe(true);
    expect(profile.achievements.find(({ definition }) => definition.key === 'FIRST_CLEAR')).toEqual(
      {
        definition: servedKey('FIRST_CLEAR'),
        earnedAt: null,
        current: 0,
        target: 1,
      },
    );
    expect(
      profile.achievements.find(({ definition }) => definition.key === 'ZODIAC_LEO'),
    ).toMatchObject({
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
    expect(earned.map(({ definition }) => definition.key)).toEqual(BACKFILLED_CLEAR_ACHIEVEMENTS);
    expect(earned[0]).toEqual({
      definition: servedKey('FIRST_CLEAR'),
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

describe('saving the nickname through the users API', () => {
  it.each([
    ['two characters', '가나', '가나'],
    ['sixteen characters', 'abcdefghij가나다라마바', 'abcdefghij가나다라마바'],
    ['surrounding spaces', '  Star_-9  ', 'Star_-9'],
    ['a decomposed syllable', '다라', '다라'],
  ])('saves %s normalized', async (_case, nickname, expected) => {
    const player = await newPlayer();

    await expect(updateOwnUser(player, { nickname })).resolves.toMatchObject({
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

    await expectFieldRejection(updateOwnUser(player, { nickname }), 'nickname', 'invalid_nickname');
    expect(await storedNickname(player.id)).toBe(before);
  });

  it('rejects a nickname another user holds in any letter case', async () => {
    const holder = await newPlayer();
    const other = await newPlayer();
    await updateOwnUser(holder, { nickname: 'Orion' });
    const before = await storedNickname(other.id);

    await expectFieldRejection(
      updateOwnUser(other, { nickname: 'ORION' }),
      'nickname',
      'validation_not_unique',
    );
    expect(await storedNickname(other.id)).toBe(before);
  });

  it('accepts the own nickname unchanged and in another letter case', async () => {
    const player = await newPlayer();
    await updateOwnUser(player, { nickname: 'Vega' });

    await expect(updateOwnUser(player, { nickname: 'Vega' })).resolves.toMatchObject({
      nickname: 'Vega',
    });
    await expect(updateOwnUser(player, { nickname: 'vega' })).resolves.toMatchObject({
      nickname: 'vega',
    });
    expect(await storedNickname(player.id)).toBe('vega');
  });

  it('lets only one of two users save the same nickname at once', async () => {
    const first = await newPlayer();
    const second = await newPlayer();

    const results = await Promise.allSettled([
      updateOwnUser(first, { nickname: 'Sirius' }),
      updateOwnUser(second, { nickname: 'SIRIUS' }),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      status: 400,
      response: { data: { nickname: { code: 'validation_not_unique' } } },
    });
    const firstNickname = await storedNickname(first.id);
    const secondNickname = await storedNickname(second.id);
    expect(firstNickname.toLowerCase()).not.toBe(secondNickname.toLowerCase());
  });

  it('keeps the case-insensitive nickname index', async () => {
    const users = await server.superuser.collections.getOne('users');

    expect(users.indexes).toContain(
      'CREATE UNIQUE INDEX `idx_users_nickname_nocase` ON `users` (nickname COLLATE NOCASE)',
    );
  });
});

describe('GET /api/dazbeat/profile/nickname/available', () => {
  it('reports a nickname another user holds in any letter case as unavailable', async () => {
    const holder = await newPlayer();
    const other = await newPlayer();
    await updateOwnUser(holder, { nickname: 'Rigel' });

    await expect(checkNickname(other.client, 'RIGEL')).resolves.toEqual({ available: false });
    await expect(checkNickname(other.client, 'Rigel2')).resolves.toEqual({ available: true });
  });

  it('reports the own nickname as available', async () => {
    const player = await newPlayer();
    await updateOwnUser(player, { nickname: 'Deneb' });

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

describe('saving the featured achievement through the users API', () => {
  it('features an earned achievement and clears it', async () => {
    const player = await newPlayer();
    await earn(player.id, 'FIRST_CLEAR');

    await updateOwnUser(player, { featuredAchievement: 'FIRST_CLEAR' });
    expect((await getProfile(player.client)).featuredAchievement?.key).toBe('FIRST_CLEAR');

    await updateOwnUser(player, { featuredAchievement: '' });
    expect((await getProfile(player.client)).featuredAchievement).toBeNull();
  });

  it.each([
    ['an achievement nobody has earned', 'FIRST_AP', false],
    ['an ID outside the catalog', 'NOT_AN_ACHIEVEMENT', false],
    ['an achievement only another user has earned', 'FIRST_AP', true],
  ])('rejects %s with achievement_not_earned', async (_case, achievement, isEarnedByOther) => {
    const player = await newPlayer();
    if (isEarnedByOther) {
      await earn((await newPlayer()).id, achievement);
    }

    await expectFieldRejection(
      updateOwnUser(player, { featuredAchievement: achievement }),
      'featuredAchievement',
      'achievement_not_earned',
    );
    expect(await storedFeatured(player.id)).toBe('');
  });

  it('features an earned retired achievement', async () => {
    const player = await newPlayer();
    await earn(player.id, 'S_20_CHARTS');

    await updateOwnUser(player, { featuredAchievement: 'S_20_CHARTS' });

    expect(await storedFeatured(player.id)).toBe('S_20_CHARTS');
  });

  it('rejects an earned key without an achievement definition', async () => {
    const player = await newPlayer();
    await earn(player.id, 'DELETED_ACHIEVEMENT');

    await expectFieldRejection(
      updateOwnUser(player, { featuredAchievement: 'DELETED_ACHIEVEMENT' }),
      'featuredAchievement',
      'achievement_not_earned',
    );
    expect(await storedFeatured(player.id)).toBe('');
  });

  it('features an earned achievement without granting what backfilled marks prove', async () => {
    const player = await newPlayer();
    await backfillClearMark(player.id);
    await earn(player.id, 'FIRST_AP');

    await updateOwnUser(player, { featuredAchievement: 'FIRST_AP' });

    expect(await storedFeatured(player.id)).toBe('FIRST_AP');
    const earnedFilter = where(EARNED_ACHIEVEMENTS, [{ user: player.id }]);
    const stored = await server.superuser.collection(EARNED_ACHIEVEMENTS.name).getFullList({
      filter: server.superuser.filter(earnedFilter.expression, earnedFilter.params),
    });
    expect(stored).toHaveLength(1);
  });

  it('saves neither field when the achievement in the same request is not earned', async () => {
    const player = await newPlayer();
    const before = await storedNickname(player.id);

    await expectFieldRejection(
      updateOwnUser(player, {
        nickname: 'Altair',
        featuredAchievement: 'FIRST_AP',
      }),
      'featuredAchievement',
      'achievement_not_earned',
    );
    expect(await storedNickname(player.id)).toBe(before);
    expect(await storedFeatured(player.id)).toBe('');
  });

  it('lets a superuser feature an achievement the user has not earned', async () => {
    const player = await newPlayer();

    await server.superuser
      .collection('users')
      .update(player.id, { featuredAchievement: 'FIRST_AP' });

    expect(await storedFeatured(player.id)).toBe('FIRST_AP');
  });
});

describe('profile routes', () => {
  it('require a signed-in user', async () => {
    const guest = createClient(server.url);

    await expect(getProfile(guest)).rejects.toMatchObject({ status: 401 });
    await expect(checkNickname(guest, 'Guest')).rejects.toMatchObject({ status: 401 });
  });

  it.each([
    ['/api/dazbeat/profile/nickname', { nickname: 'Gone' }],
    ['/api/dazbeat/profile/featured', { achievement: null }],
  ])('no longer serve POST %s', async (path, body) => {
    const player = await newPlayer();

    await expect(
      player.client.send(path, {
        method: 'POST',
        body,
      }),
    ).rejects.toMatchObject({
      status: 404,
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
    // 소급 mark 로 프로필을 조회하면 그 곡의 마스터와 업적이 기록된다.
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
    const ownFilters = [
      [PLAY_RESULTS.name, where(PLAY_RESULTS, [{ user: player.id }])],
      [EARNED_CHART_MARKS.name, where(EARNED_CHART_MARKS, [{ user: player.id }])],
      [EARNED_SONG_MARKS.name, where(EARNED_SONG_MARKS, [{ user: player.id }])],
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
