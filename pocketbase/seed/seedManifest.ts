import { readFile } from 'node:fs/promises';
import { basename, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseChart } from '../../src/data/chartSchema.js';
import { parseJson } from '../../src/json.js';
import { formatPath } from '../../src/data/parseIssue.js';
import {
  DIFFICULTIES,
  SONG_CATEGORIES,
  ZODIACS,
  type SongCategory,
  type Zodiac,
} from '../../src/data/songs.js';
import { LANE_COUNTS } from '../../src/rhythm/lanes.js';
import type { Chart, Difficulty, LaneCount } from '../../src/rhythm/types.js';

export const DEFAULT_SEED_DATA_DIR = new URL('./data', import.meta.url);

const MANIFEST_FILE_NAME = 'manifest.json';
const PREPARE_GUIDE =
  'Prepare the local seed data as described in the "로컬 시드 데이터" section of docs/pocketbase-operations.md.';

const JACKET_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export interface SeedAlbum {
  key: string;
  name: string;
  sortOrder: number;
}

export interface SeedSong {
  key: string;
  title: string;
  category: SongCategory;
  youtubeVideoId: string;
  accentColor: number;
  constellation: Zodiac;
  /** albums 의 key. */
  album?: string;
  releasedOn: string;
  gameStartMs: number;
  gameEndMs: number;
  previewStartMs?: number;
  credit?: readonly string[];
  jacket: { fileName: string; type: string; bytes: Uint8Array<ArrayBuffer> };
  charts: readonly { laneCount: LaneCount; difficulty: Difficulty; data: Chart }[];
}

export interface SeedManifest {
  albums: readonly SeedAlbum[];
  songs: SeedSong[];
}

export class InvalidSeedDataError extends Error {
  override readonly name = 'InvalidSeedDataError';

  constructor(filePath: string, reason: string) {
    super(`Invalid seed data: ${filePath}: ${reason}. ${PREPARE_GUIDE}`);
  }
}

const manifestSchema = z
  .strictObject({
    version: z.literal(2),
    albums: z
      .array(
        z.strictObject({
          key: z.string().regex(/^[a-z][A-Za-z0-9]*$/),
          name: z.string().min(1),
          sortOrder: z.int(),
        }),
      )
      .superRefine((albums, ctx) => {
        const seenKeys = new Set<string>();
        for (const [index, album] of albums.entries()) {
          if (seenKeys.has(album.key)) {
            ctx.addIssue({
              code: 'custom',
              path: [index, 'key'],
              message: `duplicates "${album.key}"`,
            });
          }
          seenKeys.add(album.key);
        }
      }),
    songs: z
      .array(
        z.strictObject({
          key: z.string().min(1),
          title: z.string().min(1),
          category: z.enum(SONG_CATEGORIES),
          youtubeVideoId: z.string().min(1),
          accentColor: z.int(),
          constellation: z.enum(ZODIACS),
          album: z.string().optional(),
          releasedOn: z.iso.date(),
          gameStartMs: z.number(),
          gameEndMs: z.number(),
          previewStartMs: z.int().min(0).optional(),
          credit: z.array(z.string()).optional(),
          jacket: z.string(),
          charts: z.partialRecord(
            z.templateLiteral([z.literal(LANE_COUNTS)]),
            z.partialRecord(z.enum(DIFFICULTIES), z.string()),
          ),
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
  })
  .superRefine(({ albums, songs }, ctx) => {
    const albumKeys = new Set(albums.map(({ key }) => key));
    for (const [index, song] of songs.entries()) {
      if (song.album !== undefined && !albumKeys.has(song.album)) {
        ctx.addIssue({
          code: 'custom',
          path: ['songs', index, 'album'],
          message: `is not a key in albums: "${song.album}"`,
        });
      }
    }
  });

type ManifestSong = z.infer<typeof manifestSchema>['songs'][number];

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

function resolveDataPath(dataDir: URL, relativePath: string, location: string): URL {
  const isRelative = !isAbsolute(relativePath) && !URL.canParse(relativePath);
  const resolved = URL.parse(relativePath, dataDir);
  if (!isRelative || resolved === null || !resolved.href.startsWith(dataDir.href)) {
    throw new InvalidSeedDataError(
      describeRejectedPath(resolved, relativePath),
      `${location} "${relativePath}" points outside the seed data directory`,
    );
  }
  return resolved;
}

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

function readJson(text: string, url: URL, location: string): unknown {
  const value = parseJson(text);
  if (value === undefined) {
    throw new InvalidSeedDataError(fileURLToPath(url), `${location} is not JSON`);
  }
  return value;
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
  const charts: { laneCount: LaneCount; difficulty: Difficulty; data: Chart }[] = [];
  for (const laneCount of LANE_COUNTS) {
    const paths = song.charts[`${laneCount}`] ?? {};
    for (const difficulty of DIFFICULTIES) {
      const relativePath = paths[difficulty];
      if (relativePath === undefined) {
        continue;
      }
      const location = `song "${song.key}" charts.${laneCount}.${difficulty}`;
      const url = resolveDataPath(dataDir, relativePath, location);
      const json = readJson((await readDataFile(url, location)).toString('utf8'), url, location);
      try {
        const data = parseChart(
          json,
          {
            id: song.key,
            gameStartMs: song.gameStartMs,
            gameEndMs: song.gameEndMs,
          },
          difficulty,
          laneCount,
        );
        charts.push({
          laneCount,
          difficulty,
          data,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new InvalidSeedDataError(fileURLToPath(url), `${location}: ${reason}`);
      }
    }
  }
  return charts;
}

export async function loadSeedManifest(dataDir: URL): Promise<SeedManifest> {
  const manifestUrl = new URL(MANIFEST_FILE_NAME, dataDir);
  const manifestPath = fileURLToPath(manifestUrl);
  const text = (await readDataFile(manifestUrl, 'manifest')).toString('utf8');
  const input = readJson(text, manifestUrl, 'manifest');
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
      ...(song.album === undefined ? {} : { album: song.album }),
      releasedOn: song.releasedOn,
      gameStartMs: song.gameStartMs,
      gameEndMs: song.gameEndMs,
      ...(song.previewStartMs === undefined ? {} : { previewStartMs: song.previewStartMs }),
      ...(song.credit === undefined ? {} : { credit: song.credit }),
      jacket: await loadJacket(dataDir, song),
      charts: await loadCharts(dataDir, song),
    });
  }
  return {
    albums: result.data.albums,
    songs,
  };
}
