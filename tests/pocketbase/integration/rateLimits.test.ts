import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Chart } from '../../../src/rhythm/types.js';
import { simulateClientPlay } from '../../rhythm/playSimulation.js';
import { createClient, createTempDir, removeTempDir, startPocketBase } from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import { createChart, createSong, createUser } from './testData.js';
import type { TestUser } from './testData.js';

// This file must not call excludeLoopbackFromRateLimits: it measures the limiter itself.
const SONG_KEY = 'limited';
const GAME_END_MS = 5_000;
const ELAPSED_PLAY_MS = 10_000;
const FRAME_INTERVAL_MS = 17;
const ISSUE_LIMIT = 10;
const chart: Chart = {
  songId: SONG_KEY,
  difficulty: 'easy',
  offsetMs: 0,
  notes: [
    { type: 'tap', timeMs: 1_000, lane: 0 },
    { type: 'tap', timeMs: 2_000, lane: 1 },
  ],
};

let dataDir: string;
let server: PocketBaseServer;
let player: TestUser;
let chartRecord: RecordModel;
let chartRevision: unknown;
let issuedCount = 0;

function issueSession(client: PocketBase): Promise<{ sessionId: string }> {
  issuedCount += 1;
  return client.send<{ sessionId: string }>('/api/dazbeat/play-sessions', {
    method: 'POST',
    body: { chartId: chartRecord.id, chartRevision },
  });
}

beforeAll(async () => {
  dataDir = await createTempDir('rate-limits');
  server = await startPocketBase({ dataDir });
  // Only one user signs in: the superuser and this player already use up the 2 / 3 s auth limit.
  player = await createUser(server, 'player@example.com');
  const song = await createSong(server.superuser, SONG_KEY, GAME_END_MS);
  chartRecord = await createChart(server.superuser, song.id, chart.difficulty, chart);
  chartRevision = chartRecord['revision'];
});

afterAll(async () => {
  await server?.stop();
  await removeTempDir(dataDir);
});

describe('built-in rate limits', () => {
  it('are enabled with the dazbeat rules', async () => {
    const settings: unknown = await server.superuser.settings.getAll();
    expect(settings).toMatchObject({ rateLimits: { enabled: true } });
    expect(settings).toHaveProperty(
      'rateLimits.rules',
      expect.arrayContaining([
        { label: '*:auth', audience: '', maxRequests: 2, duration: 3 },
        { label: '*:create', audience: '', maxRequests: 20, duration: 5 },
        { label: '/api/batch', audience: '', maxRequests: 3, duration: 1 },
        { label: '/api/', audience: '', maxRequests: 300, duration: 10 },
        { label: 'POST /api/dazbeat/play-sessions', audience: '', maxRequests: 10, duration: 60 },
        { label: 'POST /api/dazbeat/play-sessions/', audience: '', maxRequests: 10, duration: 60 },
      ]),
    );
  });

  it('let a normal issue → submit flow succeed', async () => {
    const play = simulateClientPlay(
      chart,
      chart.notes.flatMap((note) => [
        { lane: note.lane, kind: 'press' as const, songTimeMs: note.timeMs },
        { lane: note.lane, kind: 'release' as const, songTimeMs: note.timeMs + 50 },
      ]),
      Array.from(
        { length: Math.ceil((GAME_END_MS + 1_000) / FRAME_INTERVAL_MS) },
        (_, index) => index * FRAME_INTERVAL_MS,
      ),
    );
    const { sessionId } = await issueSession(player.client);
    await server.superuser
      .collection('play_sessions')
      .update(sessionId, { issuedAt: new Date(Date.now() - ELAPSED_PLAY_MS).toISOString() });

    const response = await player.client.send<{ score: number }>(
      `/api/dazbeat/play-sessions/${sessionId}/result`,
      { method: 'POST', body: { inputOffsetMs: 0, events: play.inputs } },
    );
    expect(response.score).toBe(play.result.score);
  });

  it('reject the 11th session issue within a minute with 429', async () => {
    while (issuedCount < ISSUE_LIMIT) {
      await issueSession(player.client);
    }
    await expect(issueSession(player.client)).rejects.toMatchObject({ status: 429 });
  });
});

describe('GET /api/dazbeat/diagnostics/client-ip', () => {
  const path = '/api/dazbeat/diagnostics/client-ip';

  it('reports the client IP and the proxy headers to a superuser', async () => {
    const response = await server.superuser.send<unknown>(path, {
      method: 'GET',
      headers: { 'X-Forwarded-For': '203.0.113.7' },
    });
    expect(response).toEqual({
      remoteIP: '127.0.0.1',
      realIP: '127.0.0.1',
      headers: {
        'X-Forwarded-For': '203.0.113.7',
        'X-Real-IP': '',
        'CF-Connecting-IP': '',
        'X-PocketHost-Client-IP': '',
      },
    });
  });

  it('is not available to users or anonymous requests', async () => {
    await expect(player.client.send(path, { method: 'GET' })).rejects.toMatchObject({
      status: 403,
    });
    await expect(createClient(server.url).send(path, { method: 'GET' })).rejects.toMatchObject({
      status: 401,
    });
  });
});
