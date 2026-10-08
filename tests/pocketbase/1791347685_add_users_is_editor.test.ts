import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const MIGRATION_URL = new URL(
  '../../pocketbase/pb_migrations/1791347685_add_users_is_editor.js',
  import.meta.url,
);

const OWNER_RULE = 'id = @request.auth.id';
const CHARTS_EDITOR_RULE = '@request.auth.id != "" && @request.auth.isEditor = true';

type RuleName = 'listRule' | 'viewRule' | 'createRule' | 'updateRule' | 'deleteRule';
type Rules = Record<RuleName, string | null>;

// Mirrors the real JSVM, which exposes non-null rules as objects rather than JS strings.
interface RuleWrapper {
  toString(): string;
}

interface FakeField {
  name: string;
  options: Record<string, unknown>;
}

interface FakeCollection extends Record<RuleName, RuleWrapper | string | null> {
  name: string;
  fields: {
    list: FakeField[];
    add(field: FakeField): void;
    removeByName(name: string): void;
  };
}

interface SavedCollection {
  name: string;
  rules: Rules;
  fields: FakeField[];
}

type MigrationStep = (app: FakeApp) => void;

interface FakeApp {
  findCollectionByNameOrId(name: string): FakeCollection;
  save(collection: FakeCollection): void;
}

// PocketBase defaults for the users auth collection and the rules set by the first migration.
const DEFAULT_USERS_RULES: Rules = {
  listRule: OWNER_RULE,
  viewRule: OWNER_RULE,
  createRule: '',
  updateRule: OWNER_RULE,
  deleteRule: OWNER_RULE,
};
const PUBLIC_READ_RULES: Rules = {
  listRule: '',
  viewRule: '',
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

function wrapRule(rule: string | null): RuleWrapper | null {
  return rule === null ? null : { toString: () => rule };
}

function readRule(rule: RuleWrapper | string | null): string | null {
  return rule === null ? null : String(rule);
}

function makeCollection(name: string, rules: Rules): FakeCollection {
  const list: FakeField[] = [];
  return {
    name,
    listRule: wrapRule(rules.listRule),
    viewRule: wrapRule(rules.viewRule),
    createRule: wrapRule(rules.createRule),
    updateRule: wrapRule(rules.updateRule),
    deleteRule: wrapRule(rules.deleteRule),
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

function makeApp(usersRules: Partial<Rules> = {}) {
  const collections = new Map<string, FakeCollection>([
    ['users', makeCollection('users', { ...DEFAULT_USERS_RULES, ...usersRules })],
    ['charts', makeCollection('charts', PUBLIC_READ_RULES)],
    ['songs', makeCollection('songs', PUBLIC_READ_RULES)],
  ]);
  const saved: SavedCollection[] = [];
  const app: FakeApp = {
    findCollectionByNameOrId(name) {
      const collection = collections.get(name);
      if (collection === undefined) {
        throw new Error(`Unknown collection ${name}`);
      }
      return collection;
    },
    save(collection) {
      const rules: Rules = {
        listRule: readRule(collection.listRule),
        viewRule: readRule(collection.viewRule),
        createRule: readRule(collection.createRule),
        updateRule: readRule(collection.updateRule),
        deleteRule: readRule(collection.deleteRule),
      };
      saved.push({ name: collection.name, rules, fields: [...collection.fields.list] });
    },
  };
  return { app, saved };
}

async function loadMigration(): Promise<{ up: MigrationStep; down: MigrationStep }> {
  const source = await readFile(MIGRATION_URL, 'utf8');
  const steps: MigrationStep[] = [];
  const context = createContext({
    migrate(up: MigrationStep, down: MigrationStep) {
      steps.push(up, down);
    },
    BoolField: function BoolField(this: FakeField, options: Record<string, unknown>) {
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

function lastSaved(saved: SavedCollection[], name: string): SavedCollection {
  const collection = saved.findLast((entry) => entry.name === name);
  if (collection === undefined) {
    throw new Error(`${name} was not saved`);
  }
  return collection;
}

describe('1791347685_add_users_is_editor migration', () => {
  it('adds a non-required isEditor bool field and appends invariants to default rules', async () => {
    const { up } = await loadMigration();
    const { app, saved } = makeApp();

    up(app);

    const users = lastSaved(saved, 'users');
    expect(users.fields).toEqual([{ name: 'isEditor', options: { name: 'isEditor' } }]);
    expect(users.fields[0]?.options.required).toBeUndefined();
    expect(users.rules).toEqual({
      listRule: OWNER_RULE,
      viewRule: OWNER_RULE,
      createRule: '@request.body.isEditor:isset = false',
      updateRule: '(id = @request.auth.id) && @request.body.isEditor:changed = false',
      deleteRule: OWNER_RULE,
    });
    expect(lastSaved(saved, 'charts').rules).toEqual({
      listRule: '',
      viewRule: '',
      createRule: CHARTS_EDITOR_RULE,
      updateRule: CHARTS_EDITOR_RULE,
      deleteRule: null,
    });
    expect(saved.some((entry) => entry.name === 'songs')).toBe(false);
  });

  it('keeps null users create and update rules null', async () => {
    const { up } = await loadMigration();
    const { app, saved } = makeApp({ createRule: null, updateRule: null });

    up(app);

    const users = lastSaved(saved, 'users');
    expect(users.rules.createRule).toBeNull();
    expect(users.rules.updateRule).toBeNull();
  });

  it('wraps a non-empty users create rule before appending the invariant', async () => {
    const { up } = await loadMigration();
    const { app, saved } = makeApp({ createRule: 'verified = true' });

    up(app);

    expect(lastSaved(saved, 'users').rules.createRule).toBe(
      '(verified = true) && @request.body.isEditor:isset = false',
    );
  });

  it.each([
    ['default', {}],
    ['null', { createRule: null, updateRule: null }],
    ['custom', { createRule: 'verified = true' }],
  ] as const)('restores %s users rules and removes isEditor on down', async (_, usersRules) => {
    const { up, down } = await loadMigration();
    const { app, saved } = makeApp(usersRules);
    const expectedRules = { ...DEFAULT_USERS_RULES, ...usersRules };

    up(app);
    down(app);

    const users = lastSaved(saved, 'users');
    expect(users.rules).toEqual(expectedRules);
    expect(users.fields).toEqual([]);
    const charts = lastSaved(saved, 'charts');
    expect(charts.rules.createRule).toBeNull();
    expect(charts.rules.updateRule).toBeNull();
  });

  it('throws on down when a users rule is not in the form up produced', async () => {
    const { down } = await loadMigration();
    const { app } = makeApp({ createRule: 'verified = true' });

    expect(() => down(app)).toThrow('verified = true');
  });
});
