/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'GET',
  '/api/dazbeat/leaderboards/{chartId}',
  (e) => {
    const { RANKING_REJECTIONS } = require(`${__hooks}/lib/ranking/dto.cjs`);
    const { loadLeaderboard } = require(`${__hooks}/lib/ranking/service.cjs`);
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);

    // superuser 의 e.auth 는 users 레코드가 아니라 순위에 오를 수 없다.
    const userId = e.auth !== null && !e.requestInfo().hasSuperuserAuth() ? e.auth.id : null;
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

routerAdd(
  'GET',
  '/api/dazbeat/profile/rankings',
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
  '/api/dazbeat/profile/top-ranks',
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
  '/api/dazbeat/profile/records',
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

onRecordCreate((e) => {
  const { fillScoreChartFields } = require(`${__hooks}/lib/ranking/service.cjs`);
  fillScoreChartFields({ DynamicModel, arrayOf, dbx: $dbx }, e.app, e.record);
  e.next();
}, 'scores');
