/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'GET',
  '/api/dazbeat/me/profile',
  (e) => {
    const { loadProfileAchievements } = require(`${__hooks}/lib/achievement/service/grant.cjs`);
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);
    const toDefinition = ({ fields, names }) => ({ ...fields, names });

    const user = e.app.findRecordById('users', e.auth.id);
    const { stats, newAchievements, progress, retired, featured, albums } = loadProfileAchievements(
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
      albums: Object.fromEntries(albums),
      newAchievements,
    });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096),
);

// 입력 중 안내일 뿐이다. 그 사이 다른 사람이 가질 수 있으므로 저장은 닉네임 유일 인덱스가 판정한다.
routerAdd(
  'GET',
  '/api/dazbeat/me/nickname/available',
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

routerAdd(
  'GET',
  '/api/dazbeat/me/rankings',
  (e) => {
    const {
      InvalidRankingRequestError,
      RANKING_REJECTIONS,
      parseRankedChartCursor,
      parseRankedChartDifficulty,
      parseRankedChartLaneCount,
      parseRankedChartSort,
    } = require(`${__hooks}/lib/ranking/dto.cjs`);
    const { loadMyRankings } = require(`${__hooks}/lib/ranking/service.cjs`);
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);

    const {
      sort: rawSort,
      laneCount,
      difficulty,
      afterValue,
      afterChartId,
    } = e.requestInfo().query;
    try {
      const sort = parseRankedChartSort(rawSort);
      const { items, next } = loadMyRankings(
        { DynamicModel, arrayOf, dbx: $dbx },
        e.app,
        e.auth.id,
        {
          sort,
          laneCount: parseRankedChartLaneCount(laneCount),
          difficulty: parseRankedChartDifficulty(difficulty),
          cursor: parseRankedChartCursor(sort, afterValue, afterChartId),
        },
      );
      return e.json(HTTP_STATUS.ok, {
        items: items.map(({ achievedAtMs, ...chart }) => ({
          ...chart,
          achievedAt: new Date(achievedAtMs).toISOString(),
        })),
        next,
      });
    } catch (error) {
      if (error instanceof InvalidRankingRequestError) {
        const { status } = RANKING_REJECTIONS[error.code];
        return e.json(status, { status, code: error.code, message: error.message });
      }
      throw error;
    }
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096),
);

routerAdd(
  'GET',
  '/api/dazbeat/me/top-ranks',
  (e) => {
    const { loadMyTopRanks } = require(`${__hooks}/lib/ranking/service.cjs`);
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);

    return e.json(HTTP_STATUS.ok, {
      items: loadMyTopRanks({ DynamicModel, arrayOf, dbx: $dbx }, e.app, e.auth.id),
    });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096),
);

routerAdd(
  'GET',
  '/api/dazbeat/me/records',
  (e) => {
    const { readUserBestRecords } = require(`${__hooks}/lib/ranking/repository.cjs`);
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);

    return e.json(HTTP_STATUS.ok, {
      items: readUserBestRecords({ DynamicModel, arrayOf, dbx: $dbx }, e.app, e.auth.id),
    });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096),
);
