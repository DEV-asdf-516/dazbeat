import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { createClient } from './pocketBaseServer.js';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const USER_PASSWORD = 'user-password';

export interface TestUser {
  id: string;
  email: string;
  client: PocketBase;
}

/** Only a superuser can grant isEditor. */
export async function createUser(
  server: { url: string; superuser: PocketBase },
  email: string,
  isEditor = false,
): Promise<TestUser> {
  const record = await server.superuser.collection('users').create({
    email,
    password: USER_PASSWORD,
    passwordConfirm: USER_PASSWORD,
    isEditor,
  });
  const client = createClient(server.url);
  await client.collection('users').authWithPassword(email, USER_PASSWORD);
  return {
    id: record.id,
    email,
    client,
  };
}

export function createSong(
  superuser: PocketBase,
  key: string,
  gameEndMs = 5_000,
  song: {
    title?: string;
    category?: string;
    releasedOn?: string;
    constellation?: string;
    album?: string;
    isPublished?: boolean;
    previewStartMs?: number;
  } = {},
): Promise<RecordModel> {
  const form = new FormData();
  const fields: Record<string, string | number | boolean> = {
    key,
    title: song.title ?? `Song ${key}`,
    category: song.category ?? 'original',
    youtubeVideoId: `video-${key}`,
    accentColor: 0x123456,
    constellation: song.constellation ?? 'gemini',
    album: song.album ?? '',
    releasedOn: song.releasedOn ?? '2026-01-01',
    gameStartMs: 0,
    gameEndMs,
    previewStartMs: song.previewStartMs ?? 0,
    isPublished: song.isPublished ?? true,
  };
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, String(value));
  }
  form.append('jacket', new Blob([PNG_BYTES], { type: 'image/png' }), `${key}.png`);
  return superuser.collection('songs').create(form);
}

export async function findAlbumId(superuser: PocketBase, key: string): Promise<string> {
  return (
    await superuser.collection('albums').getFirstListItem(superuser.filter('key = {:key}', { key }))
  ).id;
}

/** The ids the profile answers: active definitions in sortOrder and key order. */
export async function readActiveAchievementKeys(superuser: PocketBase): Promise<string[]> {
  return (
    await superuser.collection('achievements').getFullList({
      filter: 'retired = false',
      sort: 'sortOrder,key',
    })
  ).map((record) => String(record['key']));
}

export function fakeChartData(
  songKey: string,
  difficulty: string,
  firstNoteMs = 1_000,
  laneCount = 4,
) {
  return {
    songId: songKey,
    difficulty,
    laneCount,
    offsetMs: 0,
    notes: [
      {
        type: 'tap',
        timeMs: firstNoteMs,
        lane: 0,
      },
      {
        type: 'hold',
        timeMs: firstNoteMs + 1_000,
        endTimeMs: firstNoteMs + 2_000,
        lane: 1,
      },
    ],
  };
}

export function createChart(
  client: PocketBase,
  songId: string,
  difficulty: string,
  data: unknown,
  laneCount = 4,
): Promise<RecordModel> {
  return client.collection('charts').create({
    song: songId,
    difficulty,
    laneCount,
    data,
  });
}

export async function excludeLoopbackFromRateLimits(superuser: PocketBase): Promise<void> {
  await superuser.settings.update({ rateLimits: { excludedIPs: ['127.0.0.1'] } });
}
