/// <reference path="../pb_data/types.d.ts" />
// 곡 검색의 레벨 필터 EXISTS 가 곡마다 이 인덱스로 레인 수와 레벨 범위를 커버링 탐색한다.
const INDEX_NAME = 'idx_charts_song_lane_count_level';

migrate(
  (app) => {
    const charts = app.findCollectionByNameOrId('charts');
    charts.indexes = [
      ...charts.indexes,
      `CREATE INDEX ${INDEX_NAME} ON charts (song, laneCount, level)`,
    ];
    app.save(charts);
  },
  (app) => {
    const charts = app.findCollectionByNameOrId('charts');
    charts.removeIndex(INDEX_NAME);
    app.save(charts);
  },
);
