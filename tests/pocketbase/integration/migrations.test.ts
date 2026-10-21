import { copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type PocketBase from 'pocketbase';
import type { CollectionModel } from 'pocketbase';
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
const FEATURE_MIGRATIONS = [RELEASED_ON_MIGRATION, '1792554700_add_query_indexes.js'];
const QUERY_INDEXES = [
  {
    collection: 'songs',
    name: 'idx_songs_released_on_id',
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

  it('keep existing data and backfill chart revisions', async () => {
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
    const data = fakeChartData('existing', 'easy');
    const chart = await createChart(oldServer.superuser, song.id, 'easy', data);
    expect(chart['revision']).toBeUndefined();
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
    const storedChart = await superuser.collection('charts').getOne(chart.id);
    expect(storedChart['data']).toEqual(data);
    expect(storedChart['revision']).toMatch(/^[0-9a-f]{64}$/);

    const resaved = await superuser.collection('charts').update(chart.id, { data });
    expect(resaved['revision']).toBe(storedChart['revision']);
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
    const dataDir = await tempDir('migrations-rollback');
    const oldMigrationsDir = await tempDir('migrations-before-feature');
    const emptyHooksDir = await tempDir('hooks-empty');
    const repoMigrations = await readdir(REPO_MIGRATIONS_DIR);
    await Promise.all(
      repoMigrations
        .filter((file) => !FEATURE_MIGRATIONS.includes(file))
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

    await migrateDown(dataDir, FEATURE_MIGRATIONS.length);
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
});
