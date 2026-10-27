import { findAchievement } from '../../src/data/achievements.js';
import type { AchievementId } from '../../src/data/achievements.js';
import { NICKNAME_MAX_LENGTH, parseNickname } from '../../src/data/nickname.js';
import type { Nickname } from '../../src/data/nickname.js';
import { USERS } from '../../src/pbCollections.js';
import { column, columns, condition, notEqualTo, oneOf } from '../../src/pbSql.js';
import { isRecord, isString } from '../../src/typeGuards.js';
import { queryRows } from './jsvm.js';
import type { JsvmRuntime, SqlApp } from './jsvm.js';

const DEFAULT_NICKNAME_PREFIX = '과즙이';
const DEFAULT_NICKNAME_MIN_DIGITS = 4;
const DEFAULT_NICKNAME_MAX_DIGITS = NICKNAME_MAX_LENGTH - DEFAULT_NICKNAME_PREFIX.length;
const DEFAULT_NICKNAME_RANDOM_ATTEMPTS = 8;

export class InvalidProfileRequestError extends Error {
  override readonly name = 'InvalidProfileRequestError';

  constructor(
    readonly code: 'invalid_request' | 'invalid_nickname',
    message: string,
  ) {
    super(message);
  }
}

export function parseNicknameRequest(body: unknown): Nickname {
  if (!isRecord(body) || !isString(body.nickname)) {
    throw new InvalidProfileRequestError('invalid_request', 'nickname must be a string.');
  }
  const nickname = parseNickname(body.nickname);
  if (nickname === undefined) {
    throw new InvalidProfileRequestError(
      'invalid_nickname',
      'A nickname must be 2 to 16 letters, digits, Hangul syllables, _ or -.',
    );
  }
  return nickname;
}

type UsersQuery = SqlApp<{ all(rows: object[]): void }>;

export function isNicknameTaken(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf'>,
  app: UsersQuery,
  nickname: string,
  userId: string,
): boolean {
  // NOCASE 는 ASCII 만 접는데, 닉네임에서 대소문자가 있는 글자는 ASCII 영문뿐이다. 유니크 인덱스가 두 번째 방어선이다.
  const otherUsersFilter = condition(USERS, { id: notEqualTo(userId) });
  const others = queryRows(
    runtime,
    app,
    { id: 'text' },
    `SELECT ${column(USERS, 'id')} FROM ${USERS.name} WHERE ${column(USERS, 'nickname')} = {:nickname} COLLATE NOCASE AND ${otherUsersFilter.expression} LIMIT 1`,
    {
      ...otherUsersFilter.params,
      nickname,
    },
  );
  return others.length > 0;
}

export function parseFeaturedRequest(body: unknown): AchievementId | null {
  if (!isRecord(body) || (body.achievement !== null && !isString(body.achievement))) {
    throw new InvalidProfileRequestError(
      'invalid_request',
      'achievement must be a string or null.',
    );
  }
  if (body.achievement === null) {
    return null;
  }
  const achievement = findAchievement(body.achievement);
  if (achievement === undefined) {
    throw new InvalidProfileRequestError('invalid_request', 'The achievement does not exist.');
  }
  return achievement.id;
}

// 무작위 충돌 횟수가 아니라 자릿수 공간이 다 찼을 때만 자릿수를 늘린다(사용자 결정).
export function pickDefaultNickname(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf'>,
  app: UsersQuery,
  randomInt: (maxExclusive: number) => number,
): string {
  for (
    let digits = DEFAULT_NICKNAME_MIN_DIGITS;
    digits <= DEFAULT_NICKNAME_MAX_DIGITS;
    digits += 1
  ) {
    const format = (value: number) =>
      `${DEFAULT_NICKNAME_PREFIX}${String(value).padStart(digits, '0')}`;
    const space = 10 ** digits;
    // 가입마다 기본 닉네임 전체를 읽지 않도록, 먼저 유일 인덱스로 무작위 번호 몇 개만 한 번에 확인한다.
    const candidates = Array.from({ length: DEFAULT_NICKNAME_RANDOM_ATTEMPTS }, () =>
      format(randomInt(space)),
    );
    const candidateFilter = condition(USERS, { nickname: oneOf(candidates) });
    const takenRows = queryRows(
      runtime,
      app,
      { nickname: 'text' },
      `SELECT ${columns(USERS, ['nickname'])} FROM ${USERS.name} WHERE ${candidateFilter.expression}`,
      candidateFilter.params,
    );
    const taken = new Set(takenRows.map((row) => row.nickname));
    const free = candidates.find((nickname) => !taken.has(nickname));
    if (free !== undefined) {
      return free;
    }

    // 자릿수가 같은 숫자 문자열이라 닉네임 순서가 곧 번호 순서다.
    const usedNumbers = queryRows(
      runtime,
      app,
      { nickname: 'text' },
      `SELECT ${column(USERS, 'nickname')} FROM ${USERS.name} WHERE ${column(USERS, 'nickname')} GLOB {:pattern} ORDER BY ${column(USERS, 'nickname')}`,
      { pattern: `${DEFAULT_NICKNAME_PREFIX}${'[0-9]'.repeat(digits)}` },
    ).map(({ nickname }) => Number(nickname.slice(DEFAULT_NICKNAME_PREFIX.length)));
    const freeCount = space - usedNumbers.length;
    if (freeCount > 0) {
      // 미사용 값 중 k 번째를 고르려고 그보다 작거나 같은 사용 값만큼 건너뛴다.
      let value = randomInt(freeCount);
      for (const number of usedNumbers) {
        if (number <= value) {
          value += 1;
        }
      }
      return format(value);
    }
  }
  throw new Error('No default nickname is left');
}
