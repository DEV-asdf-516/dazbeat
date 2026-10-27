/// <reference path="../pb_data/types.d.ts" />
// JSVM handlers cannot see the outer scope, so each handler defines what it needs inline.

routerAdd(
  'POST',
  '/api/dazbeat/play-sessions',
  (e) => {
    const { getSessionExpiresAtMs } = require(`${__hooks}/lib/verifyPlay.cjs`);
    const { deleteRows, queryRows } = require(`${__hooks}/lib/jsvm.cjs`);
    const { decideSessionIssue } = require(`${__hooks}/lib/sessionQuota.cjs`);
    const { parseSessionRequest, InvalidSessionRequestError } = require(
      `${__hooks}/lib/sessionRequest.cjs`,
    );
    const {
      where,
      columnAs,
      columns,
      join,
      condition,
      CHARTS,
      PLAY_SESSION_QUOTAS,
      PLAY_SESSIONS,
      SONGS,
      HTTP_STATUS,
    } = require(`${__hooks}/lib/pbQuery.cjs`);
    const fail = (status, code, message) => e.json(status, { status, code, message });

    let request;
    try {
      request = parseSessionRequest(e.requestInfo().body);
    } catch (error) {
      if (error instanceof InvalidSessionRequestError) {
        return fail(HTTP_STATUS.badRequest, 'invalid_request', error.message);
      }
      throw error;
    }
    const { chartId, chartRevision } = request;
    const chartFilter = condition(CHARTS, { id: chartId });
    const [chart] = queryRows(
      { DynamicModel, arrayOf },
      e.app,
      {
        id: 'text',
        revision: 'text',
        data: 'text',
        songKey: 'text',
        gameStartMs: 'float',
        gameEndMs: 'float',
      },
      `SELECT
          ${columns(CHARTS, ['id', 'revision', 'data'])},
          ${columnAs(SONGS, 'key', 'songKey')},
          ${columns(SONGS, ['gameStartMs', 'gameEndMs'])}
        FROM ${CHARTS.name}
        ${join('JOIN', SONGS, 'id', CHARTS, 'song')}
      WHERE ${chartFilter.expression}
      LIMIT 1`,
      chartFilter.params,
    );
    if (chart === undefined) {
      return fail(HTTP_STATUS.notFound, 'chart_not_found', 'The chart does not exist.');
    }
    if (chart.revision !== chartRevision) {
      return fail(
        HTTP_STATUS.conflict,
        'chart_changed',
        'The chart has changed since it was loaded.',
      );
    }

    const userId = e.auth.id;
    // runInTransaction returns only an error, so the transaction hands out what it decided through
    // this variable.
    let outcome;
    e.app.runInTransaction((txApp) => {
      // Reading the quota, deciding and writing in one transaction keeps concurrent issues of the
      // same user from exceeding the limit. The clock is read after the quota row for the same reason.
      const quotaFilter = where(PLAY_SESSION_QUOTAS, [{ user: userId }]);
      let quota = txApp.findRecordsByFilter(
        PLAY_SESSION_QUOTAS.name,
        quotaFilter.expression,
        '',
        1,
        0,
        quotaFilter.params,
      )[0];
      const issuedAtMs = Date.now();
      const decision = decideSessionIssue(
        quota === undefined
          ? null
          : {
              windowStartedAtMs: quota.getDateTime('windowStartedAt').time().unixMilli(),
              issuedCount: quota.getInt('issuedCount'),
            },
        issuedAtMs,
      );
      if (decision.kind === 'limited') {
        outcome = { kind: 'limited', retryAfterSeconds: decision.retryAfterSeconds };
        return;
      }
      if (quota === undefined) {
        quota = new Record(txApp.findCachedCollectionByNameOrId('play_session_quotas'));
        quota.set('user', userId);
      }
      quota.set('windowStartedAt', new Date(decision.quota.windowStartedAtMs).toISOString());
      quota.set('issuedCount', decision.quota.issuedCount);
      txApp.save(quota);

      const expiresAtMs = getSessionExpiresAtMs(
        {
          key: chart.songKey,
          gameStartMs: chart.gameStartMs,
          gameEndMs: chart.gameEndMs,
        },
        issuedAtMs,
      );
      // Deleted in SQL so the chart data snapshot of the previous session is not read just to drop it.
      deleteRows(txApp, PLAY_SESSIONS, condition(PLAY_SESSIONS, { user: userId }));
      const session = new Record(txApp.findCachedCollectionByNameOrId('play_sessions'));
      session.set('user', userId);
      session.set('chart', chart.id);
      session.set('chartRevision', chartRevision);
      // The raw text of the chart compared above is stored byte for byte, so its sha256 equals
      // chartRevision; a re-serialized object could differ and fail every submission.
      session.set('chartData', chart.data);
      session.set('issuedAt', new Date(issuedAtMs).toISOString());
      session.set('expiresAt', new Date(expiresAtMs).toISOString());
      txApp.save(session);
      outcome = { kind: 'issued', sessionId: session.id, expiresAtMs };
    });
    if (outcome.kind === 'limited') {
      e.response.header().set('Retry-After', String(outcome.retryAfterSeconds));
      return fail(
        HTTP_STATUS.tooManyRequests,
        'session_rate_limited',
        'Too many play sessions were requested. Try again later.',
      );
    }
    return e.json(HTTP_STATUS.ok, {
      sessionId: outcome.sessionId,
      expiresAt: new Date(outcome.expiresAtMs).toISOString(),
    });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096),
);

routerAdd(
  'POST',
  '/api/dazbeat/play-sessions/{sessionId}/result',
  (e) => {
    const { verifyPlay, PLAY_REJECTION_RESPONSES } = require(`${__hooks}/lib/verifyPlay.cjs`);
    const {
      where,
      column,
      columnAs,
      columns,
      join,
      condition,
      CHARTS,
      PLAY_SESSIONS,
      SCORES,
      SONGS,
      HTTP_STATUS,
    } = require(`${__hooks}/lib/pbQuery.cjs`);
    const { recordVerifiedPlay } = require(`${__hooks}/lib/achievementSync.cjs`);
    const { deleteRows, queryRow, queryRows } = require(`${__hooks}/lib/jsvm.cjs`);
    const fail = (status, code, message) => e.json(status, { status, code, message });
    const sessionNotFound = () =>
      fail(HTTP_STATUS.notFound, 'session_not_found', 'The play session does not exist.');

    const userId = e.auth.id;
    const sessionId = e.request.pathValue('sessionId');
    // The session is read and consumed in one transaction before the replay, so parallel
    // submissions of one session see exactly one winner and a session is replayed at most once.
    // Its chart and song come in the same query.
    let played;
    e.app.runInTransaction((txApp) => {
      const ownSessionFilter = condition(PLAY_SESSIONS, { id: sessionId, user: userId });
      const [row] = queryRows(
        { DynamicModel, arrayOf },
        txApp,
        {
          chartData: 'text',
          chartRevision: 'text',
          issuedAt: 'text',
          expiresAt: 'text',
          chart: 'text',
          difficulty: 'text',
          laneCount: 'int',
          song: 'text',
          songKey: 'text',
          gameStartMs: 'float',
          gameEndMs: 'float',
          constellation: 'text',
        },
        `SELECT
            ${columns(PLAY_SESSIONS, ['chartData', 'chartRevision', 'issuedAt', 'expiresAt'])},
            ${columnAs(CHARTS, 'id', 'chart')},
            ${columns(CHARTS, ['difficulty', 'laneCount'])},
            ${columnAs(SONGS, 'id', 'song')},
            ${columnAs(SONGS, 'key', 'songKey')},
            ${columns(SONGS, ['gameStartMs', 'gameEndMs', 'constellation'])}
          FROM ${PLAY_SESSIONS.name}
          ${join('JOIN', CHARTS, 'id', PLAY_SESSIONS, 'chart')}
          ${join('JOIN', SONGS, 'id', CHARTS, 'song')}
        WHERE ${ownSessionFilter.expression}
        LIMIT 1`,
        ownSessionFilter.params,
      );
      if (row === undefined) {
        return;
      }
      // Dropped in SQL so the row is not read again just to delete it.
      deleteRows(txApp, PLAY_SESSIONS, condition(PLAY_SESSIONS, { id: sessionId }));
      played = row;
    });
    if (played === undefined) {
      return sessionNotFound();
    }
    const { chartRevision, chartData } = played;
    // The play is verified against the chart it was issued with, so a chart saved during the play
    // does not reject it; the sha256 check in verifyPlay guards the snapshot itself.
    const replayInput = {
      song: {
        key: played.songKey,
        gameStartMs: played.gameStartMs,
        gameEndMs: played.gameEndMs,
      },
      difficulty: played.difficulty,
      laneCount: played.laneCount,
      chart: {
        revision: $security.sha256(chartData),
        data: JSON.parse(chartData),
      },
      session: {
        chartRevision,
        issuedAtMs: new DateTime(played.issuedAt).time().unixMilli(),
        expiresAtMs: new DateTime(played.expiresAt).time().unixMilli(),
      },
      submission: e.requestInfo().body,
    };

    // Replay outside any transaction so the write lock is not held while it runs; the best score
    // is updated in a separate transaction afterwards.
    const verification = verifyPlay({ ...replayInput, nowMs: Date.now() });
    if (verification.kind !== 'verified') {
      const { status, message } = PLAY_REJECTION_RESPONSES[verification.code];
      return fail(status, verification.code, message);
    }

    const { result } = verification;
    let bestScore = 0;
    let newAchievements = [];
    e.app.runInTransaction((txApp) => {
      // The best score is ranked under the chart revision current at submission, read in this
      // transaction, so a play accepted on its snapshot shows in the current ranking.
      const currentFilter = condition(CHARTS, { id: played.chart });
      const { revision: currentRevision } = queryRow(
        { DynamicModel },
        txApp,
        { revision: 'text' },
        `SELECT ${column(CHARTS, 'revision')} FROM ${CHARTS.name} WHERE ${currentFilter.expression}`,
        currentFilter.params,
      );
      const key = { user: userId, chart: played.chart, chartRevision: currentRevision };
      const bestFilter = where(SCORES, [key]);
      let best = txApp.findRecordsByFilter(
        SCORES.name,
        bestFilter.expression,
        '',
        1,
        0,
        bestFilter.params,
      )[0];
      if (best === undefined) {
        best = new Record(txApp.findCachedCollectionByNameOrId('scores'));
        best.set('user', userId);
        best.set('chart', played.chart);
        best.set('chartRevision', currentRevision);
      }
      if (best.isNew() || result.score > best.getFloat('score')) {
        best.set('score', result.score);
        best.set('accuracy', result.accuracy);
        best.set('maxCombo', result.maxCombo);
        best.set('cleared', result.cleared);
        best.set('counts', result.counts);
        txApp.save(best);
      }
      bestScore = best.getFloat('score');

      // Recorded in the best score transaction so a verified play is either fully recorded or not
      // at all, even when it does not beat the best score.
      newAchievements = recordVerifiedPlay({ Record, DynamicModel, arrayOf }, txApp, {
        userId,
        sessionId,
        song: { id: played.song, constellation: played.constellation },
        chart: {
          id: played.chart,
          difficulty: played.difficulty,
          laneCount: played.laneCount,
          currentRevision,
        },
        sessionChartRevision: chartRevision,
        result,
      });
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
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(1048576),
);
