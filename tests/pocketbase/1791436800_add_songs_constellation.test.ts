import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { ZODIACS } from '../../src/data/songs.js';

const MIGRATION_URL = new URL(
  '../../pocketbase/pb_migrations/1791436800_add_songs_constellation.js',
  import.meta.url,
);

interface FakeField {
  name: string;
  options: Record<string, unknown>;
}

interface FakeCollection {
  name: string;
  fields: {
    list: FakeField[];
    add(field: FakeField): void;
    removeByName(name: string): void;
  };
}

interface FakeRecord {
  id: string;
  data: Record<string, unknown>;
  set(key: string, value: unknown): void;
}

interface FilterQuery {
  collection: string;
  filter: string;
  limit: number;
  params: Record<string, unknown>;
}

type Saved =
  | { kind: 'collection'; name: string; fields: FakeField[] }
  | { kind: 'record'; id: string; data: Record<string, unknown> };

type MigrationStep = (app: FakeApp) => void;

interface FakeApp {
  findCollectionByNameOrId(name: string): FakeCollection;
  findRecordsByFilter(
    collection: string,
    filter: string,
    sort: string,
    limit: number,
    offset: number,
    params: Record<string, unknown>,
  ): FakeRecord[];
  save(model: FakeCollection | FakeRecord): void;
}

function makeCollection(name: string): FakeCollection {
  const list: FakeField[] = [];
  return {
    name,
    fields: {
      list,
      add(field) {
        list.push(field);
      },
      removeByName(fieldName) {
        const index = list.findIndex((field) => field.name === fieldName);
        if (index >= 0) {
          list.splice(index, 1);
        }
      },
    },
  };
}

function makeRecord(id: string): FakeRecord {
  const data: Record<string, unknown> = {};
  return {
    id,
    data,
    set(key, value) {
      data[key] = value;
    },
  };
}

function makeApp(sampleRecords: FakeRecord[]) {
  const songs = makeCollection('songs');
  const saved: Saved[] = [];
  const queries: FilterQuery[] = [];
  const app: FakeApp = {
    findCollectionByNameOrId(name) {
      if (name !== 'songs') {
        throw new Error(`Unknown collection ${name}`);
      }
      return songs;
    },
    findRecordsByFilter(collection, filter, _sort, limit, _offset, params) {
      queries.push({ collection, filter, limit, params });
      return sampleRecords;
    },
    save(model) {
      if ('set' in model) {
        saved.push({ kind: 'record', id: model.id, data: { ...model.data } });
      } else {
        saved.push({ kind: 'collection', name: model.name, fields: [...model.fields.list] });
      }
    },
  };
  return { app, saved, queries };
}

async function loadMigration(): Promise<{ up: MigrationStep; down: MigrationStep }> {
  const source = await readFile(MIGRATION_URL, 'utf8');
  const steps: MigrationStep[] = [];
  const context = createContext({
    migrate(up: MigrationStep, down: MigrationStep) {
      steps.push(up, down);
    },
    SelectField: function SelectField(this: FakeField, options: Record<string, unknown>) {
      this.name = String(options.name);
      this.options = options;
    },
  });
  runInContext(source, context);
  const [up, down] = steps;
  if (steps.length !== 2 || up === undefined || down === undefined) {
    throw new Error('Migration must call migrate(up, down) exactly once');
  }
  return { up, down };
}

describe('1791436800_add_songs_constellation migration', () => {
  it('adds a required single select constellation field with the 12 zodiacs', async () => {
    const { up } = await loadMigration();
    const { app, saved } = makeApp([]);

    up(app);

    const songs = saved.find((entry) => entry.kind === 'collection');
    expect(songs).toEqual({
      kind: 'collection',
      name: 'songs',
      fields: [
        {
          name: 'constellation',
          options: { name: 'constellation', required: true, maxSelect: 1, values: [...ZODIACS] },
        },
      ],
    });
  });

  it('backfills the sample song with gemini after saving the field', async () => {
    const { up } = await loadMigration();
    const { app, saved, queries } = makeApp([makeRecord('sample-id')]);

    up(app);

    expect(queries).toEqual([
      { collection: 'songs', filter: 'key = {:key}', limit: 1, params: { key: 'sample' } },
    ]);
    expect(saved.map((entry) => entry.kind)).toEqual(['collection', 'record']);
    expect(saved[1]).toEqual({
      kind: 'record',
      id: 'sample-id',
      data: { constellation: 'gemini' },
    });
  });

  it('saves no record when there is no sample song', async () => {
    const { up } = await loadMigration();
    const { app, saved } = makeApp([]);

    up(app);

    expect(saved.some((entry) => entry.kind === 'record')).toBe(false);
  });

  it('removes the constellation field on down', async () => {
    const { up, down } = await loadMigration();
    const { app, saved } = makeApp([]);

    up(app);
    down(app);

    expect(saved.at(-1)).toEqual({ kind: 'collection', name: 'songs', fields: [] });
  });
});
