import { ClientResponseError } from 'pocketbase';
import type PocketBase from 'pocketbase';
import { z } from 'zod';
import { ACHIEVEMENT_IDS, findAchievement } from '../data/achievements.js';
import type { AchievementId } from '../data/achievements.js';
import type { Nickname } from '../data/nickname.js';
import { ProfileRequestError } from '../data/profile.js';
import type { AchievementStatus, Profile, ProfileRequestErrorKind } from '../data/profile.js';
import { HTTP_STATUS } from '../httpStatus.js';
import { requireDefined } from '../invariant.js';
import { isString } from '../typeGuards.js';
import { sendApiRequest } from './apiRequest.js';

const PROFILE_PATH = '/api/dazbeat/profile';

const ERROR_KINDS: Readonly<Record<string, ProfileRequestErrorKind>> = {
  invalid_nickname: 'invalidNickname',
  nickname_taken: 'nicknameTaken',
  achievement_not_earned: 'notEarned',
};

const achievementId = z.string().transform((id, context): AchievementId => {
  const achievement = findAchievement(id);
  if (achievement === undefined) {
    context.addIssue({
      code: 'custom',
      message: `Unknown achievement: ${id}`,
    });
    return z.NEVER;
  }
  return achievement.id;
});

// 프로필 화면은 카탈로그 전부를 그리므로 누락, 중복이 있으면 응답 전체를 받지 않는다.
const achievementStatuses = z
  .array(
    z.object({
      id: achievementId,
      earnedAt: z.iso.datetime().nullable(),
      current: z.number(),
      target: z.number(),
    }),
  )
  .transform((entries, context): AchievementStatus[] => {
    const byId = new Map(
      entries.map(({ id, earnedAt, current, target }) => [
        id,
        {
          id,
          earnedAtMs: earnedAt === null ? null : Date.parse(earnedAt),
          current,
          target,
        },
      ]),
    );
    if (entries.length !== ACHIEVEMENT_IDS.length || byId.size !== ACHIEVEMENT_IDS.length) {
      context.addIssue({
        code: 'custom',
        message: 'Profile must list every achievement exactly once',
      });
      return z.NEVER;
    }
    return ACHIEVEMENT_IDS.map((id) =>
      requireDefined(byId.get(id), 'Profile achievement is missing', id),
    );
  });

const profile = z
  .object({
    nickname: z.string(),
    featuredAchievement: achievementId.nullable(),
    stats: z.object({
      playCount: z.number(),
      clearedSongCount: z.number(),
      sChartCount: z.number(),
      fullComboChartCount: z.number(),
      allPerfectChartCount: z.number(),
    }),
    achievements: achievementStatuses,
    newAchievements: z.array(achievementId),
  })
  .transform(({ newAchievements, ...loaded }): Profile => ({
    ...loaded,
    newAchievements: new Set(newAchievements),
  }));

const changedNickname = z.object({ nickname: z.string() });
const nicknameAvailability = z.object({ available: z.boolean() });
const changedFeatured = z.object({ featuredAchievement: achievementId.nullable() });

function toProfileRequestError(error: unknown): unknown {
  if (!(error instanceof ClientResponseError)) {
    return error;
  }
  if (error.status === HTTP_STATUS.unauthorized) {
    return new ProfileRequestError('unauthorized', error);
  }
  const code: unknown = error.response['code'];
  return new ProfileRequestError(
    (isString(code) ? ERROR_KINDS[code] : undefined) ?? 'failed',
    error,
  );
}

export async function loadProfile(pb: PocketBase): Promise<Profile> {
  return sendApiRequest(pb, PROFILE_PATH, { method: 'GET' }, profile, toProfileRequestError);
}

export async function changeNickname(pb: PocketBase, nickname: Nickname): Promise<string> {
  const changed = await sendApiRequest(
    pb,
    `${PROFILE_PATH}/nickname`,
    {
      method: 'POST',
      body: { nickname },
    },
    changedNickname,
    toProfileRequestError,
  );
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
  const changed = await sendApiRequest(
    pb,
    `${PROFILE_PATH}/featured`,
    {
      method: 'POST',
      body: { achievement: id },
    },
    changedFeatured,
    toProfileRequestError,
  );
  return changed.featuredAchievement;
}
