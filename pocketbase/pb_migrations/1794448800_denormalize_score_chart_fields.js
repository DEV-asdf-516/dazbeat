/// <reference path="../pb_data/types.d.ts" />
// 내 기록을 정렬값 순서로 읽으며 레인과 난이도를 인덱스 안에서 거르려고 scores 에 복제한다. 한 페이지를 채우면 멈춘다.
// 복제 값은 pb_hooks 의 scores 생성 훅과 charts 수정 훅이 맞춘다.
// charts 는 앞 열 data 가 커서 뒤 열을 읽을 때 overflow 페이지를 모두 지나므로, 조인에 쓰는 열을 인덱스에 담는다.
const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert'];
const NEW_INDEXES = [
  {
    collection: 'scores',
    name: 'idx_scores_user_score_chart_lane_difficulty',
    sql: 'CREATE INDEX idx_scores_user_score_chart_lane_difficulty ON scores (user, score DESC, chart, laneCount, difficulty)',
  },
  {
    collection: 'scores',
    name: 'idx_scores_user_achieved_chart_lane_difficulty',
    sql: 'CREATE INDEX idx_scores_user_achieved_chart_lane_difficulty ON scores (user, achievedAt DESC, chart, laneCount, difficulty)',
  },
  {
    collection: 'charts',
    name: 'idx_charts_id_revision_song',
    sql: 'CREATE INDEX idx_charts_id_revision_song ON charts (id, revision, song)',
  },
];

migrate(
  (app) => {
    const scores = app.findCollectionByNameOrId('scores');
    scores.fields.add(
      new NumberField({ name: 'laneCount', required: true, onlyInt: true, min: 4, max: 6 }),
    );
    scores.fields.add(
      new SelectField({ name: 'difficulty', required: true, maxSelect: 1, values: DIFFICULTIES }),
    );
    app.save(scores);
    app
      .db()
      .newQuery(
        `UPDATE scores SET
          laneCount = (SELECT laneCount FROM charts WHERE charts.id = scores.chart),
          difficulty = (SELECT difficulty FROM charts WHERE charts.id = scores.chart)`,
      )
      .execute();
    NEW_INDEXES.forEach(({ collection, sql }) => {
      const target = app.findCollectionByNameOrId(collection);
      target.indexes = [...target.indexes, sql];
      app.save(target);
    });
  },
  (app) => {
    NEW_INDEXES.forEach(({ collection, name }) => {
      const target = app.findCollectionByNameOrId(collection);
      target.removeIndex(name);
      app.save(target);
    });
    const scores = app.findCollectionByNameOrId('scores');
    scores.fields.removeByName('laneCount');
    scores.fields.removeByName('difficulty');
    app.save(scores);
  },
);
