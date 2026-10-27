/// <reference path="../pb_data/types.d.ts" />
// JSVM handlers cannot see the outer scope, so each handler defines what it needs inline.

routerAdd(
  'GET',
  '/api/dazbeat/profile',
  (e) => {
    const { evaluateUserAchievements, syncAchievements } = require(
      `${__hooks}/lib/achievementSync.cjs`,
    );
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);
    const runtime = { Record, DynamicModel, arrayOf };

    const userId = e.auth.id;
    // Evaluating here grants what backfilled marks or content changes newly prove, so the response
    // always reflects the achievements just written. Most views grant nothing, so the write
    // transaction is taken, and the evaluation redone inside it, only when something is new.
    let achievements = evaluateUserAchievements(runtime, e.app, userId);
    if (achievements.newMasteries.length > 0 || achievements.newAchievements.length > 0) {
      e.app.runInTransaction((txApp) => {
        achievements = syncAchievements(runtime, txApp, userId);
      });
    }
    const { progress, stats, newAchievements, earnedAtMsById } = achievements;
    const user = e.app.findRecordById('users', userId);
    const featuredAchievement = user.getString('featuredAchievement');
    return e.json(HTTP_STATUS.ok, {
      nickname: user.getString('nickname'),
      featuredAchievement: featuredAchievement === '' ? null : featuredAchievement,
      stats,
      achievements: progress.map(({ id, current, target }) => {
        const earnedAtMs = earnedAtMsById.get(id);
        return {
          id,
          earnedAt: earnedAtMs === undefined ? null : new Date(earnedAtMs).toISOString(),
          current,
          target,
        };
      }),
      newAchievements,
    });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096),
);

routerAdd(
  'POST',
  '/api/dazbeat/profile/nickname',
  (e) => {
    const { parseNicknameRequest, isNicknameTaken, InvalidProfileRequestError } = require(
      `${__hooks}/lib/profileRequest.cjs`,
    );
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);
    const fail = (status, code, message) => e.json(status, { status, code, message });

    let nickname;
    try {
      nickname = parseNicknameRequest(e.requestInfo().body);
    } catch (error) {
      if (error instanceof InvalidProfileRequestError) {
        return fail(HTTP_STATUS.badRequest, error.code, error.message);
      }
      throw error;
    }

    const userId = e.auth.id;
    let isTaken = false;
    e.app.runInTransaction((txApp) => {
      const user = txApp.findRecordById('users', userId);
      if (user.getString('nickname') === nickname) {
        return;
      }
      if (isNicknameTaken({ DynamicModel, arrayOf }, txApp, nickname, userId)) {
        isTaken = true;
        return;
      }
      user.set('nickname', nickname);
      txApp.save(user);
    });
    if (isTaken) {
      return fail(HTTP_STATUS.conflict, 'nickname_taken', 'The nickname is already taken.');
    }
    return e.json(HTTP_STATUS.ok, { nickname });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096),
);

// A hint while typing. The nickname route still checks on save, since the name can be taken meanwhile.
routerAdd(
  'GET',
  '/api/dazbeat/profile/nickname/available',
  (e) => {
    const { parseNicknameRequest, isNicknameTaken, InvalidProfileRequestError } = require(
      `${__hooks}/lib/profileRequest.cjs`,
    );
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);
    const fail = (status, code, message) => e.json(status, { status, code, message });

    let nickname;
    try {
      nickname = parseNicknameRequest(e.requestInfo().query);
    } catch (error) {
      if (error instanceof InvalidProfileRequestError) {
        return fail(HTTP_STATUS.badRequest, error.code, error.message);
      }
      throw error;
    }
    const available = !isNicknameTaken({ DynamicModel, arrayOf }, e.app, nickname, e.auth.id);
    return e.json(HTTP_STATUS.ok, { available });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096),
);

routerAdd(
  'POST',
  '/api/dazbeat/profile/featured',
  (e) => {
    const { parseFeaturedRequest, InvalidProfileRequestError } = require(
      `${__hooks}/lib/profileRequest.cjs`,
    );
    const { where, EARNED_ACHIEVEMENTS, HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);
    const fail = (status, code, message) => e.json(status, { status, code, message });

    let achievement;
    try {
      achievement = parseFeaturedRequest(e.requestInfo().body);
    } catch (error) {
      if (error instanceof InvalidProfileRequestError) {
        return fail(HTTP_STATUS.badRequest, error.code, error.message);
      }
      throw error;
    }

    const userId = e.auth.id;
    let isNotEarned = false;
    e.app.runInTransaction((txApp) => {
      if (achievement !== null) {
        const earnedFilter = where(EARNED_ACHIEVEMENTS, [{ user: userId, achievement }]);
        const earned = txApp.findRecordsByFilter(
          EARNED_ACHIEVEMENTS.name,
          earnedFilter.expression,
          '',
          1,
          0,
          earnedFilter.params,
        );
        if (earned.length === 0) {
          isNotEarned = true;
          return;
        }
      }
      // The users row read in this transaction is the one saved, so a nickname changed meanwhile is
      // not overwritten with a stale value.
      const user = txApp.findRecordById('users', userId);
      const featuredAchievement = achievement ?? '';
      if (user.getString('featuredAchievement') === featuredAchievement) {
        return;
      }
      user.set('featuredAchievement', featuredAchievement);
      txApp.save(user);
    });
    if (isNotEarned) {
      return fail(
        HTTP_STATUS.conflict,
        'achievement_not_earned',
        'The achievement has not been earned.',
      );
    }
    return e.json(HTTP_STATUS.ok, { featuredAchievement: achievement });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096),
);
