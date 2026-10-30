import PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { requireDefined } from '../../src/invariant.js';
import { ALBUMS, CHARTS, SONGS } from '../../src/pbCollections.js';
import { select, where } from '../../src/pbQuery.js';
import { DEFAULT_SEED_DATA_DIR, loadSeedManifest, type SeedManifest } from './seedManifest.js';

const REQUIRED_ENV = [
  'VITE_POCKETBASE_URL',
  'PB_SUPERUSER_EMAIL',
  'PB_SUPERUSER_PASSWORD',
] as const;

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopbackUrl(url: string): boolean {
  if (!URL.canParse(url)) {
    return false;
  }
  const { protocol, hostname } = new URL(url);
  return (protocol === 'http:' || protocol === 'https:') && LOOPBACK_HOSTNAMES.has(hostname);
}

export async function seedPocketBase(pb: PocketBase, manifest: SeedManifest): Promise<void> {
  // 있는 앨범은 대시보드에서 고쳤을 수 있어 갱신하지 않는다.
  const albumIds = new Map<string, string>();
  for (const album of manifest.albums) {
    const albumFilter = where(ALBUMS, [{ key: album.key }]);
    const found = await pb
      .collection(ALBUMS.name)
      .getList(1, 1, { filter: pb.filter(albumFilter.expression, albumFilter.params) });
    const storedAlbum =
      found.items[0] ??
      (await pb.collection(ALBUMS.name).create<RecordModel>({
        key: album.key,
        name: album.name,
        sortOrder: album.sortOrder,
      }));
    albumIds.set(album.key, storedAlbum.id);
  }

  for (const song of manifest.songs) {
    const songFilter = where(SONGS, [{ key: song.key }]);
    const found = await pb
      .collection(SONGS.name)
      .getList(1, 1, { filter: pb.filter(songFilter.expression, songFilter.params) });
    // 새 곡은 비공개로 만들어지고, 채보를 다 만든 뒤에 공개한다.
    const storedSong =
      found.items[0] ??
      (await pb.collection('songs').create<RecordModel>({
        key: song.key,
        title: song.title,
        category: song.category,
        youtubeVideoId: song.youtubeVideoId,
        accentColor: song.accentColor,
        constellation: song.constellation,
        ...(song.album === undefined
          ? {}
          : { album: requireDefined(albumIds.get(song.album), 'Unknown seed album', song.album) }),
        releasedOn: song.releasedOn,
        gameStartMs: song.gameStartMs,
        gameEndMs: song.gameEndMs,
        ...(song.previewStartMs === undefined ? {} : { previewStartMs: song.previewStartMs }),
        ...(song.credit === undefined ? {} : { credit: song.credit }),
        jacket: new File([song.jacket.bytes], song.jacket.fileName, { type: song.jacket.type }),
      }));
    const songId = storedSong.id;

    const chartFilter = where(CHARTS, [{ song: songId }]);
    const existingCharts = await pb.collection(CHARTS.name).getFullList({
      filter: pb.filter(chartFilter.expression, chartFilter.params),
      ...select(CHARTS, ['difficulty', 'laneCount']),
    });
    for (const chart of song.charts) {
      if (
        existingCharts.some(
          (existing) =>
            existing['difficulty'] === chart.difficulty &&
            existing['laneCount'] === chart.laneCount,
        )
      ) {
        continue;
      }
      await pb.collection('charts').create({
        song: songId,
        difficulty: chart.difficulty,
        laneCount: chart.laneCount,
        data: chart.data,
      });
    }
    if (storedSong['isPublished'] !== true) {
      await pb.collection(SONGS.name).update(songId, { isPublished: true });
    }
  }
}

export function readLocalTarget(env: Readonly<Record<string, string | undefined>>): {
  url: string;
  email: string;
  password: string;
} {
  const missing = REQUIRED_ENV.filter((name) => (env[name] ?? '') === '');
  const url = env['VITE_POCKETBASE_URL'];
  const email = env['PB_SUPERUSER_EMAIL'];
  const password = env['PB_SUPERUSER_PASSWORD'];
  if (missing.length > 0 || url === undefined || email === undefined || password === undefined) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
  if (!isLoopbackUrl(url)) {
    throw new Error(
      `Refusing to seed ${url}: seed only targets a local loopback PocketBase (localhost, 127.0.0.1, [::1]). Enter production data through the PocketBase admin UI.`,
    );
  }
  return {
    url,
    email,
    password,
  };
}

export async function runSeed(
  env: Readonly<Record<string, string | undefined>>,
  dataDir: URL = DEFAULT_SEED_DATA_DIR,
): Promise<void> {
  const { url, email, password } = readLocalTarget(env);
  const manifest = await loadSeedManifest(dataDir);
  const pb = new PocketBase(url);
  await pb.collection('_superusers').authWithPassword(email, password);
  await seedPocketBase(pb, manifest);
}

if (import.meta.main) {
  runSeed(process.env).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
