/// <reference path="../pb_data/types.d.ts" />
// 업적 정의는 요청마다 화면 순서대로 읽어, 정렬을 이 인덱스로 한다.
const INDEX_NAME = 'idx_achievements_sort_order_key';

migrate(
  (app) => {
    const achievements = app.findCollectionByNameOrId('achievements');
    achievements.addIndex(INDEX_NAME, false, 'sortOrder, key', '');
    app.save(achievements);
  },
  (app) => {
    const achievements = app.findCollectionByNameOrId('achievements');
    achievements.removeIndex(INDEX_NAME);
    app.save(achievements);
  },
);
