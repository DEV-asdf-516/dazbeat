import { copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type PocketBase from 'pocketbase';
import type { CollectionModel, RecordModel } from 'pocketbase';
import { afterEach, describe, expect, it } from 'vitest';
import {
  REPO_MIGRATIONS_DIR,
  createTempDir,
  migrateDown,
  removeTempDir,
  startPocketBase,
} from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import {
  createChart,
  createSong,
  createUser,
  excludeLoopbackFromRateLimits,
  fakeChartData,
} from './testData.js';

const PRE_FEATURE_MIGRATIONS = [
  '1791331200_create_songs_and_charts.js',
  '1791347685_add_users_is_editor.js',
  '1791350301_updated_users.js',
  '1791436800_add_songs_constellation.js',
];

const RELEASED_ON_MIGRATION = '1792554600_add_songs_released_on.js';
// The migrations not deployed yet; reverting them must restore the deployed schema.
const FEATURE_MIGRATIONS = [
  RELEASED_ON_MIGRATION,
  '1792554700_add_query_indexes.js',
  '1792641600_add_song_title_search.js',
];
const QUERY_INDEXES = [
  {
    collection: 'songs',
    name: 'idx_songs_released_on_id',
  },
  {
    collection: 'songs',
    name: 'idx_songs_title_nocase',
  },
  {
    collection: 'scores',
    name: 'idx_scores_chart_revision_score',
  },
  {
    collection: 'play_sessions',
    name: 'idx_play_sessions_chart',
  },
];
const CATEGORY_INDEX_MIGRATION = '1792901100_add_songs_category_index.js';
const ACHIEVEMENT_MIGRATIONS = [
  '1792900800_create_achievement_records.js',
  '1792900900_backfill_achievement_marks.js',
  '1792901000_add_users_profile_fields.js',
];
const ACHIEVEMENT_COLLECTIONS = [
  'play_results',
  'achievement_marks',
  'song_masteries',
  'earned_achievements',
];
const MARK_FIELDS = [
  'user',
  'kind',
  'song',
  'difficulty',
  'chart',
  'chartRevision',
  'constellation',
  'source',
];
const PROFILE_FIELDS = ['nickname', 'featuredAchievement'];
const DEFAULT_NICKNAME = /^과즙이\d{4}$/;
const DAZBEAT_LABELS = ['POST /api/dazbeat/play-sessions', 'POST /api/dazbeat/play-sessions/'];

const tempDirs: string[] = [];
const servers: PocketBaseServer[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await createTempDir(prefix);
  tempDirs.push(dir);
  return dir;
}

async function start(...args: Parameters<typeof startPocketBase>): Promise<PocketBaseServer> {
  const server = await startPocketBase(...args);
  servers.push(server);
  return server;
}

function fieldSummary(collection: CollectionModel) {
  return collection.fields
    .filter((field) => !field.system)
    .map((field) => ({
      name: field.name,
      type: field.type,
      required: field.required === true,
    }));
}

async function expectDazbeatRules(superuser: PocketBase, maxRequests: number): Promise<void> {
  const settings: unknown = await superuser.settings.getAll();
  expect(settings).toHaveProperty(
    'rateLimits.rules',
    expect.arrayContaining(
      DAZBEAT_LABELS.map((label) => ({
        label,
        audience: '',
        maxRequests,
        duration: 60,
      })),
    ),
  );
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(tempDirs.splice(0).map((dir) => removeTempDir(dir)));
});

describe('migrations', () => {
  it('apply to an empty database', async () => {
    const server = await start({ dataDir: await tempDir('migrations-empty') });
    await excludeLoopbackFromRateLimits(server.superuser);
    const collections = server.superuser.collections;

    const songs = await collections.getOne('songs');
    expect(fieldSummary(songs)).toContainEqual({
      name: 'releasedOn',
      type: 'date',
      required: true,
    });
    expect(songs.indexes).toEqual([
      'CREATE UNIQUE INDEX idx_songs_key ON songs (key)',
      'CREATE INDEX `idx_songs_released_on_id` ON `songs` (releasedOn DESC, id DESC)',
      'CREATE INDEX `idx_songs_title_nocase` ON `songs` (title COLLATE NOCASE)',
      'CREATE INDEX `idx_songs_category_released_on_id` ON `songs` (category, releasedOn DESC, id DESC)',
    ]);

    const charts = await collections.getOne('charts');
    expect(fieldSummary(charts)).toContainEqual({
      name: 'revision',
      type: 'text',
      required: false,
    });

    const playSessions = await collections.getOne('play_sessions');
    expect(fieldSummary(playSessions)).toEqual([
      {
        name: 'user',
        type: 'relation',
        required: true,
      },
      {
        name: 'chart',
        type: 'relation',
        required: true,
      },
      {
        name: 'chartRevision',
        type: 'text',
        required: true,
      },
      {
        name: 'issuedAt',
        type: 'date',
        required: true,
      },
      {
        name: 'expiresAt',
        type: 'date',
        required: true,
      },
      {
        name: 'chartData',
        type: 'json',
        required: true,
      },
    ]);
    expect(playSessions.fields.find((field) => field.name === 'chartData')?.['maxSize']).toBe(
      charts.fields.find((field) => field.name === 'data')?.['maxSize'],
    );
    expect(playSessions).toMatchObject({
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: [
        'CREATE UNIQUE INDEX idx_play_sessions_user ON play_sessions (user)',
        'CREATE INDEX `idx_play_sessions_chart` ON `play_sessions` (chart)',
      ],
    });

    const scores = await collections.getOne('scores');
    expect(fieldSummary(scores)).toEqual([
      {
        name: 'user',
        type: 'relation',
        required: true,
      },
      {
        name: 'chart',
        type: 'relation',
        required: true,
      },
      {
        name: 'chartRevision',
        type: 'text',
        required: true,
      },
      {
        name: 'score',
        type: 'number',
        required: false,
      },
      {
        name: 'accuracy',
        type: 'number',
        required: false,
      },
      {
        name: 'maxCombo',
        type: 'number',
        required: false,
      },
      {
        name: 'cleared',
        type: 'bool',
        required: false,
      },
      {
        name: 'counts',
        type: 'json',
        required: false,
      },
      {
        name: 'created',
        type: 'autodate',
        required: false,
      },
      {
        name: 'updated',
        type: 'autodate',
        required: false,
      },
    ]);
    expect(scores).toMatchObject({
      listRule: 'chartRevision = chart.revision',
      viewRule: 'chartRevision = chart.revision',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: [
        'CREATE UNIQUE INDEX idx_scores_user_chart_revision ON scores (user, chart, chartRevision)',
        'CREATE INDEX `idx_scores_chart_revision_score` ON `scores` (chart, chartRevision, score DESC)',
      ],
    });

    const quotas = await collections.getOne('play_session_quotas');
    expect(fieldSummary(quotas)).toEqual([
      {
        name: 'user',
        type: 'relation',
        required: true,
      },
      {
        name: 'windowStartedAt',
        type: 'date',
        required: true,
      },
      {
        name: 'issuedCount',
        type: 'number',
        required: true,
      },
    ]);
    expect(quotas).toMatchObject({
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: ['CREATE UNIQUE INDEX idx_play_session_quotas_user ON play_session_quotas (user)'],
    });
    await expectDazbeatRules(server.superuser, 30);
  });

  // 이 피처의 laneCount 훅은 laneCount 필드가 생기기 전 revision 백필에서 저장을 거부하므로,
  // 미배포 정책대로 채보가 있는 옛 DB 는 재생성하고 여기서는 채보 없이 기존 데이터 보존만 본다.
  it('keep existing users and songs', async () => {
    const dataDir = await tempDir('migrations-existing');
    const oldMigrationsDir = await tempDir('migrations-old');
    const emptyHooksDir = await tempDir('hooks-empty');
    await Promise.all(
      PRE_FEATURE_MIGRATIONS.map((file) =>
        copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file)),
      ),
    );

    const oldServer = await start({
      dataDir,
      migrationsDir: oldMigrationsDir,
      hooksDir: emptyHooksDir,
    });
    await excludeLoopbackFromRateLimits(oldServer.superuser);
    const user = await createUser(oldServer, 'existing@example.com', true);
    const song = await createSong(oldServer.superuser, 'existing');
    await oldServer.stop();

    const server = await start({ dataDir });
    const { superuser } = server;
    await excludeLoopbackFromRateLimits(superuser);
    const storedUser = await superuser.collection('users').getOne(user.id);
    expect(storedUser).toMatchObject({
      email: 'existing@example.com',
      isEditor: true,
    });
    const storedSong = await superuser.collection('songs').getOne(song.id);
    expect(storedSong.id).toBe(song.id);
    expect(storedSong['key']).toBe('existing');
    expect(storedSong['jacket']).toBe(song['jacket']);
  });

  it('allow one chart per song, difficulty and lane count', async () => {
    const { superuser } = await start({ dataDir: await tempDir('migrations-lane-count') });
    await excludeLoopbackFromRateLimits(superuser);
    const charts = await superuser.collections.getOne('charts');
    expect(fieldSummary(charts)).toContainEqual({
      name: 'laneCount',
      type: 'number',
      required: true,
    });
    expect(charts.indexes).toContain(
      'CREATE UNIQUE INDEX `idx_charts_song_difficulty_lane_count` ON `charts` (song, difficulty, laneCount)',
    );
    const song = await createSong(superuser, 'lanes');

    await createChart(superuser, song.id, 'easy', fakeChartData('lanes', 'easy'));
    const fiveLane = await createChart(
      superuser,
      song.id,
      'easy',
      fakeChartData('lanes', 'easy', 1_000, 5),
      5,
    );
    expect(fiveLane['laneCount']).toBe(5);
    await expect(
      createChart(superuser, song.id, 'easy', fakeChartData('lanes', 'easy', 1_500)),
    ).rejects.toMatchObject({ status: 400 });
    expect(await superuser.collection('charts').getFullList()).toHaveLength(2);
  });

  it('backfill the release dates of the seeded songs only', async () => {
    const dataDir = await tempDir('migrations-released-on');
    const oldMigrationsDir = await tempDir('migrations-before-released-on');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => file < RELEASED_ON_MIGRATION)
        .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file))),
    );
    const oldServer = await start({
      dataDir,
      migrationsDir: oldMigrationsDir,
      hooksDir: emptyHooksDir,
    });
    await excludeLoopbackFromRateLimits(oldServer.superuser);
    const karma = await createSong(oldServer.superuser, 'karma');
    const unknown = await createSong(oldServer.superuser, 'unknown');
    await oldServer.stop();

    const { superuser } = await start({
      dataDir,
      hooksDir: emptyHooksDir,
    });
    expect((await superuser.collection('songs').getOne(karma.id))['releasedOn']).toBe(
      '2026-05-01 00:00:00.000Z',
    );
    expect((await superuser.collection('songs').getOne(unknown.id))['releasedOn']).toBe('');
  });

  it("apply and roll back this feature's migrations on existing data", async () => {
    // The category index is built on releasedOn, so it cannot exist before this feature either.
    const rolledBackMigrations = [...FEATURE_MIGRATIONS, CATEGORY_INDEX_MIGRATION];
    const dataDir = await tempDir('migrations-rollback');
    const oldMigrationsDir = await tempDir('migrations-before-feature');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => !rolledBackMigrations.includes(file))
        .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file))),
    );
    const startOld = () =>
      start({
        dataDir,
        migrationsDir: oldMigrationsDir,
        hooksDir: emptyHooksDir,
      });

    const oldServer = await startOld();
    await excludeLoopbackFromRateLimits(oldServer.superuser);
    const song = await createSong(oldServer.superuser, 'rollback');
    await oldServer.stop();

    const hasReleasedOn = async (superuser: PocketBase): Promise<boolean> =>
      fieldSummary(await superuser.collections.getOne('songs')).some(
        (field) => field.name === 'releasedOn',
      );
    const findQueryIndexes = async (superuser: PocketBase): Promise<string[]> => {
      const found = await Promise.all(
        QUERY_INDEXES.map(async ({ collection, name }) =>
          (await superuser.collections.getOne(collection)).indexes.some((index) =>
            index.includes(name),
          )
            ? [name]
            : [],
        ),
      );
      return found.flat();
    };
    const allIndexNames = QUERY_INDEXES.map(({ name }) => name);
    const expectExistingSong = async (superuser: PocketBase): Promise<void> => {
      expect((await superuser.collection('songs').getOne(song.id))['key']).toBe('rollback');
    };

    const upgraded = await start({ dataDir });
    expect(await hasReleasedOn(upgraded.superuser)).toBe(true);
    expect(await findQueryIndexes(upgraded.superuser)).toEqual(allIndexNames);
    await expectExistingSong(upgraded.superuser);
    await upgraded.stop();

    await migrateDown(dataDir, rolledBackMigrations.length);
    // The repository directory would re-apply the reverted migrations on serve.
    const rolledBack = await startOld();
    expect(await hasReleasedOn(rolledBack.superuser)).toBe(false);
    expect(await findQueryIndexes(rolledBack.superuser)).toEqual([]);
    await expectExistingSong(rolledBack.superuser);
    await rolledBack.stop();

    const reapplied = await start({ dataDir });
    expect(await hasReleasedOn(reapplied.superuser)).toBe(true);
    expect(await findQueryIndexes(reapplied.superuser)).toEqual(allIndexNames);
  });

  it('backfill marks and default nicknames for existing data and roll them back', async () => {
    const dataDir = await tempDir('migrations-achievements');
    const oldMigrationsDir = await tempDir('migrations-before-achievements');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => !ACHIEVEMENT_MIGRATIONS.includes(file))
        .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file))),
    );
    const startOld = () =>
      start({
        dataDir,
        migrationsDir: oldMigrationsDir,
        hooksDir: emptyHooksDir,
      });

    const oldServer = await startOld();
    const { superuser: oldSuperuser } = oldServer;
    await excludeLoopbackFromRateLimits(oldSuperuser);
    const user = await createUser(oldServer, 'scorer@example.com');
    const otherUser = await createUser(oldServer, 'other@example.com');
    const oldUsers = await oldSuperuser.collections.getOne('users');
    const song = await createSong(oldSuperuser, 'backfill');
    const easy = await createChart(
      oldSuperuser,
      song.id,
      'easy',
      fakeChartData('backfill', 'easy'),
    );
    const expert = await createChart(
      oldSuperuser,
      song.id,
      'expert',
      fakeChartData('backfill', 'expert'),
    );
    const counts = (great: number, good: number) => ({
      perfect: 10,
      great,
      good,
      bad: 0,
      miss: 0,
    });
    const scores = [
      {
        chart: easy,
        chartRevision: 'all',
        accuracy: 0.97,
        cleared: true,
        counts: counts(0, 0),
      },
      {
        chart: easy,
        chartRevision: 'fc',
        accuracy: 0.9,
        cleared: true,
        counts: counts(2, 0),
      },
      {
        chart: expert,
        chartRevision: 's',
        accuracy: 0.95,
        cleared: true,
        counts: counts(1, 1),
      },
      {
        chart: expert,
        chartRevision: 'failed',
        accuracy: 0.5,
        cleared: false,
        counts: counts(0, 0),
      },
    ];
    for (const { chart, ...score } of scores) {
      await oldSuperuser.collection('scores').create({
        user: user.id,
        chart: chart.id,
        score: 900_000,
        maxCombo: 10,
        ...score,
      });
    }
    await oldServer.stop();

    const mark = (kind: string, chart: RecordModel, chartRevision: string) => ({
      user: user.id,
      kind,
      song: song.id,
      difficulty: String(chart['difficulty']),
      chart: chart.id,
      chartRevision,
      constellation: '',
      source: 'backfill',
    });
    const expectedMarks = [
      mark('clear', easy, 'all'),
      mark('s', easy, 'all'),
      mark('fc', easy, 'all'),
      mark('ap', easy, 'all'),
      mark('clear', easy, 'fc'),
      mark('fc', easy, 'fc'),
      mark('clear', expert, 's'),
      mark('s', expert, 's'),
    ];
    const findMarks = async (superuser: PocketBase) =>
      (await superuser.collection('achievement_marks').getFullList()).map((record) =>
        Object.fromEntries(MARK_FIELDS.map((field) => [field, String(record[field])])),
      );
    const findCollectionNames = async (superuser: PocketBase): Promise<string[]> =>
      (await superuser.collections.getFullList())
        .map(({ name }) => name)
        .filter((name) => ACHIEVEMENT_COLLECTIONS.includes(name))
        .sort();

    const upgraded = await start({
      dataDir,
      hooksDir: emptyHooksDir,
    });
    expect(await findMarks(upgraded.superuser)).toEqual(expect.arrayContaining(expectedMarks));
    expect(await findMarks(upgraded.superuser)).toHaveLength(expectedMarks.length);
    expect(await upgraded.superuser.collection('play_results').getFullList()).toEqual([]);
    const nicknames = await Promise.all(
      [user, otherUser].map(async ({ id }) =>
        String((await upgraded.superuser.collection('users').getOne(id))['nickname']),
      ),
    );
    for (const nickname of nicknames) {
      expect(nickname).toMatch(DEFAULT_NICKNAME);
    }
    expect(new Set(nicknames).size).toBe(nicknames.length);
    const upgradedUsers = await upgraded.superuser.collections.getOne('users');
    expect(fieldSummary(upgradedUsers)).toEqual(
      expect.arrayContaining([
        {
          name: 'nickname',
          type: 'text',
          required: true,
        },
        {
          name: 'featuredAchievement',
          type: 'text',
          required: false,
        },
      ]),
    );
    expect(upgradedUsers.indexes).toContain(
      'CREATE UNIQUE INDEX `idx_users_nickname_nocase` ON `users` (nickname COLLATE NOCASE)',
    );
    await upgraded.stop();

    await migrateDown(dataDir, 1);
    const withoutProfile = await start({
      dataDir,
      migrationsDir: oldMigrationsDir,
      hooksDir: emptyHooksDir,
    });
    const rolledBackUsers = await withoutProfile.superuser.collections.getOne('users');
    expect(
      fieldSummary(rolledBackUsers).filter(({ name }) => PROFILE_FIELDS.includes(name)),
    ).toEqual([]);
    expect(rolledBackUsers.indexes).toEqual(oldUsers.indexes);
    expect(rolledBackUsers).toMatchObject({
      createRule: oldUsers.createRule,
      updateRule: oldUsers.updateRule,
    });
    await withoutProfile.stop();

    await migrateDown(dataDir, 1);
    const withoutBackfill = await start({
      dataDir,
      migrationsDir: oldMigrationsDir,
      hooksDir: emptyHooksDir,
    });
    expect(await findMarks(withoutBackfill.superuser)).toEqual([]);
    await withoutBackfill.stop();

    await migrateDown(dataDir, 1);
    const rolledBack = await startOld();
    expect(await findCollectionNames(rolledBack.superuser)).toEqual([]);
    await rolledBack.stop();

    const reapplied = await start({
      dataDir,
      hooksDir: emptyHooksDir,
    });
    expect(await findCollectionNames(reapplied.superuser)).toEqual(
      [...ACHIEVEMENT_COLLECTIONS].sort(),
    );
    expect(await findMarks(reapplied.superuser)).toHaveLength(expectedMarks.length);
  });

  it('add the songs category index and remove it on rollback', async () => {
    const dataDir = await tempDir('migrations-category-index');
    const oldMigrationsDir = await tempDir('migrations-before-category-index');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => file !== CATEGORY_INDEX_MIGRATION)
        .map((file) => copyFile(join(REPO_MIGRATIONS_DIR, file), join(oldMigrationsDir, file))),
    );
    const hasCategoryIndex = async (superuser: PocketBase): Promise<boolean> =>
      (await superuser.collections.getOne('songs')).indexes.some((index) =>
        index.includes('idx_songs_category_released_on_id'),
      );

    const upgraded = await start({
      dataDir,
      hooksDir: emptyHooksDir,
    });
    expect(await hasCategoryIndex(upgraded.superuser)).toBe(true);
    await upgraded.stop();

    await migrateDown(dataDir, 1);
    const rolledBack = await start({
      dataDir,
      migrationsDir: oldMigrationsDir,
      hooksDir: emptyHooksDir,
    });
    expect(await hasCategoryIndex(rolledBack.superuser)).toBe(false);
  });
});
