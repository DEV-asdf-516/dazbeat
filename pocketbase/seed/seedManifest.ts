import { readFile } from 'node:fs/promises';
import { basename, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { formatPath, parseChart } from '../../src/data/chartSchema.js';
import {
  DIFFICULTIES,
  SONG_CATEGORIES,
  ZODIACS,
  type SongCategory,
  type Zodiac,
} from '../../src/data/songs.js';
import type { Chart, Difficulty } from '../../src/rhythm/types.js';

export const DEFAULT_SEED_DATA_DIR = new URL('./data/', import.meta.url);

const MANIFEST_FILE_NAME = 'manifest.json';
const PREPARE_GUIDE =
  'Prepare the local seed data as described in the "로컬 시드 데이터" section of docs/pocketbase-operations.md.';

const JACKET_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export interface SeedSong {
  key: string;
  title: string;
  category: SongCategory;
  youtubeVideoId: string;
  accentColor: number;
  constellation: Zodiac;
  gameStartMs: number;
  gameEndMs: number;
  credit?: readonly string[];
  jacket: { fileName: string; type: string; bytes: Uint8Array<ArrayBuffer> };
  charts: readonly { difficulty: Difficulty; data: Chart }[];
}

export class InvalidSeedDataError extends Error {
  override readonly name = 'InvalidSeedDataError';

  constructor(filePath: string, reason: string) {
    super(`Invalid seed data: ${filePath}: ${reason}. ${PREPARE_GUIDE}`);
  }
}

const manifestSchema = z.strictObject({
  version: z.literal(1),
  songs: z
    .array(
      z.strictObject({
        key: z.string().min(1),
        title: z.string().min(1),
        category: z.enum(SONG_CATEGORIES),
        youtubeVideoId: z.string().min(1),
        accentColor: z.int(),
        constellation: z.enum(ZODIACS),
        gameStartMs: z.number(),
        gameEndMs: z.number(),
        credit: z.array(z.string()).optional(),
        jacket: z.string(),
        charts: z.partialRecord(z.enum(DIFFICULTIES), z.string()),
      }),
    )
    .min(1, 'must not be empty')
    .superRefine((songs, ctx) => {
      const seenKeys = new Set<string>();
      for (const [index, song] of songs.entries()) {
        if (seenKeys.has(song.key)) {
          ctx.addIssue({
            code: 'custom',
            path: [index, 'key'],
            message: `duplicates "${song.key}"`,
          });
        }
        seenKeys.add(song.key);
      }
    }),
});

type ManifestSong = z.infer<typeof manifestSchema>['songs'][number];

// 스키마 오류가 곡 안에서 났으면 원본 입력에서 그 곡의 key 를 찾아 위치에 붙인다.
function describeIssueLocation(input: unknown, path: readonly PropertyKey[]): string {
  const location = formatPath(path, 'manifest');
  const [root, index] = path;
  if (
    root !== 'songs' ||
    typeof index !== 'number' ||
    typeof input !== 'object' ||
    input === null
  ) {
    return location;
  }
  const songs: unknown = Reflect.get(input, 'songs');
  const song: unknown = Array.isArray(songs) ? songs[index] : undefined;
  const key: unknown =
    typeof song === 'object' && song !== null ? Reflect.get(song, 'key') : undefined;
  return typeof key === 'string' ? `${location} (song "${key}")` : location;
}

// 데이터 디렉터리 밖(.., 절대 경로, 다른 URL)을 가리키는 경로는 파일을 읽기 전에 거절한다.
function resolveDataPath(dataDir: URL, relativePath: string, location: string): URL {
  const isRelative = !isAbsolute(relativePath) && !URL.canParse(relativePath);
  // 해석할 수 없는 경로(예: "http://[")도 TypeError 대신 같은 시드 오류로 거절한다.
  const resolved = URL.parse(relativePath, dataDir);
  if (!isRelative || resolved === null || !resolved.href.startsWith(dataDir.href)) {
    throw new InvalidSeedDataError(
      describeRejectedPath(resolved, relativePath),
      `${location} "${relativePath}" points outside the seed data directory`,
    );
  }
  return resolved;
}

// 거절된 경로가 가리키는 파일을 알릴 수 있으면 그 절대 경로를, 아니면 manifest 에 적힌 값을 쓴다.
// 인코딩된 구분자가 든 file URL 은 파일 경로로 바꿀 수 없어 fileURLToPath 가 던지므로 원래 입력으로 돌아간다.
function describeRejectedPath(resolved: URL | null, relativePath: string): string {
  if (resolved?.protocol !== 'file:') {
    return relativePath;
  }
  try {
    return fileURLToPath(resolved);
  } catch {
    return relativePath;
  }
}

async function readDataFile(url: URL, location: string): Promise<Buffer<ArrayBuffer>> {
  try {
    return await readFile(url);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new InvalidSeedDataError(fileURLToPath(url), `cannot read ${location}: ${reason}`);
  }
}

function parseJson(text: string, url: URL, location: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new InvalidSeedDataError(fileURLToPath(url), `${location} is not JSON: ${reason}`);
  }
}

async function loadJacket(dataDir: URL, song: ManifestSong): Promise<SeedSong['jacket']> {
  const location = `song "${song.key}" jacket`;
  const url = resolveDataPath(dataDir, song.jacket, location);
  // pathname 은 percent-encoded 라 실제 파일 이름은 파일 경로에서 얻는다.
  const filePath = fileURLToPath(url);
  const type = JACKET_TYPES_BY_EXTENSION[extname(filePath).toLowerCase()];
  if (type === undefined) {
    throw new InvalidSeedDataError(
      filePath,
      `${location} must be one of ${Object.keys(JACKET_TYPES_BY_EXTENSION).join(', ')}`,
    );
  }
  const bytes = await readDataFile(url, location);
  return {
    fileName: basename(filePath),
    type,
    bytes,
  };
}

async function loadCharts(dataDir: URL, song: ManifestSong): Promise<SeedSong['charts']> {
  const charts: { difficulty: Difficulty; data: Chart }[] = [];
  for (const difficulty of DIFFICULTIES) {
    const relativePath = song.charts[difficulty];
    if (relativePath === undefined) {
      continue;
    }
    const location = `song "${song.key}" charts.${difficulty}`;
    const url = resolveDataPath(dataDir, relativePath, location);
    const json = parseJson((await readDataFile(url, location)).toString('utf8'), url, location);
    try {
      const data = parseChart(
        json,
        {
          id: song.key,
          gameStartMs: song.gameStartMs,
          gameEndMs: song.gameEndMs,
        },
        difficulty,
      );
      charts.push({
        difficulty,
        data,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new InvalidSeedDataError(fileURLToPath(url), `${location}: ${reason}`);
    }
  }
  return charts;
}

export async function loadSeedManifest(dataDir: URL): Promise<SeedSong[]> {
  const manifestUrl = new URL(MANIFEST_FILE_NAME, dataDir);
  const manifestPath = fileURLToPath(manifestUrl);
  const text = (await readDataFile(manifestUrl, 'manifest')).toString('utf8');
  const input = parseJson(text, manifestUrl, 'manifest');
  const result = manifestSchema.safeParse(input);
  if (!result.success) {
    const [issue] = result.error.issues;
    throw new InvalidSeedDataError(
      manifestPath,
      `${describeIssueLocation(input, issue?.path ?? [])} ${issue?.message ?? 'is invalid'}`,
    );
  }

  const songs: SeedSong[] = [];
  for (const song of result.data.songs) {
    songs.push({
      key: song.key,
      title: song.title,
      category: song.category,
      youtubeVideoId: song.youtubeVideoId,
      accentColor: song.accentColor,
      constellation: song.constellation,
      gameStartMs: song.gameStartMs,
      gameEndMs: song.gameEndMs,
      ...(song.credit === undefined ? {} : { credit: song.credit }),
      jacket: await loadJacket(dataDir, song),
      charts: await loadCharts(dataDir, song),
    });
  }
  return songs;
}
