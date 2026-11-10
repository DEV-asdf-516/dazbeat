/// <reference path="../pb_data/types.d.ts" />
// 목록 조회가 읽는 열을 인덱스에 담아 테이블 행을 읽지 않게 한다. 캐시가 식으면 행마다 페이지를 읽는다.
// scores: 내 최고 기록 목록은 사용자의 기록을 모두 읽는데, 기록 행은 쌓인 시점마다 흩어져 있다. chart 순서라 묶을 때 정렬하지 않는다.
// charts: 앞 열 data 가 커서 뒤 열을 읽으면 overflow 페이지를 모두 지난다. 레인과 난이도는 채보마다 정해져 있어 행이 많은
// scores 대신 이미 조인하는 charts 인덱스에 담는다. 곡별 채보는 기존 유니크 인덱스가 id 를 담지 못해 따로 둔다.
// 되돌릴 때 이전 마이그레이션이 남긴 문장 그대로 돌려놓도록 SQL 을 통째로 둔다.
const ADDED_INDEXES = [
  {
    collection: 'scores',
    name: 'idx_scores_user_chart_best_fields',
    sql: 'CREATE INDEX idx_scores_user_chart_best_fields ON scores (user, chart, score, accuracy, maxCombo, cleared)',
  },
  {
    collection: 'charts',
    name: 'idx_charts_song_difficulty_lane_count_id',
    sql: 'CREATE INDEX idx_charts_song_difficulty_lane_count_id ON charts (song, difficulty, laneCount, id)',
  },
];
const CHARTS_ID_INDEX = {
  from: {
    name: 'idx_charts_id_revision_song',
    sql: 'CREATE INDEX idx_charts_id_revision_song ON charts (id, revision, song)',
  },
  to: {
    name: 'idx_charts_id_revision_song_lane_difficulty',
    sql: 'CREATE INDEX idx_charts_id_revision_song_lane_difficulty ON charts (id, revision, song, laneCount, difficulty)',
  },
};

function replaceChartsIdIndex(app, removed, added) {
  const charts = app.findCollectionByNameOrId('charts');
  charts.removeIndex(removed.name);
  charts.indexes = [...charts.indexes, added.sql];
  app.save(charts);
}

migrate(
  (app) => {
    ADDED_INDEXES.forEach(({ collection, sql }) => {
      const target = app.findCollectionByNameOrId(collection);
      target.indexes = [...target.indexes, sql];
      app.save(target);
    });
    replaceChartsIdIndex(app, CHARTS_ID_INDEX.from, CHARTS_ID_INDEX.to);
  },
  (app) => {
    replaceChartsIdIndex(app, CHARTS_ID_INDEX.to, CHARTS_ID_INDEX.from);
    ADDED_INDEXES.forEach(({ collection, name }) => {
      const target = app.findCollectionByNameOrId(collection);
      target.removeIndex(name);
      app.save(target);
    });
  },
);
