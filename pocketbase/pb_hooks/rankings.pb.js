/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'GET',
  '/api/dazbeat/leaderboards/{chartId}',
  (e) => {
    const { RANKING_REJECTIONS } = require(`${__hooks}/lib/ranking/dto.cjs`);
    const { loadLeaderboard } = require(`${__hooks}/lib/ranking/service.cjs`);
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);

    // superuser 의 e.auth 는 users 레코드가 아니라 순위에 오를 수 없다.
    const userId = e.auth !== null && !e.hasSuperuserAuth() ? e.auth.id : null;
    const load = loadLeaderboard(
      { DynamicModel, arrayOf, dbx: $dbx },
      e.app,
      e.request.pathValue('chartId'),
      userId,
    );
    if (load.kind === 'notFound') {
      const { status, message } = RANKING_REJECTIONS.chart_not_found;
      return e.json(status, { status, code: 'chart_not_found', message });
    }
    return e.json(HTTP_STATUS.ok, load.leaderboard);
  },
  $apis.bodyLimit(4096),
);

// 로그인 판은 순위표 기록으로 세므로, 이 라우트는 로그인하지 않은 플레이어만 받는다.
routerAdd(
  'POST',
  '/api/dazbeat/charts/{chartId}/guest',
  (e) => {
    const { InvalidRankingRequestError, RANKING_REJECTIONS, parseGuestPlayerRevision } = require(
      `${__hooks}/lib/ranking/dto.cjs`,
    );
    const { recordGuestPlayer } = require(`${__hooks}/lib/ranking/service.cjs`);
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);

    if (e.auth !== null) {
      const { status, message } = RANKING_REJECTIONS.signed_in_player;
      return e.json(status, { status, code: 'signed_in_player', message });
    }
    let chartRevision;
    try {
      chartRevision = parseGuestPlayerRevision(e.requestInfo().body);
    } catch (error) {
      if (error instanceof InvalidRankingRequestError) {
        const { status } = RANKING_REJECTIONS[error.code];
        return e.json(status, { status, code: error.code, message: error.message });
      }
      throw error;
    }
    recordGuestPlayer({ Record, DynamicModel, arrayOf, dbx: $dbx }, e.app, {
      chart: e.request.pathValue('chartId'),
      chartRevision,
    });
    return e.noContent(HTTP_STATUS.noContent);
  },
  $apis.bodyLimit(4096),
);

onRecordCreate((e) => {
  const { fillScoreChartFields } = require(`${__hooks}/lib/ranking/service.cjs`);
  fillScoreChartFields({ DynamicModel, arrayOf, dbx: $dbx }, e.app, e.record);
  e.next();
}, 'scores');
