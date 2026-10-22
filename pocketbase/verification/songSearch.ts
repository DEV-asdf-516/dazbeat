import { SONG_CATEGORIES } from '../../src/data/songs.js';
import type { SongCategory } from '../../src/data/songs.js';
import { isOneOf, isString } from '../../src/typeGuards.js';

const MAX_TITLE_LENGTH = 100;
const MAX_CURSOR_LENGTH = 64;
// 1~2 문자는 trigram 이 만들어지지 않아 FTS 로 찾을 수 없다.
const MAX_PREFIX_LENGTH = 2;
const SONG_SEARCH_BATCH_SIZE = 100;

const isCategory = isOneOf(SONG_CATEGORIES);

export class InvalidSongSearchError extends Error {
  override readonly name = 'InvalidSongSearchError';
}

export interface SongSearchInput {
  readonly title: unknown;
  readonly category: unknown;
  readonly afterReleasedOn: unknown;
  readonly afterId: unknown;
}

export interface SongSearchQuery {
  readonly sql: string;
  readonly params: Readonly<Record<string, string>>;
}

interface TitleSearch {
  readonly kind: 'prefix' | 'contains';
  readonly term: string;
}

interface SongSearchCursor {
  readonly releasedOn: string;
  readonly id: string;
}

interface SqlClause {
  readonly condition: string;
  readonly params: Readonly<Record<string, string>>;
}

function parseTitle(value: unknown): TitleSearch {
  if (!isString(value)) {
    throw new InvalidSongSearchError('title must be a string.');
  }
  // 저장된 제목과 같은 NFC 로 맞춰야 조합형으로 입력한 검색어도 찾는다.
  const term = value.normalize('NFC').trim();
  // 보조 평면 문자도 한 글자로 센다.
  const termLength = Array.from(term).length;
  if (termLength === 0 || termLength > MAX_TITLE_LENGTH) {
    throw new InvalidSongSearchError(`title must be 1 to ${MAX_TITLE_LENGTH} characters.`);
  }
  return {
    kind: termLength <= MAX_PREFIX_LENGTH ? 'prefix' : 'contains',
    term,
  };
}

function parseCategory(value: unknown): SongCategory | null {
  if (value === undefined) {
    return null;
  }
  if (!isCategory(value)) {
    throw new InvalidSongSearchError(`category must be one of ${SONG_CATEGORIES.join(', ')}.`);
  }
  return value;
}

function isCursorValue(value: unknown): value is string {
  return isString(value) && value !== '' && value.length <= MAX_CURSOR_LENGTH;
}

function parseCursor(releasedOn: unknown, id: unknown): SongSearchCursor | null {
  if (releasedOn === undefined && id === undefined) {
    return null;
  }
  if (!isCursorValue(releasedOn) || !isCursorValue(id)) {
    throw new InvalidSongSearchError(
      `afterReleasedOn and afterId must both be non-empty strings of at most ${MAX_CURSOR_LENGTH} characters.`,
    );
  }
  return {
    releasedOn,
    id,
  };
}

export function buildSongSearchQuery(input: SongSearchInput): SongSearchQuery {
  const title = parseTitle(input.title);
  const category = parseCategory(input.category);
  const cursor = parseCursor(input.afterReleasedOn, input.afterId);

  const titleClause =
    title.kind === 'prefix'
      ? {
          from: 'songs',
          condition: `songs.title LIKE {:pattern} ESCAPE '\\'`,
          params: { pattern: `${title.term.replace(/[\\%_]/g, (char) => `\\${char}`)}%` },
        }
      : {
          from: 'songs_title_fts JOIN songs ON songs.id = songs_title_fts.songId',
          condition: 'songs_title_fts MATCH {:match}',
          params: { match: `"${title.term.replace(/"/g, '""')}"` },
        };
  const clauses: SqlClause[] = [
    titleClause,
    category === null
      ? null
      : {
          condition: 'songs.category = {:category}',
          params: { category },
        },
    cursor === null
      ? null
      : {
          condition:
            '(songs.releasedOn < {:afterReleasedOn} OR ' +
            '(songs.releasedOn = {:afterReleasedOn} AND songs.id < {:afterId}))',
          params: {
            afterReleasedOn: cursor.releasedOn,
            afterId: cursor.id,
          },
        },
  ].filter((clause) => clause !== null);
  return {
    sql:
      `SELECT songs.id AS id FROM ${titleClause.from} ` +
      `WHERE ${clauses.map((clause) => clause.condition).join(' AND ')} ` +
      `ORDER BY songs.releasedOn DESC, songs.id DESC LIMIT ${SONG_SEARCH_BATCH_SIZE}`,
    params: clauses.reduce<Record<string, string>>(
      (all, clause) => ({
        ...all,
        ...clause.params,
      }),
      {},
    ),
  };
}
