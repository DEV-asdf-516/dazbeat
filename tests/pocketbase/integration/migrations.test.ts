import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CollectionModel } from 'pocketbase';
import { afterEach, describe, expect, it } from 'vitest';
import {
  REPO_MIGRATIONS_DIR,
  createTempDir,
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

// The schema as it was before this feature, i.e. what existing deployments already applied.
const PRE_FEATURE_MIGRATIONS = [
  '1791331200_create_songs_and_charts.js',
  '1791347685_add_users_is_editor.js',
  '1791350301_updated_users.js',
  '1791436800_add_songs_constellation.js',
];

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
    .map((field) => ({ name: field.name, type: field.type, required: field.required === true }));
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

    const charts = await collections.getOne('charts');
    expect(fieldSummary(charts)).toContainEqual({
      name: 'revision',
      type: 'text',
      required: false,
    });

    const playSessions = await collections.getOne('play_sessions');
    expect(fieldSummary(playSessions)).toEqual([
      { name: 'user', type: 'relation', required: true },
      { name: 'chart', type: 'relation', required: true },
      { name: 'chartRevision', type: 'text', required: true },
      { name: 'issuedAt', type: 'date', required: true },
      { name: 'expiresAt', type: 'date', required: true },
    ]);
    expect(playSessions).toMatchObject({
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: ['CREATE UNIQUE INDEX idx_play_sessions_user ON play_sessions (user)'],
    });

    const scores = await collections.getOne('scores');
    expect(fieldSummary(scores)).toEqual([
      { name: 'user', type: 'relation', required: true },
      { name: 'chart', type: 'relation', required: true },
      { name: 'chartRevision', type: 'text', required: true },
      { name: 'score', type: 'number', required: false },
      { name: 'accuracy', type: 'number', required: false },
      { name: 'maxCombo', type: 'number', required: false },
      { name: 'cleared', type: 'bool', required: false },
      { name: 'counts', type: 'json', required: false },
      { name: 'created', type: 'autodate', required: false },
      { name: 'updated', type: 'autodate', required: false },
    ]);
    expect(scores).toMatchObject({
      listRule: 'chartRevision = chart.revision',
      viewRule: 'chartRevision = chart.revision',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: [
        'CREATE UNIQUE INDEX idx_scores_user_chart_revision ON scores (user, chart, chartRevision)',
      ],
    });
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
    expect(storedUser).toMatchObject({ email: 'existing@example.com', isEditor: true });
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
});
