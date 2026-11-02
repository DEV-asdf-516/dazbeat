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
      baseRevision: String(created['revision']),
    });
    expect(afterChange['revision']).toBe(expectedRevision(changed));
    expect(afterChange['revision']).not.toBe(created['revision']);

    const afterSameSave = await charts.update(created.id, {
      data: changed,
      baseRevision: String(afterChange['revision']),
    });
    expect(afterSameSave['revision']).toBe(afterChange['revision']);

    const afterRevert = await charts.update(created.id, {
      data: original,
      baseRevision: String(afterSameSave['revision']),
    });
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
      charts.update(created.id, {
        data: fakeChartData('revision', 'expert', 1_500, 5),
        baseRevision: String(created['revision']),
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      charts.update(created.id, {
        laneCount: 5,
        baseRevision: String(created['revision']),
      }),
    ).rejects.toMatchObject({
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

describe('charts full validation', () => {
  const invalidChart = {
    status: 400,
    response: { data: { data: { code: 'invalid_chart' } } },
  };
  let validationSong: RecordModel;
  let otherSong: RecordModel;

  function invalidData(): Record<string, unknown>[] {
    const valid = fakeChartData('validation', 'normal');
    return [
      {
        ...valid,
        notes: undefined,
      },
      {
        ...valid,
        notes: 'notes',
      },
      {
        ...valid,
        notes: [],
      },
      {
        ...valid,
        songId: 'validation-other',
      },
      {
        ...valid,
        difficulty: 'hard',
      },
      {
        ...valid,
        laneCount: 5,
      },
      {
        ...valid,
        notes: [
          {
            type: 'tap',
            timeMs: -1,
            lane: 0,
          },
        ],
      },
      {
        ...valid,
        notes: [
          {
            type: 'hold',
            timeMs: 4_000,
            endTimeMs: 5_001,
            lane: 0,
          },
        ],
      },
      {
        ...valid,
        notes: [
          {
            type: 'tap',
            timeMs: 2_000,
            lane: 0,
          },
          {
            type: 'tap',
            timeMs: 1_000,
            lane: 1,
          },
        ],
      },
      {
        ...valid,
        notes: [
          {
            type: 'hold',
            timeMs: 1_000,
            endTimeMs: 2_000,
            lane: 0,
          },
          {
            type: 'tap',
            timeMs: 1_500,
            lane: 0,
          },
        ],
      },
    ];
  }

  beforeAll(async () => {
    validationSong = await createSong(server.superuser, 'validation');
    otherSong = await createSong(server.superuser, 'validation-other');
  });

  it('accepts a valid chart on create and update', async () => {
    const charts = editor.client.collection('charts');
    const created = await charts.create({
      song: otherSong.id,
      difficulty: 'easy',
      laneCount: 4,
      data: fakeChartData('validation-other', 'easy'),
    });
    const changed = fakeChartData('validation-other', 'easy', 1_500);
    const updated = await charts.update(created.id, {
      data: changed,
      baseRevision: String(created['revision']),
    });
    expect(updated['data']).toEqual(changed);
  });

  it('rejects creating an invalid chart', async () => {
    const charts = editor.client.collection('charts');
    for (const data of invalidData()) {
      await expect(
        charts.create({
          song: validationSong.id,
          difficulty: 'normal',
          laneCount: 4,
          data,
        }),
      ).rejects.toMatchObject(invalidChart);
    }
    const filter = where(CHARTS, [{ song: validationSong.id }]);
    const stored = await server.superuser.collection(CHARTS.name).getFullList({
      filter: server.superuser.filter(filter.expression, filter.params),
    });
    expect(stored).toEqual([]);
  });

  it('rejects a superuser creating an invalid chart', async () => {
    await expect(
      server.superuser.collection('charts').create({
        song: validationSong.id,
        difficulty: 'normal',
        laneCount: 4,
        data: {
          ...fakeChartData('validation', 'normal'),
          notes: [],
        },
      }),
    ).rejects.toMatchObject(invalidChart);
  });

  it('rejects updating to an invalid chart and keeps the data and revision', async () => {
    const data = fakeChartData('validation', 'normal');
    const charts = editor.client.collection('charts');
    const created = await charts.create({
      song: validationSong.id,
      difficulty: 'normal',
      laneCount: 4,
      data,
    });

    for (const invalid of invalidData()) {
      await expect(
        charts.update(created.id, {
          data: invalid,
          baseRevision: String(created['revision']),
        }),
      ).rejects.toMatchObject(invalidChart);
    }
    await expect(
      charts.update(created.id, {
        laneCount: 5,
        baseRevision: String(created['revision']),
      }),
    ).rejects.toMatchObject(invalidChart);
    await expect(
      charts.update(created.id, {
        difficulty: 'hard',
        baseRevision: String(created['revision']),
      }),
    ).rejects.toMatchObject(invalidChart);
    await expect(
      charts.update(created.id, {
        song: otherSong.id,
        baseRevision: String(created['revision']),
      }),
    ).rejects.toMatchObject(invalidChart);
    const stored = await server.superuser.collection('charts').getOne(created.id);
    expect(stored).toMatchObject({
      song: validationSong.id,
      difficulty: 'normal',
      laneCount: 4,
      data,
    });
    expect(stored['revision']).toBe(created['revision']);
  });
});

describe('charts save conflicts', () => {
  const revisionConflict = {
    status: 409,
    response: { data: { baseRevision: { code: 'chart_revision_conflict' } } },
  };
  let conflictSong: RecordModel;
  let otherEditor: TestUser;

  beforeAll(async () => {
    conflictSong = await createSong(server.superuser, 'conflict');
    otherEditor = await createUser(server, 'other-editor@example.com', true);
  });

  async function createConflictChart(difficulty: string): Promise<RecordModel> {
    return editor.client.collection('charts').create({
      song: conflictSong.id,
      difficulty,
      laneCount: 4,
      data: fakeChartData('conflict', difficulty),
    });
  }

  it('rejects a save based on a revision another editor already replaced', async () => {
    const created = await createConflictChart('easy');
    const first = fakeChartData('conflict', 'easy', 1_500);
    const saved = await editor.client.collection('charts').update(created.id, {
      data: first,
      baseRevision: String(created['revision']),
    });

    await expect(
      otherEditor.client.collection('charts').update(created.id, {
        data: fakeChartData('conflict', 'easy', 2_000),
        baseRevision: String(created['revision']),
      }),
    ).rejects.toMatchObject(revisionConflict);
    const stored = await server.superuser.collection('charts').getOne(created.id);
    expect(stored['data']).toEqual(first);
    expect(stored['revision']).toBe(saved['revision']);
  });

  it('lets exactly one of two concurrent saves on the same revision through', async () => {
    const created = await createConflictChart('normal');
    const candidates = [
      fakeChartData('conflict', 'normal', 1_500),
      fakeChartData('conflict', 'normal', 2_000),
    ];
    const results = await Promise.allSettled(
      [editor, otherEditor].map((author, index) =>
        author.client.collection('charts').update(created.id, {
          data: candidates[index],
          baseRevision: String(created['revision']),
        }),
      ),
    );

    const fulfilled = results.flatMap((result, index) =>
      result.status === 'fulfilled' ? [candidates[index]] : [],
    );
    const rejected = results.flatMap((result): unknown[] =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject(revisionConflict);
    const stored = await server.superuser.collection('charts').getOne(created.id);
    expect(stored['data']).toEqual(fulfilled[0]);
  });

  it.each<[string, unknown]>([
    ['missing', undefined],
    ['empty', ''],
    ['a number', 1],
  ])('rejects an editor save whose baseRevision is %s', async (_label, baseRevision) => {
    const created = await createConflictChart('hard');
    await expect(
      editor.client.collection('charts').update(created.id, {
        data: fakeChartData('conflict', 'hard', 1_500),
        baseRevision,
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { data: { baseRevision: { code: 'base_revision_required' } } },
    });
    const stored = await server.superuser.collection('charts').getOne(created.id);
    expect(stored['data']).toEqual(created['data']);
    expect(stored['revision']).toBe(created['revision']);
    await server.superuser.collection('charts').delete(created.id);
  });

  it('lets a superuser save without a baseRevision', async () => {
    const created = await createConflictChart('expert');
    const data = fakeChartData('conflict', 'expert', 1_500);
    const updated = await server.superuser.collection('charts').update(created.id, { data });
    expect(updated['data']).toEqual(data);
    expect(updated['revision']).toBe(expectedRevision(data));
  });
});
