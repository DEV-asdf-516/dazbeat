/// <reference path="../pb_data/types.d.ts" />
// 업적 지급 기록(earned_achievements)과 헷갈리지 않도록, 업적 판정에 쓰는 채보 단위와 곡 단위 도장을
// earned_ 이름으로 맞춘다.
const RENAMES = [
  {
    from: 'achievement_marks',
    to: 'earned_chart_marks',
    uniqueColumns: 'user, kind, chart, chartRevision, constellation',
  },
  {
    from: 'song_masteries',
    to: 'earned_song_marks',
    uniqueColumns: 'user, song, kind',
  },
];

function rename(app, from, to, uniqueColumns) {
  const collection = app.findCollectionByNameOrId(from);
  collection.name = to;
  collection.indexes = [`CREATE UNIQUE INDEX idx_${to}_unique ON ${to} (${uniqueColumns})`];
  app.save(collection);
}

migrate(
  (app) => {
    RENAMES.forEach(({ from, to, uniqueColumns }) => rename(app, from, to, uniqueColumns));
  },
  (app) => {
    RENAMES.forEach(({ from, to, uniqueColumns }) => rename(app, to, from, uniqueColumns));
  },
);
