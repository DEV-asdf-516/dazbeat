import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadNotices } from '../../../src/backend/notices.js';
import { createClient, createTempDir, removeTempDir, startPocketBase } from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import { createUser, excludeLoopbackFromRateLimits } from './testData.js';
import type { TestUser } from './testData.js';

// PocketBase answers a null rule with 403 and a failed field validation with 400.
const SUPERUSER_ONLY = 403;
const VALIDATION_FAILED = 400;
const TITLE_MAX = 60;
const BODY_MAX = 2000;

type Role = 'guest' | 'user';

let dataDir: string;
let server: PocketBaseServer;
let user: TestUser;
let olderNotice: RecordModel;
let newerNotice: RecordModel;

function noticeBody(name: string, isPublished: boolean) {
  return {
    titleKo: `${name} 제목`,
    titleEn: `${name} title`,
    titleJa: `${name} タイトル`,
    bodyKo: `${name} 본문\n둘째 줄`,
    bodyEn: `${name} body`,
    bodyJa: `${name} 本文`,
    isPublished,
  };
}

function clientFor(role: Role): PocketBase {
  return role === 'guest' ? createClient(server.url) : user.client;
}

function expectStatus(request: Promise<unknown>, status: number): Promise<void> {
  return expect(request).rejects.toMatchObject({ status });
}

beforeAll(async () => {
  dataDir = await createTempDir('notices');
  server = await startPocketBase({ dataDir });
  const { superuser } = server;
  await excludeLoopbackFromRateLimits(superuser);
  user = await createUser(server, 'user@example.com');
  olderNotice = await superuser.collection('notices').create(noticeBody('older', true));
  await superuser.collection('notices').create(noticeBody('hidden', false));
  newerNotice = await superuser.collection('notices').create(noticeBody('newer', true));
});

afterAll(async () => {
  await server.stop();
  await removeTempDir(dataDir);
});

describe.each<Role>(['guest', 'user'])('%s', (role) => {
  it('lists only the published notices, newest first', async () => {
    const notices = await loadNotices(clientFor(role));

    expect(notices.map((notice) => notice.id)).toEqual([newerNotice.id, olderNotice.id]);
    expect(notices[0]).toMatchObject({
      title: {
        ko: 'newer 제목',
        ja: 'newer タイトル',
        en: 'newer title',
      },
      body: {
        ko: 'newer 본문\n둘째 줄',
        ja: 'newer 本文',
        en: 'newer body',
      },
    });
  });

  it('cannot view, create, update or delete a notice', async () => {
    const notices = clientFor(role).collection('notices');

    await expectStatus(notices.getOne(olderNotice.id), SUPERUSER_ONLY);
    await expectStatus(notices.create(noticeBody('forged', true)), SUPERUSER_ONLY);
    await expectStatus(notices.update(olderNotice.id, { titleEn: 'forged' }), SUPERUSER_ONLY);
    await expectStatus(notices.delete(olderNotice.id), SUPERUSER_ONLY);
  });
});

describe('superuser', () => {
  it.each([
    ['an empty language field', { titleJa: '' }],
    ['a title over the limit', { titleKo: 'a'.repeat(TITLE_MAX + 1) }],
    ['a body over the limit', { bodyEn: 'a'.repeat(BODY_MAX + 1) }],
  ])('cannot save a notice with %s', async (_case, overrides) => {
    await expectStatus(
      server.superuser.collection('notices').create({
        ...noticeBody('invalid', true),
        ...overrides,
      }),
      VALIDATION_FAILED,
    );
  });
});
