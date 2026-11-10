import type { RecordModel } from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EARNED_CHART_MARKS,
  PLAY_RESULTS,
  PLAY_REVIEWS,
  SCORES,
} from '../../../src/pbCollections.js';
import { where } from '../../../src/pbQuery.js';
import type { Chart, InputEvent, Lane, Note } from '../../../src/rhythm/types.js';
import { createClient, createTempDir, removeTempDir, startPocketBase } from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import { createChart, createSong, createUser, excludeLoopbackFromRateLimits } from './testData.js';
import type { TestUser } from './testData.js';

const GAME_END_MS = 10_000;
// Longer than the minimum elapsed time (0.9 × play duration) of the song.
const ELAPSED_PLAY_MS = 30_000;
const SLOT_START_TIME_MS = 1_000;
const SLOT_GAP_MS = 200;
const REJECT_NOTE = 'Inputs land exactly on every note.';

function tap(lane: Lane, timeMs: number): Note {
  return {
    type: 'tap',
    timeMs,
    lane,
  };
}

// 10 chords and 30 single taps: 50 samples, the minimum the autoplay check judges.
function chartOf(songKey: string): Chart {
  return {
    songId: songKey,
    difficulty: 'easy',
    laneCount: 4,
    offsetMs: 0,
    notes: Array.from({ length: 40 }, (_, slot) => {
      const timeMs = SLOT_START_TIME_MS + slot * SLOT_GAP_MS;
      return slot < 10 ? [tap(0, timeMs), tap(1, timeMs)] : [tap(2 + (slot % 2), timeMs)];
    }).flat(),
  };
}

/** Presses every note exactly on time, which the autoplay check holds for review. */
function exactInputs(chart: Chart): InputEvent[] {
  return chart.notes
    .map((note): InputEvent => ({
      lane: note.lane,
      kind: 'press',
      songTimeMs: note.timeMs,
    }))
    .sort((a, b) => a.songTimeMs - b.songTimeMs);
}

/** Misses the last two notes, so there are too few samples to judge and the play is approved. */
function unjudgedInputs(chart: Chart): InputEvent[] {
  return exactInputs(chart).slice(0, -2);
}

interface TestChart {
  data: Chart;
  record: RecordModel;
}

let dataDir: string;
let server: PocketBaseServer;
let editor: TestUser;
let userCount = 0;
let chartCount = 0;

async function newPlayer(): Promise<TestUser> {
  userCount += 1;
  return createUser(server, `moderated${userCount}@example.com`);
}

async function newChart(): Promise<TestChart> {
  chartCount += 1;
  const songKey = `moderated-${chartCount}`;
  const song = await createSong(server.superuser, songKey, GAME_END_MS);
  const data = chartOf(songKey);
  return {
    data,
    record: await createChart(editor.client, song.id, 'easy', data),
  };
}

/** Submits a play and answers the id of its play result. */
async function play(
  player: TestUser,
  chart: TestChart,
  inputs: readonly InputEvent[],
): Promise<string> {
  const { sessionId } = await player.client.send<{ sessionId: string }>(
    '/api/dazbeat/play-sessions',
    {
      method: 'POST',
      body: {
        chartId: chart.record.id,
        chartRevision: String(chart.record['revision']),
      },
    },
  );
  // Moves issuedAt into the past so a submission is not rejected as too short without waiting.
  await server.superuser
    .collection('play_sessions')
    .update(sessionId, { issuedAt: new Date(Date.now() - ELAPSED_PLAY_MS).toISOString() });
  await player.client.send(`/api/dazbeat/play-sessions/${sessionId}/result`, {
    method: 'POST',
    body: {
      inputOffsetMs: 0,
      events: inputs,
    },
  });
  const filter = where(PLAY_RESULTS, [{ session: sessionId }]);
  return (
    await server.superuser
      .collection(PLAY_RESULTS.name)
      .getFirstListItem(server.superuser.filter(filter.expression, filter.params))
  ).id;
}

/** Decides a play the way an operator edits it in the PocketBase dashboard. */
function decide(playId: string, reviewStatus: string, reviewNote?: string): Promise<RecordModel> {
  const body =
    reviewNote === undefined
      ? { reviewStatus }
      : {
          reviewStatus,
          reviewNote,
        };
  return server.superuser.collection(PLAY_RESULTS.name).update(playId, body);
}

function listOwn(
  collection: string,
  filter: { expression: string; params: Record<string, string | number | boolean> },
): Promise<RecordModel[]> {
  return server.superuser.collection(collection).getFullList({
    filter: server.superuser.filter(filter.expression, filter.params),
  });
}

const findScores = (player: TestUser) => listOwn(SCORES.name, where(SCORES, [{ user: player.id }]));
const findMarks = (player: TestUser) =>
  listOwn(EARNED_CHART_MARKS.name, where(EARNED_CHART_MARKS, [{ user: player.id }]));
const findReviews = (playId: string) =>
  listOwn(PLAY_REVIEWS.name, where(PLAY_REVIEWS, [{ playResult: playId }]));

async function readPlayCount(player: TestUser): Promise<number> {
  const profile = await player.client.send<{ stats: { playCount: number } }>(
    '/api/dazbeat/profile',
    { method: 'GET' },
  );
  return profile.stats.playCount;
}

function expectRejection(
  request: Promise<unknown>,
  status: number,
  field: string,
  code: string,
): Promise<void> {
  return expect(request).rejects.toMatchObject({
    status,
    response: { data: { [field]: { code } } },
  });
}

function superuserEmail(): string {
  return String(server.superuser.authStore.record?.['email']);
}

beforeAll(async () => {
  dataDir = await createTempDir('moderation');
  server = await startPocketBase({ dataDir });
  await excludeLoopbackFromRateLimits(server.superuser);
  editor = await createUser(server, 'editor@example.com', true);
});

afterAll(async () => {
  await server?.stop();
  await removeTempDir(dataDir);
});

describe('approving a pending play', () => {
  it('raises the best score only when higher and counts every approved play once', async () => {
    const chart = await newChart();
    const player = await newPlayer();
    await play(player, chart, unjudgedInputs(chart.data));
    const [low] = await findScores(player);
    const highId = await play(player, chart, exactInputs(chart.data));
    const equalId = await play(player, chart, exactInputs(chart.data));
    expect(await findScores(player)).toEqual([low]);
    const playCount = await readPlayCount(player);

    const approved = await decide(highId, 'approved', ' Checked. ');

    expect(approved).toMatchObject({
      reviewStatus: 'approved',
      reviewNote: 'Checked.',
    });
    expect(await findReviews(highId)).toEqual([
      expect.objectContaining({
        decision: 'approved',
        reviewerEmail: superuserEmail(),
        note: 'Checked.',
      }),
    ]);
    const [best, ...others] = await findScores(player);
    expect(others).toEqual([]);
    expect(best).toMatchObject({
      id: low?.id,
      score: approved['score'] as unknown,
      accuracy: approved['accuracy'] as unknown,
      achievedAt: approved['achievedAt'] as unknown,
    });
    expect(await readPlayCount(player)).toBe(playCount + 1);
    const marks = await findMarks(player);

    await decide(equalId, 'approved');

    expect(await findScores(player)).toEqual([best]);
    expect(await readPlayCount(player)).toBe(playCount + 2);
    expect(await findMarks(player)).toEqual(marks);
    expect(await findReviews(equalId)).toEqual([expect.objectContaining({ note: '' })]);
  });

  it('keeps a higher best score but counts a lower approved play', async () => {
    const chart = await newChart();
    const player = await newPlayer();
    const highId = await play(player, chart, exactInputs(chart.data));
    const lowerId = await play(player, chart, exactInputs(chart.data));
    await decide(highId, 'approved');
    const best = await findScores(player);
    const playCount = await readPlayCount(player);
    // A held play scores the same as the approved one, so its stored score is lowered.
    await server.superuser.collection(PLAY_RESULTS.name).update(lowerId, { score: 1 });

    expect(await decide(lowerId, 'approved')).toMatchObject({ reviewStatus: 'approved' });

    expect(await findScores(player)).toEqual(best);
    expect(await readPlayCount(player)).toBe(playCount + 1);
    expect(await findReviews(lowerId)).toHaveLength(1);
  });

  it('records a play of a changed chart on its own revision only', async () => {
    const chart = await newChart();
    const player = await newPlayer();
    const playId = await play(player, chart, exactInputs(chart.data));
    const changed = await editor.client.collection('charts').update(chart.record.id, {
      data: {
        ...chart.data,
        offsetMs: 10,
      },
      baseRevision: String(chart.record['revision']),
    });

    await decide(playId, 'approved');

    expect(await findScores(player)).toEqual([
      expect.objectContaining({ chartRevision: String(chart.record['revision']) }),
    ]);
    const board = await createClient(server.url).send<{ chartRevision: string; top: unknown[] }>(
      `/api/dazbeat/leaderboards/${chart.record.id}`,
      { method: 'GET' },
    );
    expect(board).toMatchObject({
      chartRevision: String(changed['revision']),
      top: [],
    });
  });

  it('records the decision of a play whose chart was deleted without a best score', async () => {
    const chart = await newChart();
    const player = await newPlayer();
    const playId = await play(player, chart, exactInputs(chart.data));
    await server.superuser.collection('charts').delete(chart.record.id);

    expect(await decide(playId, 'approved')).toMatchObject({ reviewStatus: 'approved' });
    expect(await findReviews(playId)).toEqual([expect.objectContaining({ decision: 'approved' })]);
    expect(await findScores(player)).toEqual([]);
  });
});

describe('rejecting a pending play', () => {
  it('requires a note and changes nothing but the status and the history', async () => {
    const chart = await newChart();
    const player = await newPlayer();
    const playId = await play(player, chart, exactInputs(chart.data));
    const playCount = await readPlayCount(player);

    for (const note of [undefined, '   ', 'x'.repeat(501)]) {
      await expectRejection(
        decide(playId, 'rejected', note),
        400,
        'reviewNote',
        'invalid_review_note',
      );
    }
    expect(await decide(playId, 'rejected', REJECT_NOTE)).toMatchObject({
      reviewStatus: 'rejected',
      reviewNote: REJECT_NOTE,
    });

    expect(await findScores(player)).toEqual([]);
    expect(await findMarks(player)).toEqual([]);
    expect(await readPlayCount(player)).toBe(playCount);
    expect(await findReviews(playId)).toEqual([
      expect.objectContaining({
        decision: 'rejected',
        note: REJECT_NOTE,
      }),
    ]);
  });
});

describe('a decided play', () => {
  it('cannot be decided again, reopened or have its note changed', async () => {
    const chart = await newChart();
    const player = await newPlayer();
    const playId = await play(player, chart, exactInputs(chart.data));
    await decide(playId, 'rejected', REJECT_NOTE);

    await expectRejection(decide(playId, 'approved'), 409, 'reviewStatus', 'already_reviewed');
    await expectRejection(
      decide(playId, 'rejected', 'Another reason.'),
      409,
      'reviewStatus',
      'already_reviewed',
    );
    await expectRejection(decide(playId, 'pending'), 400, 'reviewStatus', 'invalid_review_status');
    expect(await findReviews(playId)).toHaveLength(1);
  });

  it('takes exactly one of two concurrent decisions', async () => {
    const chart = await newChart();
    const player = await newPlayer();
    const playId = await play(player, chart, exactInputs(chart.data));
    const playCount = await readPlayCount(player);

    const results = await Promise.allSettled([
      decide(playId, 'approved'),
      decide(playId, 'rejected', REJECT_NOTE),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const failures = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : [],
    );
    expect(failures).toEqual([
      expect.objectContaining({
        status: 409,
        response: expect.objectContaining({
          data: { reviewStatus: expect.objectContaining({ code: 'already_reviewed' }) as unknown },
        }) as unknown,
      }),
    ]);
    expect(await findReviews(playId)).toHaveLength(1);
    expect(await readPlayCount(player)).toBeLessThanOrEqual(playCount + 1);
  });

  it('keeps its decision after the player is deleted', async () => {
    const chart = await newChart();
    const player = await newPlayer();
    const playId = await play(player, chart, exactInputs(chart.data));
    await decide(playId, 'rejected', REJECT_NOTE);

    await server.superuser.collection('users').delete(player.id);

    expect(await findReviews(playId)).toHaveLength(1);
  });
});
