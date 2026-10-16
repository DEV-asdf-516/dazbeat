import PocketBase from 'pocketbase';
import { DEFAULT_SEED_DATA_DIR, loadSeedManifest, type SeedSong } from './seedManifest.js';

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

export async function seedPocketBase(pb: PocketBase, songs: readonly SeedSong[]): Promise<void> {
  for (const song of songs) {
    const found = await pb
      .collection('songs')
      .getList(1, 1, { filter: pb.filter('key = {:key}', { key: song.key }) });
    const existingSong = found.items[0];
    let songId: string;
    if (existingSong === undefined) {
      const created = await pb.collection('songs').create({
        key: song.key,
        title: song.title,
        category: song.category,
        youtubeVideoId: song.youtubeVideoId,
        accentColor: song.accentColor,
        constellation: song.constellation,
        gameStartMs: song.gameStartMs,
        gameEndMs: song.gameEndMs,
        ...(song.credit === undefined ? {} : { credit: song.credit }),
        jacket: new File([song.jacket.bytes], song.jacket.fileName, { type: song.jacket.type }),
      });
      songId = created.id;
      console.log(`created song ${song.key}`);
    } else {
      songId = existingSong.id;
      console.log(`skipped song ${song.key}`);
    }

    const existingCharts = await pb.collection('charts').getFullList({
      filter: pb.filter('song = {:song}', { song: songId }),
      fields: 'difficulty',
    });
    for (const chart of song.charts) {
      if (existingCharts.some((existing) => existing['difficulty'] === chart.difficulty)) {
        console.log(`skipped chart ${song.key}/${chart.difficulty}`);
        continue;
      }
      await pb.collection('charts').create({
        song: songId,
        difficulty: chart.difficulty,
        data: chart.data,
      });
      console.log(`created chart ${song.key}/${chart.difficulty}`);
    }
  }
}

export async function runSeed(
  env: Readonly<Record<string, string | undefined>>,
  dataDir: URL = DEFAULT_SEED_DATA_DIR,
): Promise<void> {
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
  const songs = await loadSeedManifest(dataDir);
  const pb = new PocketBase(url);
  await pb.collection('_superusers').authWithPassword(email, password);
  await seedPocketBase(pb, songs);
}

if (import.meta.main) {
  runSeed(process.env).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
