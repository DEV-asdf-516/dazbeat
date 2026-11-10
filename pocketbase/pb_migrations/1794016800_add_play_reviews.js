/// <reference path="../pb_data/types.d.ts" />
// 자동 판정이 의심한 플레이는 운영자가 검토하기 전까지 순위에 오르지 않는다. 순위는 서버 라우트만
// 계산하므로 scores 는 서버 전용으로 닫는다.
// JSVM 은 pocketbase/lib/review/dto.ts 를 import 할 수 없어 값을 옮겨 둔다.
const REVIEW_STATUSES = ['approved', 'pending', 'rejected'];
const REVIEW_DECISIONS = ['approved', 'rejected'];
const REVIEW_STATUS_INDEX = 'idx_play_results_review_status_created';
const SCORES_READ_RULE = 'chartRevision = chart.revision && chart.song.isPublished = true';

migrate(
  (app) => {
    const playResults = app.findCollectionByNameOrId('play_results');
    playResults.fields.add(
      new SelectField({
        name: 'reviewStatus',
        required: true,
        maxSelect: 1,
        values: REVIEW_STATUSES,
      }),
    );
    playResults.fields.add(new DateField({ name: 'achievedAt', required: true }));
    playResults.addIndex(REVIEW_STATUS_INDEX, false, 'reviewStatus, created', '');
    app.save(playResults);

    const scores = app.findCollectionByNameOrId('scores');
    scores.fields.add(new DateField({ name: 'achievedAt', required: true }));
    scores.listRule = null;
    scores.viewRule = null;
    app.save(scores);

    app.save(
      new Collection({
        type: 'base',
        name: 'play_reviews',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'playResult', type: 'text', required: true },
          {
            name: 'decision',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: REVIEW_DECISIONS,
          },
          { name: 'reviewerId', type: 'text', required: true },
          { name: 'reviewerEmail', type: 'text', required: true },
          { name: 'note', type: 'text', max: 500 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_play_reviews_play_result ON play_reviews (playResult)'],
      }),
    );
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('play_reviews'));

    const scores = app.findCollectionByNameOrId('scores');
    scores.fields.removeByName('achievedAt');
    scores.listRule = SCORES_READ_RULE;
    scores.viewRule = SCORES_READ_RULE;
    app.save(scores);

    const playResults = app.findCollectionByNameOrId('play_results');
    ['reviewStatus', 'achievedAt'].forEach((name) => {
      playResults.fields.removeByName(name);
    });
    playResults.removeIndex(REVIEW_STATUS_INDEX);
    app.save(playResults);
  },
);
