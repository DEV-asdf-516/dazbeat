import PocketBase from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayRecords } from '../../src/backend/PlayRecords.js';
import { submitPlay } from '../../src/backend/playSessions.js';
import type { AchievementCatalog } from '../../src/data/achievements.js';
import type { PlaySubmission } from '../../src/data/playSubmission.js';
import { requireDefined } from '../../src/invariant.js';

const CATALOG: AchievementCatalog = {
  definitions: [],
  albums: new Map(),
};
const SUBMISSION: PlaySubmission = {
  inputOffsetMs: 0,
  events: [],
};
const VERIFIED_PLAY = {
  score: 1000000,
  accuracy: 100,
  maxCombo: 1,
  cleared: true,
  review: {
    kind: 'approved',
    ranking: {
      rank: 1,
      isNewBest: true,
    },
  },
  newAchievements: [],
};
const RECORD = {
  songId: 'song-1',
  laneCount: 4,
  difficulty: 'easy',
  score: 1000000,
  accuracy: 100,
  maxCombo: 1,
  cleared: true,
};
const RECORDS_PATH = '/api/dazbeat/profile/records';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

/** 제출 응답은 테스트가 보낼 때까지 미루고, 기록 요청에는 곧바로 답한다. */
function stubServer() {
  const submissions = new Map<string, (response: Response) => void>();
  const fetchMock = vi.fn((input: string): Promise<Response> => {
    const { pathname } = new URL(input);
    if (pathname === RECORDS_PATH) {
      return Promise.resolve(jsonResponse(200, { items: [RECORD] }));
    }
    return new Promise((resolve) => {
      submissions.set(pathname, resolve);
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    hasRecordsRequest: () =>
      fetchMock.mock.calls.some(([input]) => new URL(input).pathname === RECORDS_PATH),
    answerSubmission: (sessionId: string, response: Response) =>
      requireDefined(
        submissions.get(`/api/dazbeat/play-sessions/${sessionId}/result`),
        'Submission not requested',
        sessionId,
      )(response),
  };
}

function client(): PocketBase {
  return new PocketBase('http://pb.test');
}

// 요청이 나가지 않았음을 보려면 대기 중인 Promise 가 먼저 다 돌아야 한다.
function settlePromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PlayRecords', () => {
  it('asks for my records right away when nothing was submitted', async () => {
    stubServer();

    expect(await new PlayRecords(client(), CATALOG).loadMine()).toEqual([RECORD]);
  });

  it('asks for my records only after the submission is answered', async () => {
    const server = stubServer();
    const records = new PlayRecords(client(), CATALOG);
    const submission = records.submit('session1', SUBMISSION);

    const mine = records.loadMine();
    await settlePromises();
    expect(server.hasRecordsRequest()).toBe(false);

    server.answerSubmission('session1', jsonResponse(200, VERIFIED_PLAY));
    await submission;
    expect(await mine).toEqual([RECORD]);
  });

  it.each([
    ['refused by the server', () => jsonResponse(400, { code: 'rejected' })],
    ['answered with an unreadable result', () => jsonResponse(200, { score: 'high' })],
  ])('asks for my records after a submission %s', async (_case, respond) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const server = stubServer();
    const records = new PlayRecords(client(), CATALOG);
    const submission = records.submit('session1', SUBMISSION).catch(() => undefined);

    const mine = records.loadMine();
    server.answerSubmission('session1', respond());
    await submission;

    expect(await mine).toEqual([RECORD]);
  });

  it('waits for every submission in progress', async () => {
    const server = stubServer();
    const records = new PlayRecords(client(), CATALOG);
    const first = records.submit('session1', SUBMISSION);
    const second = records.submit('session2', SUBMISSION);

    const mine = records.loadMine();
    server.answerSubmission('session2', jsonResponse(200, VERIFIED_PLAY));
    await second;
    await settlePromises();
    expect(server.hasRecordsRequest()).toBe(false);

    server.answerSubmission('session1', jsonResponse(200, VERIFIED_PLAY));
    await first;
    expect(await mine).toEqual([RECORD]);
  });

  it('answers a submission as submitPlay does', async () => {
    const server = stubServer();
    const pb = client();

    const direct = submitPlay(pb, CATALOG, 'session1', SUBMISSION);
    const submitted = new PlayRecords(pb, CATALOG).submit('session2', SUBMISSION);
    server.answerSubmission('session1', jsonResponse(200, VERIFIED_PLAY));
    server.answerSubmission('session2', jsonResponse(200, VERIFIED_PLAY));

    expect(await submitted).toEqual(await direct);
  });
});
