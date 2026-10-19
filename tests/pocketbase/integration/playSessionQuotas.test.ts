import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Chart, InputEvent } from '../../../src/rhythm/types.js';
import { createClient, createTempDir, removeTempDir, startPocketBase } from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import { createChart, createSong, createUser, excludeLoopbackFromRateLimits } from './testData.js';
import type { TestUser } from './testData.js';

const SONG_KEY = 'quota';
const GAME_END_MS = 5_000;
// Longer than the minimum elapsed time (0.9 × play duration) of a 5 s song.
const ELAPSED_PLAY_MS = 10_000;
const ISSUE_LIMIT = 20;
const SESSIONS_PATH = '/api/dazbeat/play-sessions';

const chart: Chart = {
  songId: SONG_KEY,
  difficulty: 'easy',
  offsetMs: 0,
  notes: [
    {
      type: 'tap',
      timeMs: 1_000,
      lane: 0,
    },
    {
      type: 'tap',
      timeMs: 1_500,
      lane: 1,
    },
  ],
};
const perfectInputs: InputEvent[] = chart.notes.flatMap((note) => [
  {
    lane: note.lane,
    kind: 'press',
    songTimeMs: note.timeMs,
  },
  {
    lane: note.lane,
    kind: 'release',
    songTimeMs: note.timeMs + 50,
  },
]);

interface SessionResponse {
  sessionId: string;
  expiresAt: string;
}

let dataDir: string;
let server: PocketBaseServer;
let chartRecord: RecordModel;
let userCount = 0;

async function newPlayer(): Promise<TestUser> {
  userCount += 1;
  return createUser(server, `quota${userCount}@example.com`);
}

function sessionBody(): { chartId: string; chartRevision: string } {
  return {
    chartId: chartRecord.id,
    chartRevision: String(chartRecord['revision']),
  };
}

function issueSession(client: PocketBase, body: unknown = sessionBody()): Promise<SessionResponse> {
  return client.send<SessionResponse>(SESSIONS_PATH, {
    method: 'POST',
    body,
  });
}

/** SDK errors drop response headers, so a request that checks Retry-After goes through fetch. */
function fetchIssue(player: TestUser): Promise<Response> {
  return fetch(`${server.url}${SESSIONS_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: player.client.authStore.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sessionBody()),
  });
}

async function issueUpToLimit(player: TestUser): Promise<SessionResponse> {
  let last = await issueSession(player.client);
  for (let count = 1; count < ISSUE_LIMIT; count += 1) {
    last = await issueSession(player.client);
  }
  return last;
}

function expectRateLimited(request: Promise<unknown>): Promise<void> {
  return expect(request).rejects.toMatchObject({
    status: 429,
    response: {
      status: 429,
      code: 'session_rate_limited',
    },
  });
}

async function findQuota(userId: string): Promise<RecordModel | undefined> {
  const quotas = await server.superuser.collection('play_session_quotas').getFullList({
    filter: server.superuser.filter('user = {:user}', { user: userId }),
  });
  expect(quotas.length).toBeLessThanOrEqual(1);
  return quotas[0];
}

async function requireQuota(userId: string): Promise<RecordModel> {
  const quota = await findQuota(userId);
  if (quota === undefined) {
    throw new Error(`User ${userId} has no quota row`);
  }
  return quota;
}

async function countQuotas(): Promise<number> {
  const page = await server.superuser.collection('play_session_quotas').getList(1, 1);
  return page.totalItems;
}

async function moveWindowStart(userId: string, agoMs: number): Promise<void> {
  const quota = await requireQuota(userId);
  await server.superuser
    .collection('play_session_quotas')
    .update(quota.id, { windowStartedAt: new Date(Date.now() - agoMs).toISOString() });
}

function findSessions(userId: string): Promise<RecordModel[]> {
  return server.superuser.collection('play_sessions').getFullList({
    filter: server.superuser.filter('user = {:user}', { user: userId }),
  });
}

async function submitRankedResult(player: TestUser, sessionId: string): Promise<void> {
  await server.superuser
    .collection('play_sessions')
    .update(sessionId, { issuedAt: new Date(Date.now() - ELAPSED_PLAY_MS).toISOString() });
  await player.client.send(`${SESSIONS_PATH}/${sessionId}/result`, {
    method: 'POST',
    body: {
      inputOffsetMs: 0,
      events: perfectInputs,
    },
  });
}

beforeAll(async () => {
  dataDir = await createTempDir('play-session-quotas');
  server = await startPocketBase({ dataDir });
  await excludeLoopbackFromRateLimits(server.superuser);
  const editor = await createUser(server, 'editor@example.com', true);
  const song = await createSong(server.superuser, SONG_KEY, GAME_END_MS);
  chartRecord = await createChart(editor.client, song.id, chart.difficulty, chart);
});

afterAll(async () => {
  await server?.stop();
  await removeTempDir(dataDir);
});

describe('per-user session issue limit', () => {
  it('rejects the issue after the limit with Retry-After and writes nothing', async () => {
    const player = await newPlayer();
    const last = await issueUpToLimit(player);
    const before = await requireQuota(player.id);

    const response = await fetchIssue(player);

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      status: 429,
      code: 'session_rate_limited',
    });
    const retryAfter = response.headers.get('Retry-After');
    expect(retryAfter).toMatch(/^\d+$/);
    const retryAfterSeconds = Number(retryAfter);
    expect(retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(retryAfterSeconds).toBeLessThanOrEqual(60);
    const sessions = await findSessions(player.id);
    expect(sessions.map((session) => session.id)).toEqual([last.sessionId]);
    const after = await requireQuota(player.id);
    expect(after['issuedCount']).toBe(ISSUE_LIMIT);
    expect(after['windowStartedAt']).toBe(before['windowStartedAt']);
  });

  it('opens a new window once 60 seconds have passed since its start', async () => {
    const player = await newPlayer();
    await issueUpToLimit(player);
    await moveWindowStart(player.id, 61_000);
    const beforeMs = Date.now();

    await issueSession(player.client);

    const quota = await requireQuota(player.id);
    expect(quota['issuedCount']).toBe(1);
    const windowStartedAtMs = Date.parse(String(quota['windowStartedAt']));
    expect(windowStartedAtMs).toBeGreaterThanOrEqual(beforeMs);
    expect(windowStartedAtMs).toBeLessThanOrEqual(Date.now());
  });

  it('keeps limiting while the window is still active', async () => {
    const player = await newPlayer();
    await issueUpToLimit(player);
    await moveWindowStart(player.id, 50_000);

    await expectRateLimited(issueSession(player.client));
  });

  it('limits each user separately', async () => {
    const limited = await newPlayer();
    const other = await newPlayer();
    await issueUpToLimit(limited);
    await expectRateLimited(issueSession(limited.client));

    const response = await issueSession(other.client);
    expect(typeof response.sessionId).toBe('string');
  });

  it('allows exactly the limit out of parallel issues', async () => {
    const player = await newPlayer();

    const outcomes = await Promise.allSettled(
      Array.from({ length: 25 }, () => issueSession(player.client)),
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(ISSUE_LIMIT);
    const rejections = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(rejections).toHaveLength(5);
    for (const rejection of rejections) {
      expect(rejection.reason).toMatchObject({
        status: 429,
        response: { code: 'session_rate_limited' },
      });
    }
    const quota = await requireQuota(player.id);
    expect(quota['issuedCount']).toBe(ISSUE_LIMIT);
    expect(await findSessions(player.id)).toHaveLength(1);
    await expectRateLimited(issueSession(player.client));
  });

  it('does not count requests that issue no session', async () => {
    const quotasBefore = await countQuotas();
    await expect(issueSession(createClient(server.url))).rejects.toMatchObject({ status: 401 });
    expect(await countQuotas()).toBe(quotasBefore);

    const player = await newPlayer();
    const { chartId, chartRevision } = sessionBody();
    await expect(
      issueSession(player.client, {
        chartId: 1,
        chartRevision,
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'invalid_request' },
    });
    await expect(
      issueSession(player.client, {
        chartId: 'missingchart123',
        chartRevision,
      }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'chart_not_found' },
    });
    await expect(
      issueSession(player.client, {
        chartId,
        chartRevision: 'stale',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'chart_changed' },
    });
    expect(await findQuota(player.id)).toBeUndefined();

    await issueSession(player.client);
    const quota = await requireQuota(player.id);
    expect(quota['issuedCount']).toBe(1);
  });

  it('keeps issue, submit and reissue working for the same user', async () => {
    const player = await newPlayer();

    const first = await issueSession(player.client);
    await submitRankedResult(player, first.sessionId);
    const second = await issueSession(player.client);
    await submitRankedResult(player, second.sessionId);
    const third = await issueSession(player.client);
    expect(typeof third.sessionId).toBe('string');
  });
});
