import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DELETED_ACCOUNT_IDENTITIES } from '../../../src/pbCollections.js';
import {
  REJOIN_TEST_KEY,
  createTapChart,
  issuePlaySession,
  playRanked,
  readUserOwnedRowCounts,
  rejoinDigest,
  signInWithGoogle,
  startFakeGoogle,
} from './accountTestData.js';
import type { FakeGoogle, GoogleIdentity } from './accountTestData.js';
import {
  REPO_MIGRATIONS_DIR,
  createClient,
  createTempDir,
  removeTempDir,
  startPocketBase,
} from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import { excludeLoopbackFromRateLimits } from './testData.js';
import type { TestUser } from './testData.js';

const ACCOUNT_PATH = '/api/dazbeat/account';
const CONCURRENT_SIGN_INS = 4;

let tempDir: string;
let server: PocketBaseServer;
let fakeGoogle: FakeGoogle;
let chart: RecordModel;
let identityCount = 0;

function newIdentity(): GoogleIdentity {
  identityCount += 1;
  return {
    sub: `lifecycle-sub-${identityCount}`,
    email: `lifecycle${identityCount}@example.com`,
  };
}

/** Signs up or in through the real OAuth flow; the returned user keeps the issued token. */
async function signIn(identity: GoogleIdentity): Promise<TestUser> {
  const client = createClient(server.url);
  const { record } = await signInWithGoogle(client, fakeGoogle, identity);
  return {
    id: record.id,
    email: identity.email,
    client,
  };
}

function requestDeletion(user: TestUser): Promise<Response> {
  return fetch(`${server.url}${ACCOUNT_PATH}`, {
    method: 'DELETE',
    headers: { Authorization: user.client.authStore.token },
  });
}

async function countRows(collection: string, filter: string, params: object): Promise<number> {
  const { superuser } = server;
  return (
    await superuser.collection(collection).getList(1, 1, {
      filter: superuser.filter(filter, params),
    })
  ).totalItems;
}

const countUsers = (email: string) => countRows('users', 'email = {:email}', { email });
const countLinks = (sub: string) =>
  countRows('_externalAuths', 'provider = "google" && providerId = {:sub}', { sub });
const countBlockRows = (sub: string) =>
  countRows(DELETED_ACCOUNT_IDENTITIES.name, 'identityDigest = {:digest}', {
    digest: rejoinDigest(REJOIN_TEST_KEY, sub),
  });

async function countAll(collection: string): Promise<number> {
  return (await server.superuser.collection(collection).getList(1, 1)).totalItems;
}

function expectAllZero(counts: Record<string, number>): void {
  expect(Object.values(counts).every((count) => count === 0)).toBe(true);
}

async function expectRejoinBlocked(identity: GoogleIdentity): Promise<void> {
  const error: unknown = await signIn(identity).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toMatchObject({
    status: 403,
    response: {
      status: 403,
      code: 'account_rejoin_blocked',
    },
  });
  expect(error).not.toHaveProperty('response.token');
}

async function expectUnauthorized(request: Promise<unknown>): Promise<void> {
  await expect(request).rejects.toMatchObject({ status: 401 });
}

beforeAll(async () => {
  tempDir = await createTempDir('account-lifecycle');
  // Changing the users OAuth settings makes PocketBase write automigrate files, so they go to a copy.
  const migrationsDir = join(tempDir, 'migrations');
  await cp(REPO_MIGRATIONS_DIR, migrationsDir, { recursive: true });
  server = await startPocketBase({
    dataDir: join(tempDir, 'data'),
    migrationsDir,
    // Both variables are always given so the developer's shell values never leak in.
    env: {
      DAZBEAT_REJOIN_BLOCK_HMAC_KEY: REJOIN_TEST_KEY,
      DAZBEAT_REJOIN_BLOCK_HMAC_RETIRED_KEYS: '',
    },
  });
  await excludeLoopbackFromRateLimits(server.superuser);
  fakeGoogle = await startFakeGoogle(server.superuser);
  chart = await createTapChart(server.superuser, 'lifecycle');
});

afterAll(async () => {
  await fakeGoogle.stop();
  await server.stop();
  await removeTempDir(tempDir);
});

describe('account lifecycle', () => {
  it('deletes an OAuth account and keeps its Google account from signing up again', async () => {
    const { superuser } = server;
    const identityA = newIdentity();
    const identityB = newIdentity();
    const userA = await signIn(identityA);
    const userB = await signIn(identityB);
    await playRanked(superuser, userA, chart);
    await playRanked(superuser, userB, chart);
    const countsB = await readUserOwnedRowCounts(superuser, userB.id);

    const response = await requestDeletion(userA);

    expect(response.status).toBe(204);
    expectAllZero(await readUserOwnedRowCounts(superuser, userA.id));
    expect(await countUsers(identityA.email)).toBe(0);
    expect(await countBlockRows(identityA.sub)).toBe(1);

    const userCount = await countAll('users');
    const linkCount = await countAll('_externalAuths');
    await expectRejoinBlocked(identityA);
    expect(await countAll('users')).toBe(userCount);
    expect(await countAll('_externalAuths')).toBe(linkCount);

    expect(await readUserOwnedRowCounts(superuser, userB.id)).toEqual(countsB);
    await expect(signIn(identityB)).resolves.toMatchObject({ id: userB.id });
  });

  it('rejects the old token of another device after the deletion', async () => {
    const identity = newIdentity();
    const otherDevice = await signIn(identity);
    const deletingDevice = await signIn(identity);
    const sessionId = await issuePlaySession(otherDevice, chart);

    expect((await requestDeletion(deletingDevice)).status).toBe(204);

    const { client } = otherDevice;
    await expectUnauthorized(
      client.send('/api/dazbeat/play-sessions', {
        method: 'POST',
        body: {
          chartId: chart.id,
          chartRevision: String(chart['revision']),
        },
      }),
    );
    await expectUnauthorized(
      client.send(`/api/dazbeat/play-sessions/${sessionId}/result`, {
        method: 'POST',
        body: {
          inputOffsetMs: 0,
          events: [],
        },
      }),
    );
    await expectUnauthorized(client.send('/api/dazbeat/profile', { method: 'GET' }));
    expectAllZero(await readUserOwnedRowCounts(server.superuser, otherDevice.id));
  });

  it('leaves no account or link when sign-ins race the deletion', async () => {
    const identity = newIdentity();
    const user = await signIn(identity);

    // The order is not assumed; only the state after every request settles is checked.
    await Promise.allSettled([
      requestDeletion(user),
      ...Array.from({ length: CONCURRENT_SIGN_INS }, () => signIn(identity)),
    ]);

    expect(await countLinks(identity.sub)).toBe(0);
    expect(await countUsers(identity.email)).toBe(0);
    expect(await countBlockRows(identity.sub)).toBe(1);
    await expectRejoinBlocked(identity);
  });
});
