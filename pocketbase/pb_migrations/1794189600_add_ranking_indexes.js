/// <reference path="../pb_data/types.d.ts" />
// 순위는 앞선 기록 수를 세서 정하므로 정렬 열을 모두 담아 테이블을 읽지 않고 센다.
// 업적의 플레이 횟수는 승인된 플레이만 세므로 검토 상태도 담는다.
// 되돌릴 때 이전 마이그레이션이 남긴 문장 그대로 돌려놓도록 SQL 을 통째로 둔다.
const INDEX_CHANGES = [
  {
    collection: 'scores',
    from: {
      name: 'idx_scores_chart_revision_score',
      sql: 'CREATE INDEX `idx_scores_chart_revision_score` ON `scores` (chart, chartRevision, score DESC)',
    },
    to: {
      name: 'idx_scores_chart_revision_rank',
      sql: 'CREATE INDEX idx_scores_chart_revision_rank ON scores (chart, chartRevision, score DESC, accuracy DESC, achievedAt, id)',
    },
  },
  {
    collection: 'play_results',
    from: {
      name: 'idx_play_results_user',
      sql: 'CREATE INDEX idx_play_results_user ON play_results (user)',
    },
    to: {
      name: 'idx_play_results_user_review',
      sql: 'CREATE INDEX idx_play_results_user_review ON play_results (user, reviewStatus)',
    },
  },
];

function replaceIndex(app, collection, removed, added) {
  const target = app.findCollectionByNameOrId(collection);
  target.removeIndex(removed.name);
  target.indexes = [...target.indexes, added.sql];
  app.save(target);
}

migrate(
  (app) => {
    INDEX_CHANGES.forEach(({ collection, from, to }) => replaceIndex(app, collection, from, to));
  },
  (app) => {
    INDEX_CHANGES.forEach(({ collection, from, to }) => replaceIndex(app, collection, to, from));
  },
);
