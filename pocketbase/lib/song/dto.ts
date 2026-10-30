import { SONG_CATEGORIES } from '../../../src/data/songs.js';
import type { SongCategory, SongScope } from '../../../src/data/songs.js';
import { HTTP_STATUS } from '../../../src/httpStatus.js';
import { isOneOf, isString } from '../../../src/typeGuards.js';
import type { JsvmRecord } from '../jsvm.js';

const MAX_TITLE_LENGTH = 100;
const MAX_CURSOR_LENGTH = 64;
// 1~2 문자는 trigram 이 만들어지지 않아 FTS 로 찾을 수 없다.
const MAX_PREFIX_LENGTH = 2;

const isCategory = isOneOf(SONG_CATEGORIES);

type SongSearchRejectionCode = 'invalid_request' | 'editor_required';

export const SONG_SEARCH_REJECTIONS: Record<SongSearchRejectionCode, { status: number }> = {
  invalid_request: { status: HTTP_STATUS.badRequest },
  editor_required: { status: HTTP_STATUS.forbidden },
};

export class SongSearchRejectedError extends Error {
  override readonly name = 'SongSearchRejectedError';

  constructor(
    readonly code: SongSearchRejectionCode,
    message: string,
  ) {
    super(message);
  }
}

export interface SongSearchInput {
  readonly title: unknown;
  readonly category: unknown;
  readonly afterReleasedOn: unknown;
  readonly afterId: unknown;
  readonly scope: unknown;
  readonly canListUnpublished: boolean;
}

export interface TitleSearch {
  readonly kind: 'prefix' | 'contains';
  readonly term: string;
}

export interface SongSearchCursor {
  readonly releasedOn: string;
  readonly id: string;
}

export interface SongSearchRequest {
  readonly title: TitleSearch;
  readonly category: SongCategory | null;
  readonly cursor: SongSearchCursor | null;
  readonly scope: SongScope;
}

export function parseSongSearchInput(input: SongSearchInput): SongSearchRequest {
  return {
    title: parseTitle(input.title),
    category: parseCategory(input.category),
    cursor: parseCursor(input.afterReleasedOn, input.afterId),
    scope: parseScope(input.scope, input.canListUnpublished),
  };
}

function parseTitle(value: unknown): TitleSearch {
  if (!isString(value)) {
    throw new SongSearchRejectedError('invalid_request', 'title must be a string.');
  }
  // 저장된 제목과 같은 NFC 로 맞춰야 조합형으로 입력한 검색어도 찾는다.
  const term = value.normalize('NFC').trim();
  // 보조 평면 문자도 한 글자로 센다.
  const termLength = Array.from(term).length;
  if (termLength === 0 || termLength > MAX_TITLE_LENGTH) {
    throw new SongSearchRejectedError(
      'invalid_request',
      `title must be 1 to ${MAX_TITLE_LENGTH} characters.`,
    );
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
    throw new SongSearchRejectedError(
      'invalid_request',
      `category must be one of ${SONG_CATEGORIES.join(', ')}.`,
    );
  }
  return value;
}

// 명시적 published 는 받지 않는다. 생략과 all 두 가지만 허용한다(사용자 결정).
function parseScope(value: unknown, canListUnpublished: boolean): SongScope {
  if (value === undefined) {
    return 'published';
  }
  if (value !== 'all') {
    throw new SongSearchRejectedError('invalid_request', 'scope must be omitted or all.');
  }
  if (!canListUnpublished) {
    throw new SongSearchRejectedError(
      'editor_required',
      'Listing unpublished songs requires an editor.',
    );
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
    throw new SongSearchRejectedError(
      'invalid_request',
      `afterReleasedOn and afterId must both be non-empty strings of at most ${MAX_CURSOR_LENGTH} characters.`,
    );
  }
  return {
    releasedOn,
    id,
  };
}

export interface SongSearchChart {
  readonly id: string;
  readonly difficulty: string;
  readonly laneCount: number;
}

export interface SongSearchPage {
  /** 첫 페이지에서만 센다. */
  readonly totalItems: number | null;
  readonly songs: readonly JsvmRecord[];
  readonly chartsBySong: ReadonlyMap<string, readonly SongSearchChart[]>;
  readonly hasMore: boolean;
}
