import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import type PocketBase from 'pocketbase';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DELETED_ACCOUNT_IDENTITIES } from '../../../src/pbCollections.js';
import {
  OTHER_REJOIN_TEST_KEY,
  REJOIN_TEST_KEY,
  rejoinDigest,
  rejoinKeyId,
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

const DEFAULT_NICKNAME = /^과즙이\d{4}$/;
const CONCURRENT_SIGN_UPS = 4;
const PASSWORD = 'password-account-password';

interface KeyEnv {
  current: string;
  retired?: string;
}

interface OAuthServer {
  server: PocketBaseServer;
  fakeGoogle: FakeGoogle;
  tempDir: string;
}

async function startOAuthServer(keys: KeyEnv): Promise<OAuthServer> {
  const dir = await createTempDir('rejoin-block');
  // Changing the users OAuth settings or deleting a collection makes PocketBase write automigrate
  // files, so they go to a copy.
  const migrationsDir = join(dir, 'migrations');
  await cp(REPO_MIGRATIONS_DIR, migrationsDir, { recursive: true });
  const server = await startPocketBase({
    dataDir: join(dir, 'data'),
    migrationsDir,
    // Both variables are always given so the developer's shell values never leak in.
    env: {
      DAZBEAT_REJOIN_BLOCK_HMAC_KEY: keys.current,
      DAZBEAT_REJOIN_BLOCK_HMAC_RETIRED_KEYS: keys.retired ?? '',
    },
  });
  await excludeLoopbackFromRateLimits(server.superuser);
  return {
    server,
    fakeGoogle: await startFakeGoogle(server.superuser),
    tempDir: dir,
  };
}

async function stopOAuthServer(instance: OAuthServer): Promise<void> {
  await instance.fakeGoogle.stop();
  await instance.server.stop();
  await removeTempDir(instance.tempDir);
}

let identityCount = 0;

function newIdentity(): GoogleIdentity {
  identityCount += 1;
  return {
    sub: `google-sub-${identityCount}`,
    email: `google${identityCount}@example.com`,
  };
}

function signIn(
  instance: OAuthServer,
  identity: GoogleIdentity,
  client: PocketBase = createClient(instance.server.url),
) {
  return signInWithGoogle(client, instance.fakeGoogle, identity);
}

async function countUsers(superuser: PocketBase, email: string): Promise<number> {
  return (
    await superuser.collection('users').getList(1, 1, {
      filter: superuser.filter('email = {:email}', { email }),
    })
  ).totalItems;
}

async function countLinks(superuser: PocketBase, providerId: string): Promise<number> {
  return (
    await superuser.collection('_externalAuths').getList(1, 1, {
      filter: superuser.filter('provider = "google" && providerId = {:providerId}', { providerId }),
    })
  ).totalItems;
}

async function countAllUsers(superuser: PocketBase): Promise<number> {
  return (await superuser.collection('users').getList(1, 1)).totalItems;
}

function block(superuser: PocketBase, key: string, identity: GoogleIdentity) {
  return superuser.collection(DELETED_ACCOUNT_IDENTITIES.name).create({
    provider: 'google',
    identityDigest: rejoinDigest(key, identity.sub),
    keyId: rejoinKeyId(key),
  });
}

async function expectRejected(
  signInRequest: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  const error: unknown = await signInRequest.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toMatchObject({
    status,
    response: {
      status,
      code,
    },
  });
  expect(error).not.toHaveProperty('response.token');
}

const instances: OAuthServer[] = [];

async function startSeparate(keys: KeyEnv): Promise<OAuthServer> {
  const instance = await startOAuthServer(keys);
  instances.push(instance);
  return instance;
}

afterEach(async () => {
  await Promise.all(instances.splice(0).map((instance) => stopOAuthServer(instance)));
});

describe('Google OAuth rejoin block', () => {
  let instance: OAuthServer;

  beforeAll(async () => {
    instance = await startOAuthServer({ current: REJOIN_TEST_KEY });
  });

  afterAll(async () => {
    await stopOAuthServer(instance);
  });

  it('signs up a new Google account once and signs it in again as the same user', async () => {
    const { superuser } = instance.server;
    const identity = newIdentity();

    const first = await signIn(instance, identity);

    expect(first.token).not.toBe('');
    expect(first.record['nickname']).toMatch(DEFAULT_NICKNAME);
    expect(await countUsers(superuser, identity.email)).toBe(1);
    expect(await countLinks(superuser, identity.sub)).toBe(1);

    const again = await signIn(instance, identity);

    expect(again.record.id).toBe(first.record.id);
    expect(await countUsers(superuser, identity.email)).toBe(1);
    expect(await countLinks(superuser, identity.sub)).toBe(1);
  });

  it('rejects a blocked Google account without any account, link or token', async () => {
    const { superuser } = instance.server;
    const blocked = newIdentity();
    await block(superuser, REJOIN_TEST_KEY, blocked);
    const userCount = await countAllUsers(superuser);

    await expectRejected(signIn(instance, blocked), 403, 'account_rejoin_blocked');

    expect(await countAllUsers(superuser)).toBe(userCount);
    expect(await countLinks(superuser, blocked.sub)).toBe(0);
    const other = newIdentity();
    await expect(signIn(instance, other)).resolves.toMatchObject({
      record: { email: other.email },
    });
  });

  it('does not link a blocked Google account to a password account with the same email', async () => {
    const { superuser } = instance.server;
    const blocked = newIdentity();
    await block(superuser, REJOIN_TEST_KEY, blocked);
    await superuser.collection('users').create({
      email: blocked.email,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
    });

    await expectRejected(signIn(instance, blocked), 403, 'account_rejoin_blocked');

    expect(await countLinks(superuser, blocked.sub)).toBe(0);
    expect(await countUsers(superuser, blocked.email)).toBe(1);
    await expect(
      createClient(instance.server.url)
        .collection('users')
        .authWithPassword(blocked.email, PASSWORD),
    ).resolves.toMatchObject({ record: { email: blocked.email } });
  });

  it('fails without creating a user when the Google user id is empty', async () => {
    const { superuser } = instance.server;
    const identity = {
      sub: '',
      email: 'empty-sub@example.com',
    };

    await expect(signIn(instance, identity)).rejects.toBeDefined();

    expect(await countUsers(superuser, identity.email)).toBe(0);
  });

  it('creates one user and one link for concurrent sign-ups of a new Google account', async () => {
    const { superuser } = instance.server;
    const identity = newIdentity();

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_SIGN_UPS }, () => signIn(instance, identity)),
    );

    expect(results.filter((result) => result.status === 'fulfilled').length).toBeGreaterThan(0);
    expect(await countUsers(superuser, identity.email)).toBe(1);
    expect(await countLinks(superuser, identity.sub)).toBe(1);
  });

  it('forbids users to remove their Google link but lets the superuser remove it', async () => {
    const { superuser } = instance.server;
    const identity = newIdentity();
    const client = createClient(instance.server.url);
    const { record } = await signIn(instance, identity, client);
    const link = await superuser
      .collection('_externalAuths')
      .getFirstListItem(superuser.filter('recordRef = {:userId}', { userId: record.id }));

    await expect(client.collection('_externalAuths').delete(link.id)).rejects.toMatchObject({
      status: 403,
      response: {
        status: 403,
        code: 'external_auth_locked',
      },
    });
    expect(await countLinks(superuser, identity.sub)).toBe(1);

    await superuser.collection('_externalAuths').delete(link.id);
    expect(await countLinks(superuser, identity.sub)).toBe(0);
  });
});

describe('Google OAuth rejoin block keys', () => {
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
  ])('rejects every sign-in with %s', async (_name, keys: KeyEnv) => {
    const instance = await startSeparate(keys);
    const identity = newIdentity();

    await expectRejected(signIn(instance, identity), 503, 'rejoin_block_unavailable');

    expect(await countAllUsers(instance.server.superuser)).toBe(0);
  });

  it('rejects every sign-in while a row of an unknown key exists', async () => {
    const instance = await startSeparate({ current: REJOIN_TEST_KEY });
    await block(instance.server.superuser, OTHER_REJOIN_TEST_KEY, newIdentity());

    await expectRejected(signIn(instance, newIdentity()), 503, 'rejoin_block_unavailable');

    expect(await countAllUsers(instance.server.superuser)).toBe(0);
  });

  it('still blocks accounts of a retired key after the rotation', async () => {
    const instance = await startSeparate({
      current: OTHER_REJOIN_TEST_KEY,
      retired: REJOIN_TEST_KEY,
    });
    const blocked = newIdentity();
    await block(instance.server.superuser, REJOIN_TEST_KEY, blocked);

    await expectRejected(signIn(instance, blocked), 403, 'account_rejoin_blocked');

    const other = newIdentity();
    await expect(signIn(instance, other)).resolves.toMatchObject({
      record: { email: other.email },
    });
  });

  it('fails without creating a user when the block list cannot be read', async () => {
    const instance = await startSeparate({ current: REJOIN_TEST_KEY });
    await instance.server.superuser.collections.delete(DELETED_ACCOUNT_IDENTITIES.name);

    await expect(signIn(instance, newIdentity())).rejects.toBeDefined();

    expect(await countAllUsers(instance.server.superuser)).toBe(0);
  });
});
