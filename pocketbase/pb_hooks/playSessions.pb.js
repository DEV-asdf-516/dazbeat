/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'POST',
  '/api/dazbeat/play-sessions',
  (e) => {
    const { parseSessionRequest, SessionRejectedError, SESSION_REJECTIONS } = require(
      `${__hooks}/lib/session/dto.cjs`,
    );
    const { loadSessionChart, issuePlaySession } = require(
      `${__hooks}/lib/session/service/issue.cjs`,
    );
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);
    const fail = (status, code, message) => e.json(status, { status, code, message });
    const reject = (code) =>
      fail(SESSION_REJECTIONS[code].status, code, SESSION_REJECTIONS[code].message);

    let chart;
    try {
      chart = loadSessionChart(
        { Record, DynamicModel, arrayOf, dbx: $dbx },
        e.app,
        parseSessionRequest(e.requestInfo().body),
      );
    } catch (error) {
      if (error instanceof SessionRejectedError) {
        return reject(error.code);
      }
      throw error;
    }

    const issue = issuePlaySession(
      { Record, DynamicModel, arrayOf, dbx: $dbx },
      e.app,
      e.auth.id,
      chart,
    );
    if (issue.kind === 'limited') {
      e.response.header().set('Retry-After', String(issue.retryAfterSeconds));
      return reject('session_rate_limited');
    }
    return e.json(HTTP_STATUS.ok, {
      sessionId: issue.sessionId,
      expiresAt: new Date(issue.expiresAtMs).toISOString(),
    });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096),
);

routerAdd(
  'POST',
  '/api/dazbeat/play-sessions/{sessionId}/result',
  (e) => {
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);
    const { PLAY_REJECTION_RESPONSES, SessionRejectedError, SESSION_REJECTIONS } = require(
      `${__hooks}/lib/session/dto.cjs`,
    );
    const { verifyPlay } = require(`${__hooks}/lib/session/service/verify.cjs`);
    const { consumePlaySession, recordPlayResult } = require(
      `${__hooks}/lib/session/service/submit.cjs`,
    );
    const fail = (status, code, message) => e.json(status, { status, code, message });
    const reject = (code) =>
      fail(SESSION_REJECTIONS[code].status, code, SESSION_REJECTIONS[code].message);

    const userId = e.auth.id;
    const sessionId = e.request.pathValue('sessionId');
    const runtime = { Record, DynamicModel, arrayOf, dbx: $dbx };
    try {
      const played = consumePlaySession(runtime, e.app, sessionId, userId);
      const verification = verifyPlay({
        song: {
          key: played.songKey,
          gameStartMs: played.gameStartMs,
          gameEndMs: played.gameEndMs,
        },
        difficulty: played.difficulty,
        laneCount: played.laneCount,
        chart: {
          revision: $security.sha256(played.chartData),
          data: JSON.parse(played.chartData),
        },
        session: {
          chartRevision: played.chartRevision,
          issuedAtMs: new DateTime(played.issuedAt).time().unixMilli(),
          expiresAtMs: new DateTime(played.expiresAt).time().unixMilli(),
        },
        submission: e.requestInfo().body,
        nowMs: Date.now(),
      });
      if (verification.kind !== 'verified') {
        const { status, message } = PLAY_REJECTION_RESPONSES[verification.code];
        return fail(status, verification.code, message);
      }

      const { result, autoplayCheck } = verification;
      const { bestScore, newAchievements } = recordPlayResult(runtime, e.app, {
        userId,
        sessionId,
        played,
        result,
        autoplayCheck,
      });
      const { score, accuracy, maxCombo, counts, cleared } = result;
      return e.json(HTTP_STATUS.ok, {
        score,
        accuracy,
        maxCombo,
        counts,
        cleared,
        bestScore,
        newAchievements,
      });
    } catch (error) {
      if (error instanceof SessionRejectedError) {
        return reject(error.code);
      }
      throw error;
    }
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(1048576),
);
