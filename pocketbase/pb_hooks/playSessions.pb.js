/// <reference path="../pb_data/types.d.ts" />
// Ranked play API. Judgment lives in the verification bundle; this file only reads records, runs
// transactions and writes responses. JSVM handlers cannot see the outer scope, so each handler
// defines what it needs inline.

routerAdd(
  'POST',
  '/api/dazbeat/play-sessions',
  (e) => {
    const { getSessionExpiresAtMs } = require(`${__hooks}/lib/verifyPlay.cjs`);
    const { decideSessionIssue } = require(`${__hooks}/lib/sessionQuota.cjs`);
    const fail = (status, code, message) => e.json(status, { status, code, message });

    const body = e.requestInfo().body;
    const chartId = body['chartId'];
    const chartRevision = body['chartRevision'];
    if (typeof chartId !== 'string' || typeof chartRevision !== 'string') {
      return fail(400, 'invalid_request', 'chartId and chartRevision must be strings.');
    }
    const chart = e.app.findRecordsByFilter('charts', 'id = {:id}', '', 1, 0, { id: chartId })[0];
    if (chart === undefined) {
      return fail(404, 'chart_not_found', 'The chart does not exist.');
    }
    if (chart.getString('revision') !== chartRevision) {
      return fail(409, 'chart_changed', 'The chart has changed since it was loaded.');
    }
    const song = e.app.findRecordById('songs', chart.getString('song'));

    const userId = e.auth.id;
    let sessionId = '';
    let expiresAtMs = 0;
    let retryAfterSeconds = 0;
    e.app.runInTransaction((txApp) => {
      // Reading the quota, deciding and writing in one transaction keeps concurrent issues of the
      // same user from exceeding the limit. The clock is read after the quota row for the same reason.
      let quota = txApp.findRecordsByFilter('play_session_quotas', 'user = {:user}', '', 1, 0, {
        user: userId,
      })[0];
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
        retryAfterSeconds = decision.retryAfterSeconds;
        return;
      }
      if (quota === undefined) {
        quota = new Record(txApp.findCollectionByNameOrId('play_session_quotas'));
        quota.set('user', userId);
      }
      quota.set('windowStartedAt', new Date(decision.quota.windowStartedAtMs).toISOString());
      quota.set('issuedCount', decision.quota.issuedCount);
      txApp.save(quota);

      expiresAtMs = getSessionExpiresAtMs(
        {
          key: song.getString('key'),
          gameStartMs: song.getFloat('gameStartMs'),
          gameEndMs: song.getFloat('gameEndMs'),
        },
        issuedAtMs,
      );
      const previous = txApp.findRecordsByFilter('play_sessions', 'user = {:user}', '', 0, 0, {
        user: userId,
      });
      for (const record of previous) {
        txApp.delete(record);
      }
      const session = new Record(txApp.findCollectionByNameOrId('play_sessions'));
      session.set('user', userId);
      session.set('chart', chart.id);
      session.set('chartRevision', chartRevision);
      session.set('issuedAt', new Date(issuedAtMs).toISOString());
      session.set('expiresAt', new Date(expiresAtMs).toISOString());
      txApp.save(session);
      sessionId = session.id;
    });
    if (retryAfterSeconds > 0) {
      e.response.header().set('Retry-After', String(retryAfterSeconds));
      return fail(
        429,
        'session_rate_limited',
        'Too many play sessions were requested. Try again later.',
      );
    }
    return e.json(200, { sessionId, expiresAt: new Date(expiresAtMs).toISOString() });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096),
);

routerAdd(
  'POST',
  '/api/dazbeat/play-sessions/{sessionId}/result',
  (e) => {
    const { verifyPlay, PLAY_REJECTION_STATUS } = require(`${__hooks}/lib/verifyPlay.cjs`);
    const fail = (status, code, message) => e.json(status, { status, code, message });
    const sessionNotFound = () =>
      fail(404, 'session_not_found', 'The play session does not exist.');
    const REJECTION_MESSAGES = {
      session_expired: 'The play session has expired.',
      chart_changed: 'The chart has changed since the play session was issued.',
      chart_invalid: 'The stored chart is invalid.',
      too_short: 'The result was submitted sooner than the play could finish.',
      invalid_events: 'The submitted input events are invalid.',
      not_finished: 'The replayed play did not finish.',
    };

    const userId = e.auth.id;
    const ownSessionFilter = 'id = {:id} && user = {:user}';
    const ownSessionParams = { id: e.request.pathValue('sessionId'), user: userId };
    const session = e.app.findRecordsByFilter(
      'play_sessions',
      ownSessionFilter,
      '',
      1,
      0,
      ownSessionParams,
    )[0];
    if (session === undefined) {
      return sessionNotFound();
    }
    const chart = e.app.findRecordById('charts', session.getString('chart'));
    const song = e.app.findRecordById('songs', chart.getString('song'));
    const chartRevision = session.getString('chartRevision');
    const replayInput = {
      song: {
        key: song.getString('key'),
        gameStartMs: song.getFloat('gameStartMs'),
        gameEndMs: song.getFloat('gameEndMs'),
      },
      difficulty: chart.getString('difficulty'),
      chart: {
        revision: chart.getString('revision'),
        data: JSON.parse(toString(chart.get('data'))),
      },
      session: {
        chartRevision,
        issuedAtMs: session.getDateTime('issuedAt').time().unixMilli(),
        expiresAtMs: session.getDateTime('expiresAt').time().unixMilli(),
      },
      submission: e.requestInfo().body,
    };

    // The session is consumed before the replay, and only the re-check inside the transaction
    // decides consumption, so parallel submissions of one session see exactly one winner and a
    // session is replayed at most once.
    let isConsumed = false;
    e.app.runInTransaction((txApp) => {
      const current = txApp.findRecordsByFilter(
        'play_sessions',
        ownSessionFilter,
        '',
        1,
        0,
        ownSessionParams,
      )[0];
      if (current === undefined) {
        return;
      }
      txApp.delete(current);
      isConsumed = true;
    });
    if (!isConsumed) {
      return sessionNotFound();
    }

    // Replay outside any transaction so the write lock is not held while it runs; the best score
    // is updated in a separate transaction afterwards.
    const verification = verifyPlay({ ...replayInput, nowMs: Date.now() });
    if (verification.kind !== 'verified') {
      const status = PLAY_REJECTION_STATUS[verification.code];
      return fail(status, verification.code, REJECTION_MESSAGES[verification.code]);
    }

    const { result } = verification;
    let bestScore = 0;
    e.app.runInTransaction((txApp) => {
      const key = { user: userId, chart: chart.id, chartRevision };
      let best = txApp.findRecordsByFilter(
        'scores',
        'user = {:user} && chart = {:chart} && chartRevision = {:chartRevision}',
        '',
        1,
        0,
        key,
      )[0];
      if (best === undefined) {
        best = new Record(txApp.findCollectionByNameOrId('scores'));
        best.set('user', userId);
        best.set('chart', chart.id);
        best.set('chartRevision', chartRevision);
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
    });

    const { score, accuracy, maxCombo, counts, cleared } = result;
    return e.json(200, { score, accuracy, maxCombo, counts, cleared, bestScore });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(1048576),
);
