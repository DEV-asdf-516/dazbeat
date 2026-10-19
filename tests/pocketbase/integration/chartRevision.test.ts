import { createHash } from 'node:crypto';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTempDir, removeTempDir, startPocketBase } from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import {
  createSong,
  createUser,
  excludeLoopbackFromRateLimits,
  fakeChartData,
} from './testData.js';
import type { TestUser } from './testData.js';

let dataDir: string;
let server: PocketBaseServer;
let song: RecordModel;
let editor: TestUser;

// PocketBase stores a JSON field as compact JSON with object keys sorted, like Go's encoding/json.
function storedJson(value: unknown): string {
  return JSON.stringify(value, (_key, field: unknown) =>
    field !== null && typeof field === 'object' && !Array.isArray(field)
      ? Object.fromEntries(Object.entries(field).sort(([a], [b]) => (a < b ? -1 : 1)))
      : field,
  );
}

function expectedRevision(data: unknown): string {
  return createHash('sha256').update(storedJson(data)).digest('hex');
}

beforeAll(async () => {
  dataDir = await createTempDir('chart-revision');
  server = await startPocketBase({ dataDir });
  await excludeLoopbackFromRateLimits(server.superuser);
  editor = await createUser(server, 'editor@example.com', true);
  song = await createSong(server.superuser, 'revision');
});

afterAll(async () => {
  await server?.stop();
  await removeTempDir(dataDir);
});

describe('charts.revision', () => {
  it('is the SHA-256 of the stored data and ignores a forged revision on create', async () => {
    const data = fakeChartData('revision', 'easy');
    const created = await editor.client.collection('charts').create({
      song: song.id,
      difficulty: 'easy',
      data,
      revision: 'forged',
    });
    expect(created['revision']).toBe(expectedRevision(data));
    const stored = await server.superuser.collection('charts').getOne(created.id);
    expect(stored['revision']).toBe(expectedRevision(data));
  });

  it('changes with the content, stays for the same content and returns for reverted content', async () => {
    const original = fakeChartData('revision', 'normal');
    const changed = fakeChartData('revision', 'normal', 1_500);
    const charts = editor.client.collection('charts');
    const created = await charts.create({
      song: song.id,
      difficulty: 'normal',
      data: original,
    });

    const afterChange = await charts.update(created.id, {
      data: changed,
      revision: 'forged',
    });
    expect(afterChange['revision']).toBe(expectedRevision(changed));
    expect(afterChange['revision']).not.toBe(created['revision']);

    const afterSameSave = await charts.update(created.id, { data: changed });
    expect(afterSameSave['revision']).toBe(afterChange['revision']);

    const afterRevert = await charts.update(created.id, { data: original });
    expect(afterRevert['revision']).toBe(created['revision']);
  });

  it('is recomputed on superuser updates too', async () => {
    const data = fakeChartData('revision', 'hard');
    const created = await server.superuser.collection('charts').create({
      song: song.id,
      difficulty: 'hard',
      data,
    });
    const updated = await server.superuser
      .collection('charts')
      .update(created.id, { revision: 'forged' });
    expect(updated['revision']).toBe(expectedRevision(data));
  });
});
