import { ClientResponseError } from 'pocketbase';
import type PocketBase from 'pocketbase';
import { z } from 'zod';
import { ACHIEVEMENT_SETS, parseAchievementDefinition } from '../data/achievements.js';
import type { AchievementId } from '../data/achievements.js';
import { isNickname } from '../data/nickname.js';
import type { Nickname } from '../data/nickname.js';
import { ProfileRequestError } from '../data/profile.js';
import type { AchievementStatus, Profile, ProfileRequestErrorKind } from '../data/profile.js';
import { HTTP_STATUS } from '../httpStatus.js';
import { isRecord, isString } from '../typeGuards.js';
import { sendApiRequest } from './apiRequest.js';
import { getCurrentUser } from './auth.js';

const PROFILE_PATH = '/api/dazbeat/profile';

const ROUTE_ERROR_KINDS: Readonly<Record<string, ProfileRequestErrorKind>> = {
  invalid_nickname: 'invalidNickname',
};
const FIELD_ERROR_KINDS: Readonly<
  Record<string, Readonly<Record<string, ProfileRequestErrorKind>>>
> = {
  nickname: {
    invalid_nickname: 'invalidNickname',
    validation_not_unique: 'nicknameTaken',
  },
  featuredAchievement: { achievement_not_earned: 'notEarned' },
};

// 서버가 저장 때 검사하고 무효가 된 행은 빼서 보내므로, 여기서 무효면 개발 오류다.
const servedAchievement = z
  .object({
    key: z.string(),
    achievementSet: z.string(),
    category: z.string(),
    kind: z.string(),
    target: z.number(),
    mark: z.string(),
    difficulty: z.string(),
    zodiac: z.string(),
    album: z.string(),
    retired: z.boolean(),
    names: z.object({
      ko: z.string(),
      ja: z.string(),
      en: z.string(),
    }),
  })
  .transform(({ names, ...fields }) => ({
    ...parseAchievementDefinition(fields),
    names,
  }));

const profileSchema = z
  .object({
    nickname: z.custom<Nickname>(isNickname),
    featuredAchievement: servedAchievement.nullable(),
    stats: z.object({
      playCount: z.number(),
      clearedSongCount: z.number(),
      sChartCount: z.number(),
      fullComboChartCount: z.number(),
      allPerfectChartCount: z.number(),
    }),
    achievements: z.array(
      z.object({
        definition: servedAchievement,
        earnedAt: z.iso
          .datetime()
          .nullable()
          .transform((earnedAt) => (earnedAt === null ? null : Date.parse(earnedAt))),
        current: z.number(),
        target: z.number(),
      }),
    ),
    retiredAchievements: z.array(servedAchievement),
    albumNames: z.record(z.string(), z.string()),
    newAchievements: z.array(z.string()),
  })
  .transform(
    (
      { achievements, retiredAchievements, albumNames, newAchievements, ...loaded },
      context,
    ): Profile => {
      // 세트 탭이 비면 화면이 그릴 업적이 없어, 프로필 실패로 다시 시도하게 한다.
      const emptySet = ACHIEVEMENT_SETS.find(
        (set) => !achievements.some(({ definition }) => definition.set === set),
      );
      if (emptySet !== undefined) {
        context.addIssue({
          code: 'custom',
          message: `Profile has no achievement in set ${emptySet}`,
        });
        return z.NEVER;
      }
      const statuses = achievements.map(({ earnedAt, ...status }): AchievementStatus => ({
        ...status,
        earnedAtMs: earnedAt,
      }));
      const newIds = new Set(newAchievements);
      return {
        ...loaded,
        achievements: statuses,
        newAchievements: new Set(
          statuses.flatMap(({ definition }) => (newIds.has(definition.id) ? [definition] : [])),
        ),
        catalog: {
          definitions: [...statuses.map(({ definition }) => definition), ...retiredAchievements],
          albumNames: new Map(Object.entries(albumNames)),
        },
      };
    },
  );

const changedNickname = z.object({ nickname: z.custom<Nickname>(isNickname) });
const nicknameAvailability = z.object({ available: z.boolean() });
// 저장값 '' 는 장착 없음이다.
const changedFeatured = z.object({
  featuredAchievement: z.string().transform((id) => (id === '' ? null : id)),
});

function toProfileRequestError(error: unknown): unknown {
  if (!(error instanceof ClientResponseError)) {
    return error;
  }
  if (error.status === HTTP_STATUS.unauthorized) {
    return new ProfileRequestError('unauthorized', error);
  }
  const code: unknown = error.response['code'];
  const data: unknown = error.response['data'];
  const routeKind = isString(code) ? ROUTE_ERROR_KINDS[code] : undefined;
  if (routeKind !== undefined) {
    return new ProfileRequestError(routeKind, error);
  }
  if (!isRecord(data)) {
    return new ProfileRequestError('failed', error);
  }
  for (const [field, kinds] of Object.entries(FIELD_ERROR_KINDS)) {
    const fieldError = data[field];
    const fieldKind =
      isRecord(fieldError) && isString(fieldError['code']) ? kinds[fieldError['code']] : undefined;
    if (fieldKind !== undefined) {
      return new ProfileRequestError(fieldKind, error);
    }
  }
  return new ProfileRequestError('failed', error);
}

async function updateCurrentUser<T>(
  pb: PocketBase,
  body: Record<string, string>,
  schema: z.ZodType<T>,
): Promise<T> {
  const user = getCurrentUser(pb);
  if (user === null) {
    throw new ProfileRequestError('unauthorized', undefined);
  }
  let record: unknown;
  try {
    record = await pb.collection('users').update(user.id, body);
  } catch (error) {
    throw toProfileRequestError(error);
  }
  return schema.parse(record);
}

export async function loadProfile(pb: PocketBase): Promise<Profile> {
  return sendApiRequest(pb, PROFILE_PATH, { method: 'GET' }, profileSchema, toProfileRequestError);
}

export async function changeNickname(pb: PocketBase, nickname: Nickname): Promise<Nickname> {
  const changed = await updateCurrentUser(pb, { nickname }, changedNickname);
  return changed.nickname;
}

export async function isNicknameAvailable(pb: PocketBase, nickname: Nickname): Promise<boolean> {
  const { available } = await sendApiRequest(
    pb,
    `${PROFILE_PATH}/nickname/available`,
    {
      method: 'GET',
      query: { nickname },
    },
    nicknameAvailability,
    toProfileRequestError,
  );
  return available;
}

export async function setFeaturedAchievement(
  pb: PocketBase,
  id: AchievementId | null,
): Promise<AchievementId | null> {
  const changed = await updateCurrentUser(pb, { featuredAchievement: id ?? '' }, changedFeatured);
  return changed.featuredAchievement;
}
