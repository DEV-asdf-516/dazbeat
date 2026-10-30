/// <reference path="../pb_data/types.d.ts" />
// 곡 단위 도장을 세는 규칙 이름을 곡 단위 도장 테이블(earned_song_marks)과 맞춘다.
const KINDS = [
  'plays',
  'songs',
  'charts',
  'zodiacVisits',
  'zodiacComplete',
  'zodiacCompletions',
  'album',
];

function renameKind(app, from, to) {
  const achievements = app.findCollectionByNameOrId('achievements');
  const kind = achievements.fields.getByName('kind');
  kind.values = [...KINDS, from, to];
  app.save(achievements);
  app
    .findRecordsByFilter('achievements', 'kind = {:kind}', '', 0, 0, { kind: from })
    .forEach((record) => {
      record.set('kind', to);
      app.save(record);
    });
  kind.values = [...KINDS, to];
  app.save(achievements);
}

migrate(
  (app) => renameKind(app, 'masteries', 'songMarks'),
  (app) => renameKind(app, 'songMarks', 'masteries'),
);
