import { cp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DELETED_ACCOUNT_IDENTITIES } from '../../../src/pbCollections.js';
import {
  OTHER_REJOIN_TEST_KEY,
  REJOIN_TEST_KEY,
  createTapChart,
  issuePlaySession,
  linkGoogleIdentity,
  playRanked,
  readUserOwnedRowCounts,
  rejoinDigest,
  rejoinKeyId,
} from './accountTestData.js';
import {
  REPO_HOOKS_DIR,
  createTempDir,
  removeTempDir,
  startPocketBase,
} from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import { createUser, excludeLoopbackFromRateLimits } from './testData.js';
import type { TestUser } from './testData.js';

const ACCOUNT_PATH = '/api/dazbeat/account';
const USER_OWNED_COLLECTIONS = [
  'play_sessions',
  'scores',
  'play_session_quotas',
  'play_results',
  'earned_chart_marks',
  'earned_song_marks',
  'earned_achievements',
  '_externalAuths',
];

interface KeyEnv {
  current: string;
  retired?: string;
}

const tempDirs: string[] = [];
const servers: PocketBaseServer[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await createTempDir(prefix);
  tempDirs.push(dir);
  return dir;
}

async function start(dataDir: string, keys: KeyEnv, hooksDir?: string): Promise<PocketBaseServer> {
  const server = await startPocketBase({
    dataDir,
    ...(hooksDir === undefined ? {} : { hooksDir }),
    // Both variables are always given so the developer's shell values never leak in.
    env: {
      DAZBEAT_REJOIN_BLOCK_HMAC_KEY: keys.current,
      DAZBEAT_REJOIN_BLOCK_HMAC_RETIRED_KEYS: keys.retired ?? '',
    },
  });
  servers.push(server);
  await excludeLoopbackFromRateLimits(server.superuser);
  return server;
}

/** Copies the repository hooks with their built lib and adds one hook that fails a record delete. */
async function hooksFailingDeleteOf(collection: string): Promise<string> {
  const dir = await tempDir('hooks-failing-delete');
  await cp(REPO_HOOKS_DIR, dir, { recursive: true });
  await writeFile(
    join(dir, 'failDelete.pb.js'),
    `onRecordDelete(() => {
  throw new Error('Injected delete failure');
}, '${collection}');
`,
  );
  return dir;
}

function requestDeletion(
  server: PocketBaseServer,
  token?: string,
  request: { body?: string; query?: string } = {},
): Promise<Response> {
  return fetch(`${server.url}${ACCOUNT_PATH}${request.query ?? ''}`, {
    method: 'DELETE',
    headers: {
      ...(token === undefined ? {} : { Authorization: token }),
      ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(request.body === undefined ? {} : { body: request.body }),
  });
}

async function expectRejected(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({
    status,
    code,
    message: expect.any(String) as unknown,
  });
}

function readBlockRows(superuser: PocketBase): Promise<RecordModel[]> {
  return superuser.collection(DELETED_ACCOUNT_IDENTITIES.name).getFullList();
}

async function userExists(superuser: PocketBase, userId: string): Promise<boolean> {
  const users = await superuser.collection('users').getFullList({
    filter: superuser.filter('id = {:userId}', { userId }),
  });
  return users.length > 0;
}

function tokenOf(user: TestUser): string {
  return user.client.authStore.token;
}

let accountCount = 0;

/** A Google-linked player with a perfect ranked play and one open session. */
async function createPlayer(
  server: PocketBaseServer,
  chart: RecordModel,
): Promise<{ user: TestUser; providerId: string }> {
  accountCount += 1;
  const user = await createUser(server, `account${accountCount}@example.com`);
  const providerId = `google-sub-${accountCount}`;
  await linkGoogleIdentity(server.superuser, user.id, providerId);
  await playRanked(server.superuser, user, chart);
  await issuePlaySession(user, chart);
  return {
    user,
    providerId,
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(tempDirs.splice(0).map((dir) => removeTempDir(dir)));
});

describe('DELETE /api/dazbeat/account', () => {
  let server: PocketBaseServer;
  let dataDir: string;
  let chart: RecordModel;

  beforeAll(async () => {
    dataDir = await createTempDir('account-deletion');
    server = await startPocketBase({
      dataDir,
      env: {
        DAZBEAT_REJOIN_BLOCK_HMAC_KEY: REJOIN_TEST_KEY,
        DAZBEAT_REJOIN_BLOCK_HMAC_RETIRED_KEYS: '',
      },
    });
    await excludeLoopbackFromRateLimits(server.superuser);
    chart = await createTapChart(server.superuser, 'account');
  });

  afterAll(async () => {
    await server.stop();
    await removeTempDir(dataDir);
  });

  it('deletes the user with every owned row and leaves one block row and other users', async () => {
    const { superuser } = server;
    const { user, providerId } = await createPlayer(server, chart);
    const other = await createPlayer(server, chart);
    const blockRowsBefore = await readBlockRows(superuser);
    const before = await readUserOwnedRowCounts(superuser, user.id);
    for (const collection of USER_OWNED_COLLECTIONS) {
      expect(before[collection], collection).toBeGreaterThan(0);
    }
    const otherBefore = await readUserOwnedRowCounts(superuser, other.user.id);

    const response = await requestDeletion(server, tokenOf(user));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    const after = await readUserOwnedRowCounts(superuser, user.id);
    expect(Object.values(after).every((count) => count === 0)).toBe(true);
    expect(Object.keys(after)).toEqual(expect.arrayContaining(USER_OWNED_COLLECTIONS));
    expect(await userExists(superuser, user.id)).toBe(false);
    const newRows = (await readBlockRows(superuser)).filter(
      (row) => !blockRowsBefore.some((old) => old.id === row.id),
    );
    expect(newRows).toHaveLength(1);
    expect(newRows[0]).toMatchObject({
      provider: 'google',
      identityDigest: rejoinDigest(REJOIN_TEST_KEY, providerId),
      keyId: rejoinKeyId(REJOIN_TEST_KEY),
    });
    const blockCollection = await superuser.collections.getOne(DELETED_ACCOUNT_IDENTITIES.name);
    expect(blockCollection.fields.map((field) => field.name)).toEqual([
      'id',
      'provider',
      'identityDigest',
      'keyId',
      'deletedAt',
    ]);
    expect(await userExists(superuser, other.user.id)).toBe(true);
    expect(await readUserOwnedRowCounts(superuser, other.user.id)).toEqual(otherBefore);
    await expect(superuser.collection('charts').getOne(chart.id)).resolves.toBeDefined();
    await expect(
      superuser.collection('songs').getOne(String(chart['song'])),
    ).resolves.toBeDefined();
  });

  it('rejects an anonymous request and deletes only the token owner', async () => {
    const { superuser } = server;
    const { user } = await createPlayer(server, chart);
    const other = await createPlayer(server, chart);
    const otherBefore = await readUserOwnedRowCounts(superuser, other.user.id);
    const blockRowCount = (await readBlockRows(superuser)).length;

    expect((await requestDeletion(server)).status).toBe(401);
    expect(await userExists(superuser, user.id)).toBe(true);
    expect(await readBlockRows(superuser)).toHaveLength(blockRowCount);

    const response = await requestDeletion(server, tokenOf(user), {
      body: JSON.stringify({
        id: other.user.id,
        userId: other.user.id,
      }),
      query: `?id=${other.user.id}&userId=${other.user.id}`,
    });

    expect(response.status).toBe(204);
    expect(await userExists(superuser, user.id)).toBe(false);
    expect(await userExists(superuser, other.user.id)).toBe(true);
    expect(await readUserOwnedRowCounts(superuser, other.user.id)).toEqual(otherBefore);
    expect(await readBlockRows(superuser)).toHaveLength(blockRowCount + 1);
  });

  it('closes the standard users delete and direct sign-up but keeps superuser accounts', async () => {
    const { superuser } = server;
    const { user } = await createPlayer(server, chart);
    const other = await createPlayer(server, chart);

    await expect(user.client.collection('users').delete(user.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(user.client.collection('users').delete(other.user.id)).rejects.toMatchObject({
      status: 403,
    });
    expect(await userExists(superuser, user.id)).toBe(true);
    expect(await userExists(superuser, other.user.id)).toBe(true);

    const anonymous = await fetch(`${server.url}/api/collections/users/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'direct-signup@example.com',
        password: 'direct-password',
        passwordConfirm: 'direct-password',
      }),
    });
    expect(anonymous.status).toBe(400);
    const signedUp = await superuser.collection('users').getFullList({
      filter: superuser.filter('email = {:email}', { email: 'direct-signup@example.com' }),
    });
    expect(signedUp).toEqual([]);

    // createUser signs in with the password of the account the superuser created.
    const created = await createUser(server, 'superuser-created@example.com');
    expect(created.client.authStore.isValid).toBe(true);
  });

  it('rejects a user without a Google identity and changes nothing', async () => {
    const { superuser } = server;
    const user = await createUser(server, 'password-only@example.com');
    await playRanked(superuser, user, chart);
    const before = await readUserOwnedRowCounts(superuser, user.id);
    const blockRowCount = (await readBlockRows(superuser)).length;

    await expectRejected(
      await requestDeletion(server, tokenOf(user)),
      409,
      'account_identity_missing',
    );

    expect(await userExists(superuser, user.id)).toBe(true);
    expect(await readUserOwnedRowCounts(superuser, user.id)).toEqual(before);
    expect(await readBlockRows(superuser)).toHaveLength(blockRowCount);
  });

  it('deletes only once for concurrent requests of the same user', async () => {
    const { superuser } = server;
    const { user } = await createPlayer(server, chart);
    const blockRowCount = (await readBlockRows(superuser)).length;

    const responses = await Promise.all([
      requestDeletion(server, tokenOf(user)),
      requestDeletion(server, tokenOf(user)),
    ]);

    expect(responses.filter((response) => response.status === 204)).toHaveLength(1);
    expect(await readBlockRows(superuser)).toHaveLength(blockRowCount + 1);
    expect(await userExists(superuser, user.id)).toBe(false);
  });
});

describe('DELETE /api/dazbeat/account rollback', () => {
  async function expectDeletionRolledBack(server: PocketBaseServer): Promise<void> {
    const chart = await createTapChart(server.superuser, 'rollback');
    const { user } = await createPlayer(server, chart);
    const before = await readUserOwnedRowCounts(server.superuser, user.id);

    const response = await requestDeletion(server, tokenOf(user));

    expect(response.ok).toBe(false);
    expect(await userExists(server.superuser, user.id)).toBe(true);
    expect(await readUserOwnedRowCounts(server.superuser, user.id)).toEqual(before);
  }

  it('keeps everything when the block row of the identity already exists', async () => {
    const server = await start(await tempDir('account-duplicate'), { current: REJOIN_TEST_KEY });
    const { superuser } = server;
    const chart = await createTapChart(superuser, 'duplicate');
    const { user, providerId } = await createPlayer(server, chart);
    const existing = await superuser.collection(DELETED_ACCOUNT_IDENTITIES.name).create({
      provider: 'google',
      identityDigest: rejoinDigest(REJOIN_TEST_KEY, providerId),
      keyId: rejoinKeyId(REJOIN_TEST_KEY),
    });
    const before = await readUserOwnedRowCounts(superuser, user.id);

    const response = await requestDeletion(server, tokenOf(user));

    expect(response.ok).toBe(false);
    expect(await userExists(superuser, user.id)).toBe(true);
    expect(await readUserOwnedRowCounts(superuser, user.id)).toEqual(before);
    expect((await readBlockRows(superuser)).map((row) => row.id)).toEqual([existing.id]);
  });

  it.each(['users', 'earned_achievements'])(
    'keeps everything when deleting a %s record fails',
    async (collection) => {
      const server = await start(
        await tempDir('account-failing-delete'),
        { current: REJOIN_TEST_KEY },
        await hooksFailingDeleteOf(collection),
      );

      await expectDeletionRolledBack(server);

      expect(await readBlockRows(server.superuser)).toEqual([]);
    },
  );
});

describe('DELETE /api/dazbeat/account keys', () => {
  it.each([
    ['an unset current key', { current: '' }],
    ['a 31 character current key', { current: 'k'.repeat(31) }],
    [
      'a short retired key',
      {
        current: REJOIN_TEST_KEY,
        retired: `${OTHER_REJOIN_TEST_KEY}, short-key`,
      },
    ],
  ])('rejects %s and changes nothing', async (_name, keys: KeyEnv) => {
    const server = await start(await tempDir('account-invalid-key'), keys);
    const { superuser } = server;
    const chart = await createTapChart(superuser, 'invalid-key');
    const { user } = await createPlayer(server, chart);
    const before = await readUserOwnedRowCounts(superuser, user.id);

    await expectRejected(
      await requestDeletion(server, tokenOf(user)),
      503,
      'rejoin_block_unavailable',
    );

    expect(await userExists(superuser, user.id)).toBe(true);
    expect(await readUserOwnedRowCounts(superuser, user.id)).toEqual(before);
    expect(await readBlockRows(superuser)).toEqual([]);
  });

  it('rejects rows of an unknown key until the key is retired', async () => {
    const dataDir = await tempDir('account-key-rotation');
    const withKeyA = await start(dataDir, { current: REJOIN_TEST_KEY });
    const chart = await createTapChart(withKeyA.superuser, 'rotation');
    const first = await createPlayer(withKeyA, chart);
    const second = await createPlayer(withKeyA, chart);
    expect((await requestDeletion(withKeyA, tokenOf(first.user))).status).toBe(204);
    await withKeyA.stop();

    const withKeyB = await start(dataDir, { current: OTHER_REJOIN_TEST_KEY });
    const before = await readUserOwnedRowCounts(withKeyB.superuser, second.user.id);
    await expectRejected(
      await requestDeletion(withKeyB, tokenOf(second.user)),
      503,
      'rejoin_block_unavailable',
    );
    expect(await userExists(withKeyB.superuser, second.user.id)).toBe(true);
    expect(await readUserOwnedRowCounts(withKeyB.superuser, second.user.id)).toEqual(before);
    expect(await readBlockRows(withKeyB.superuser)).toHaveLength(1);
    await withKeyB.stop();

    const rotated = await start(dataDir, {
      current: OTHER_REJOIN_TEST_KEY,
      retired: REJOIN_TEST_KEY,
    });
    expect((await requestDeletion(rotated, tokenOf(second.user))).status).toBe(204);
    expect(await userExists(rotated.superuser, second.user.id)).toBe(false);
    const rows = await readBlockRows(rotated.superuser);
    expect(rows.map((row) => String(row['keyId'])).sort()).toEqual(
      [rejoinKeyId(REJOIN_TEST_KEY), rejoinKeyId(OTHER_REJOIN_TEST_KEY)].sort(),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        identityDigest: rejoinDigest(OTHER_REJOIN_TEST_KEY, second.providerId),
        keyId: rejoinKeyId(OTHER_REJOIN_TEST_KEY),
      }),
    );
  });
});
