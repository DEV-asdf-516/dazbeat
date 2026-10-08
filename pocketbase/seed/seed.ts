import { readFile } from 'node:fs/promises';
import PocketBase from 'pocketbase';
import type { SongCategory, Zodiac } from '../../src/data/songs.js';
import type { Difficulty } from '../../src/rhythm/types.js';

interface SeedSong {
  key: string;
  title: string;
  category: SongCategory;
  youtubeVideoId: string;
  accentColor: number;
  constellation: Zodiac;
  gameStartMs: number;
  gameEndMs: number;
  credit?: readonly string[];
  jacketPath: string;
  charts: readonly { difficulty: Difficulty; path: string }[];
}

const SEED_DIR = new URL('./', import.meta.url);

export const SEED_SONGS: readonly SeedSong[] = [
  {
    key: 'sample',
    title: 'ブレインロット',
    category: 'cover',
    youtubeVideoId: '9q-o32Z72Do',
    accentColor: 0x48d6e8,
    constellation: 'gemini',
    gameStartMs: 0,
    gameEndMs: 30000,
    credit: ['ブレインロット (東京真中) ／ダズビー COVER', 'YouTube: DAZBEE official'],
    jacketPath: 'sample/jacket.jpg',
    charts: [
      { difficulty: 'easy', path: 'sample/charts/easy.json' },
      { difficulty: 'normal', path: 'sample/charts/normal.json' },
      { difficulty: 'hard', path: 'sample/charts/hard.json' },
      { difficulty: 'expert', path: 'sample/charts/expert.json' },
    ],
  },
  {
    key: 'karma',
    title: '염라(Karma)',
    category: 'cover',
    youtubeVideoId: 'BKxrYqIAJOY',
    accentColor: 0xe8485a,
    constellation: 'scorpio',
    gameStartMs: 61000,
    gameEndMs: 92000,
    credit: ['염라(Karma) (달의하루)／다즈비 COVER', 'YouTube: DAZBEE official'],
    jacketPath: 'karma/jacket.jpg',
    charts: [
      { difficulty: 'easy', path: 'karma/charts/easy.json' },
      { difficulty: 'normal', path: 'karma/charts/normal.json' },
      { difficulty: 'hard', path: 'karma/charts/hard.json' },
      { difficulty: 'expert', path: 'karma/charts/expert.json' },
    ],
  },
  {
    key: 'lucy',
    title: 'おやすみルーシー',
    category: 'original',
    youtubeVideoId: 'kxi2-AJx5QM',
    accentColor: 0x5b8def,
    constellation: 'aquarius',
    gameStartMs: 0,
    gameEndMs: 34000,
    credit: ['おやすみルーシー (Goodnight, Lucy)／ダズビー', 'YouTube: DAZBEE official'],
    jacketPath: 'lucy/jacket.jpg',
    charts: [
      { difficulty: 'easy', path: 'lucy/charts/easy.json' },
      { difficulty: 'normal', path: 'lucy/charts/normal.json' },
      { difficulty: 'hard', path: 'lucy/charts/hard.json' },
      { difficulty: 'expert', path: 'lucy/charts/expert.json' },
    ],
  },
];

const REQUIRED_ENV = [
  'VITE_POCKETBASE_URL',
  'PB_SUPERUSER_EMAIL',
  'PB_SUPERUSER_PASSWORD',
] as const;

export async function seedPocketBase(pb: PocketBase): Promise<void> {
  for (const song of SEED_SONGS) {
    const found = await pb
      .collection('songs')
      .getList(1, 1, { filter: pb.filter('key = {:key}', { key: song.key }) });
    const existingSong = found.items[0];
    let songId: string;
    if (existingSong === undefined) {
      const jacket = await readFile(new URL(song.jacketPath, SEED_DIR));
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
        jacket: new File([jacket], 'jacket.jpg', { type: 'image/jpeg' }),
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
      const data: unknown = JSON.parse(await readFile(new URL(chart.path, SEED_DIR), 'utf8'));
      await pb.collection('charts').create({ song: songId, difficulty: chart.difficulty, data });
      console.log(`created chart ${song.key}/${chart.difficulty}`);
    }
  }
}

export async function runSeed(env: Readonly<Record<string, string | undefined>>): Promise<void> {
  const missing = REQUIRED_ENV.filter((name) => (env[name] ?? '') === '');
  const url = env['VITE_POCKETBASE_URL'];
  const email = env['PB_SUPERUSER_EMAIL'];
  const password = env['PB_SUPERUSER_PASSWORD'];
  if (missing.length > 0 || url === undefined || email === undefined || password === undefined) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
  const pb = new PocketBase(url);
  await pb.collection('_superusers').authWithPassword(email, password);
  await seedPocketBase(pb);
}

if (import.meta.main) {
  runSeed(process.env).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
