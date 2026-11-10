/// <reference path="../pb_data/types.d.ts" />
// 검토 대기 목록은 created 가 같은 플레이를 id 로 가르므로 id 까지 담아 따로 정렬하지 않고 읽는다.
// 검토 이력은 최신순으로 페이지를 넘기므로 created, id 순서로 담아 테이블 전체를 정렬하지 않는다.
// 되돌릴 때 이전 마이그레이션이 남긴 문장 그대로 돌려놓도록 SQL 을 통째로 둔다.
const PENDING_INDEX = {
  from: {
    name: 'idx_play_results_review_status_created',
    sql: 'CREATE INDEX `idx_play_results_review_status_created` ON `play_results` (reviewStatus, created)',
  },
  to: {
    name: 'idx_play_results_review_status_created_id',
    sql: 'CREATE INDEX idx_play_results_review_status_created_id ON play_results (reviewStatus, created, id)',
  },
};
const REVIEW_HISTORY_INDEX = {
  name: 'idx_play_reviews_created_id',
  sql: 'CREATE INDEX idx_play_reviews_created_id ON play_reviews (created, id)',
};

function replaceIndex(app, collection, removed, added) {
  const target = app.findCollectionByNameOrId(collection);
  target.removeIndex(removed.name);
  target.indexes = [...target.indexes, added.sql];
  app.save(target);
}

migrate(
  (app) => {
    replaceIndex(app, 'play_results', PENDING_INDEX.from, PENDING_INDEX.to);
    const playReviews = app.findCollectionByNameOrId('play_reviews');
    playReviews.indexes = [...playReviews.indexes, REVIEW_HISTORY_INDEX.sql];
    app.save(playReviews);
  },
  (app) => {
    replaceIndex(app, 'play_results', PENDING_INDEX.to, PENDING_INDEX.from);
    const playReviews = app.findCollectionByNameOrId('play_reviews');
    playReviews.removeIndex(REVIEW_HISTORY_INDEX.name);
    app.save(playReviews);
  },
);
