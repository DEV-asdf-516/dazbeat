import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type PocketBase from 'pocketbase';
import type { RecordAuthResponse, RecordModel } from 'pocketbase';
import { parseJson } from '../../../src/json.js';
import type { Chart, InputEvent } from '../../../src/rhythm/types.js';
import { isRecord, isString } from '../../../src/typeGuards.js';
import { createChart, createSong } from './testData.js';
import type { TestUser } from './testData.js';

export const REJOIN_TEST_KEY = 'rejoin-test-key-0123456789abcdef0123456789abcdef';
export const OTHER_REJOIN_TEST_KEY = 'other-rejoin-test-key-0123456789abcdef0123456789';

const GAME_END_MS = 5_000;
// Longer than the minimum elapsed time (0.9 × play duration) of a 5 s song.
const ELAPSED_PLAY_MS = 10_000;

function hmacHex(key: string, text: string): string {
  return createHmac('sha256', key).update(text).digest('hex');
}

export function rejoinKeyId(key: string): string {
  return hmacHex(key, 'dazbeat:rejoin-block-key-id');
}

export function rejoinDigest(key: string, providerId: string): string {
  return hmacHex(key, `google:${providerId}`);
}

export async function linkGoogleIdentity(
  superuser: PocketBase,
  userId: string,
  providerId: string,
): Promise<RecordModel> {
  const users = await superuser.collections.getOne('users');
  return superuser.collection('_externalAuths').create({
    collectionRef: users.id,
    recordRef: userId,
    provider: 'google',
    providerId,
  });
}

/** Every collection with a relation to users, so a collection added later is counted too. */
export async function readUserOwnedRowCounts(
  superuser: PocketBase,
  userId: string,
): Promise<Record<string, number>> {
  const collections = await superuser.collections.getFullList();
  const usersId = (await superuser.collections.getOne('users')).id;
  const countRows = async (collection: string, filter: string): Promise<number> =>
    (
      await superuser.collection(collection).getList(1, 1, {
        filter: superuser.filter(filter, { userId }),
        fields: 'id',
      })
    ).totalItems;

  const counts: Record<string, number> = {};
  for (const collection of collections) {
    const userFields = collection.fields.filter(
      (field) => field.type === 'relation' && field['collectionId'] === usersId,
    );
    if (userFields.length > 0) {
      counts[collection.name] = await countRows(
        collection.name,
        userFields.map((field) => `${field.name} ?= {:userId}`).join(' || '),
      );
    }
  }
  counts['_externalAuths'] = await countRows('_externalAuths', 'recordRef = {:userId}');
  return counts;
}

function tapChartOf(songKey: string): Chart {
  return {
    songId: songKey,
    difficulty: 'easy',
    laneCount: 4,
    offsetMs: 0,
    notes: ([0, 1, 2, 3] as const).map((lane) => ({
      type: 'tap' as const,
      timeMs: 1_000 + lane * 500,
      lane,
    })),
  };
}

// Every tap chart has the same note times, so these inputs play any of them perfectly.
const PERFECT_INPUTS: InputEvent[] = tapChartOf('').notes.flatMap((note) => [
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

export async function createTapChart(superuser: PocketBase, songKey: string): Promise<RecordModel> {
  const song = await createSong(superuser, songKey, GAME_END_MS);
  return createChart(superuser, song.id, 'easy', tapChartOf(songKey));
}

export async function issuePlaySession(player: TestUser, chart: RecordModel): Promise<string> {
  const { sessionId } = await player.client.send<{ sessionId: string }>(
    '/api/dazbeat/play-sessions',
    {
      method: 'POST',
      body: {
        chartId: chart.id,
        chartRevision: String(chart['revision']),
      },
    },
  );
  return sessionId;
}

/** A perfect ranked play, leaving a score, a play result, marks, achievements and a quota row. */
export async function playRanked(
  superuser: PocketBase,
  player: TestUser,
  chart: RecordModel,
): Promise<void> {
  const sessionId = await issuePlaySession(player, chart);
  // Moves issuedAt into the past so a submission is not rejected as too short without waiting.
  await superuser
    .collection('play_sessions')
    .update(sessionId, { issuedAt: new Date(Date.now() - ELAPSED_PLAY_MS).toISOString() });
  await player.client.send(`/api/dazbeat/play-sessions/${sessionId}/result`, {
    method: 'POST',
    body: {
      inputOffsetMs: 0,
      events: PERFECT_INPUTS,
    },
  });
}

export interface GoogleIdentity {
  sub: string;
  email: string;
}

export interface FakeGoogle {
  /** The authorization code that signs in as this identity. */
  codeFor(identity: GoogleIdentity): string;
  stop(): Promise<void>;
}

/**
 * A local Google token and userinfo server set as the users google provider, so tests run the real
 * auth-with-oauth2 flow. The code and the access token are the identity itself, encoded.
 */
export async function startFakeGoogle(superuser: PocketBase): Promise<FakeGoogle> {
  const server = createServer((request, response) => {
    const send = (body: unknown): void => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.url === '/token') {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () =>
        send({
          access_token: new URLSearchParams(body).get('code'),
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      );
      return;
    }
    const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');
    const identity = parseJson(Buffer.from(token, 'base64url').toString());
    if (!isRecord(identity) || !isString(identity.sub) || !isString(identity.email)) {
      throw new Error('Fake Google received an unknown access token');
    }
    send({
      sub: identity.sub,
      email: identity.email,
      email_verified: true,
      name: identity.email,
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await superuser.collections.update('users', {
    oauth2: {
      enabled: true,
      providers: [
        {
          name: 'google',
          clientId: 'fake-google-client',
          clientSecret: 'fake-google-secret',
          authURL: `${url}/auth`,
          tokenURL: `${url}/token`,
          userInfoURL: `${url}/userinfo`,
        },
      ],
    },
  });
  return {
    codeFor: (identity) => Buffer.from(JSON.stringify(identity)).toString('base64url'),
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** Signs in through the real auth-with-oauth2 endpoint; the client keeps the issued token. */
export function signInWithGoogle(
  client: PocketBase,
  fakeGoogle: FakeGoogle,
  identity: GoogleIdentity,
): Promise<RecordAuthResponse> {
  return client
    .collection('users')
    .authWithOAuth2Code(
      'google',
      fakeGoogle.codeFor(identity),
      'verifier',
      'http://127.0.0.1/redirect',
    );
}
