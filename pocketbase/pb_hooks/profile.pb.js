/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'GET',
  '/api/dazbeat/profile',
  (e) => {
    const { loadProfileAchievements } = require(`${__hooks}/lib/achievement/service/grant.cjs`);
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);
    const toDefinition = ({ fields, names }) => ({ ...fields, names });

    const user = e.app.findRecordById('users', e.auth.id);
    const { stats, newAchievements, progress, retired, featured, albumNames } =
      loadProfileAchievements(
        { Record, DynamicModel, arrayOf, dbx: $dbx },
        e.app,
        user.id,
        user.getString('featuredAchievement'),
      );
    return e.json(HTTP_STATUS.ok, {
      nickname: user.getString('nickname'),
      featuredAchievement: featured === null ? null : toDefinition(featured),
      stats,
      achievements: progress.map(({ achievement, earnedAtMs, current, target }) => ({
        definition: toDefinition(achievement),
        earnedAt: earnedAtMs === null ? null : new Date(earnedAtMs).toISOString(),
        current,
        target,
      })),
      retiredAchievements: retired.map(toDefinition),
      albumNames: Object.fromEntries(albumNames),
      newAchievements,
    });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096),
);

// 입력 중 안내일 뿐이다. 그 사이 다른 사람이 가질 수 있으므로 저장은 닉네임 유일 인덱스가 판정한다.
routerAdd(
  'GET',
  '/api/dazbeat/profile/nickname/available',
  (e) => {
    const {
      parseNicknameRequest,
      InvalidProfileRequestError,
      InvalidProfileFieldError,
      PROFILE_REJECTIONS,
    } = require(`${__hooks}/lib/profile/dto.cjs`);
    const { isNicknameTaken } = require(`${__hooks}/lib/profile/repository.cjs`);
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);
    const fail = (status, code, message) => e.json(status, { status, code, message });

    let nickname;
    try {
      nickname = parseNicknameRequest(e.requestInfo().query);
    } catch (error) {
      if (
        error instanceof InvalidProfileRequestError ||
        error instanceof InvalidProfileFieldError
      ) {
        return fail(PROFILE_REJECTIONS[error.code].status, error.code, error.message);
      }
      throw error;
    }
    const available = !isNicknameTaken(
      { Record, DynamicModel, arrayOf, dbx: $dbx },
      e.app,
      nickname,
      e.auth.id,
    );
    return e.json(HTTP_STATUS.ok, { available });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096),
);
