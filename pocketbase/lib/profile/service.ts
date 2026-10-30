import type { AchievementId } from '../../../src/data/achievements.js';
import { NICKNAME_MAX_LENGTH } from '../../../src/data/nickname.js';
import { readAchievements } from '../achievement/repository.js';
import type { DbApp, JsvmRuntime } from '../jsvm.js';
import { InvalidProfileFieldError } from './dto.js';
import { hasEarnedAchievement, readNumberedNicknames, readTakenNicknames } from './repository.js';

const DEFAULT_NICKNAME_PREFIX = '과즙이';
const DEFAULT_NICKNAME_MIN_DIGITS = 4;
const DEFAULT_NICKNAME_MAX_DIGITS = NICKNAME_MAX_LENGTH - DEFAULT_NICKNAME_PREFIX.length;
const DEFAULT_NICKNAME_RANDOM_ATTEMPTS = 8;

/** 빈 값은 대표 업적 해제라 null 이다. */
export function loadFeaturedAchievement(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>,
  app: DbApp,
  userId: string,
  value: string,
): AchievementId | null {
  if (value === '') {
    return null;
  }
  const notEarned = new InvalidProfileFieldError(
    'featuredAchievement',
    'achievement_not_earned',
    'The achievement has not been earned.',
  );
  const [achievement] = readAchievements(runtime, app, value);
  if (
    achievement === undefined ||
    !hasEarnedAchievement(runtime, app, userId, achievement.definition.id)
  ) {
    throw notEarned;
  }
  return achievement.definition.id;
}

// 무작위 충돌 횟수가 아니라 자릿수 공간이 다 찼을 때만 자릿수를 늘린다(사용자 결정).
export function pickDefaultNickname(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>,
  app: DbApp,
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
    const taken = readTakenNicknames(runtime, app, candidates);
    const free = candidates.find((nickname) => !taken.has(nickname));
    if (free !== undefined) {
      return free;
    }

    const usedNumbers = readNumberedNicknames(runtime, app, DEFAULT_NICKNAME_PREFIX, digits).map(
      (nickname) => Number(nickname.slice(DEFAULT_NICKNAME_PREFIX.length)),
    );
    const freeCount = space - usedNumbers.length;
    if (freeCount <= 0) {
      continue;
    }
    // 미사용 값 중 k 번째를 고르려고 그보다 작거나 같은 사용 값만큼 건너뛴다.
    let value = randomInt(freeCount);
    for (const number of usedNumbers) {
      if (number <= value) {
        value += 1;
      }
    }
    return format(value);
  }
  throw new Error('No default nickname is left');
}
