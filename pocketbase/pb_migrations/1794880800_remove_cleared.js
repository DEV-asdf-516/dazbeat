/// <reference path="../pb_data/types.d.ts" />
// 완주가 곧 클리어라 기록은 모두 클리어다. 운영에 배포된 적이 없어 옛 규칙의 false 는 옮기지 않고 버리고,
// 되돌릴 때는 모두 클리어로 채운다.
const BEST_FIELDS_INDEX = 'idx_scores_user_chart_best_fields';

// 되돌릴 때 열 순서까지 원래대로 둔다.
function addClearedAfter(collection, previousName) {
  let position = 0;
  for (let i = 0; i < collection.fields.length; i++) {
    if (collection.fields[i].getName() === previousName) {
      position = i + 1;
    }
  }
  collection.fields.addAt(position, new BoolField({ name: 'cleared' }));
}

migrate(
  (app) => {
    const scores = app.findCollectionByNameOrId('scores');
    scores.removeIndex(BEST_FIELDS_INDEX);
    scores.fields.removeByName('cleared');
    scores.indexes = [
      ...scores.indexes,
      `CREATE INDEX ${BEST_FIELDS_INDEX} ON scores (user, chart, score, accuracy, maxCombo)`,
    ];
    app.save(scores);
    const playResults = app.findCollectionByNameOrId('play_results');
    playResults.fields.removeByName('cleared');
    app.save(playResults);
  },
  (app) => {
    const scores = app.findCollectionByNameOrId('scores');
    scores.removeIndex(BEST_FIELDS_INDEX);
    addClearedAfter(scores, 'maxCombo');
    scores.indexes = [
      ...scores.indexes,
      `CREATE INDEX ${BEST_FIELDS_INDEX} ON scores (user, chart, score, accuracy, maxCombo, cleared)`,
    ];
    app.save(scores);
    const playResults = app.findCollectionByNameOrId('play_results');
    addClearedAfter(playResults, 'counts');
    app.save(playResults);
    app.db().newQuery('UPDATE scores SET cleared = TRUE').execute();
    app.db().newQuery('UPDATE play_results SET cleared = TRUE').execute();
  },
);
