import { createHash } from 'node:crypto';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHARTS } from '../../../src/pbCollections.js';
import { where } from '../../../src/pbQuery.js';
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
      laneCount: 4,
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
      laneCount: 4,
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
      laneCount: 4,
      data,
    });
    const updated = await server.superuser
      .collection('charts')
      .update(created.id, { revision: 'forged' });
    expect(updated['revision']).toBe(expectedRevision(data));
  });
});

describe('charts laneCount', () => {
  it('rejects creating a chart whose data laneCount differs from the record laneCount', async () => {
    const charts = editor.client.collection('charts');
    await expect(
      charts.create({
        song: song.id,
        difficulty: 'expert',
        laneCount: 5,
        data: fakeChartData('revision', 'expert'),
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      charts.create({
        song: song.id,
        difficulty: 'expert',
        laneCount: 4,
        // JSON 직렬화에서 빠지므로 laneCount 가 없는 데이터가 된다.
        data: {
          ...fakeChartData('revision', 'expert'),
          laneCount: undefined,
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
    const filter = where(CHARTS, [
      {
        song: song.id,
        difficulty: 'expert',
      },
    ]);
    const stored = await server.superuser.collection(CHARTS.name).getFullList({
      filter: server.superuser.filter(filter.expression, filter.params),
    });
    expect(stored).toEqual([]);
  });

  it('rejects updating a chart so its data and record laneCount differ and keeps the record', async () => {
    const data = fakeChartData('revision', 'expert', 1_000, 6);
    const charts = editor.client.collection('charts');
    const created = await charts.create({
      song: song.id,
      difficulty: 'expert',
      laneCount: 6,
      data,
    });

    await expect(
      charts.update(created.id, { data: fakeChartData('revision', 'expert', 1_500, 5) }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(charts.update(created.id, { laneCount: 5 })).rejects.toMatchObject({
      status: 400,
    });
    const stored = await server.superuser.collection('charts').getOne(created.id);
    expect(stored).toMatchObject({
      laneCount: 6,
      data,
    });
    expect(stored['revision']).toBe(created['revision']);
  });
});
