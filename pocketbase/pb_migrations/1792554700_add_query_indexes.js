/// <reference path="../pb_data/types.d.ts" />
// 곡 목록 정렬, 채보별 점수 순위, 채보 cascade 삭제가 이 열들을 조회한다.
const INDEXES = [
  { collection: 'songs', name: 'idx_songs_released_on_id', columns: 'releasedOn DESC, id DESC' },
  {
    collection: 'scores',
    name: 'idx_scores_chart_revision_score',
    columns: 'chart, chartRevision, score DESC',
  },
  { collection: 'play_sessions', name: 'idx_play_sessions_chart', columns: 'chart' },
];

migrate(
  (app) => {
    INDEXES.forEach(({ collection, name, columns }) => {
      const target = app.findCollectionByNameOrId(collection);
      target.addIndex(name, false, columns, '');
      app.save(target);
    });
  },
  (app) => {
    INDEXES.forEach(({ collection, name }) => {
      const target = app.findCollectionByNameOrId(collection);
      target.removeIndex(name);
      app.save(target);
    });
  },
);
