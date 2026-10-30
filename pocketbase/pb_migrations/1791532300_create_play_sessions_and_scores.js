/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const charts = app.findCollectionByNameOrId('charts');

    // superuser 와 서버 훅만 세션을 다룬다.
    const playSessions = new Collection({
      type: 'base',
      name: 'play_sessions',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'user',
          type: 'relation',
          required: true,
          collectionId: users.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'chart',
          type: 'relation',
          required: true,
          collectionId: charts.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'chartRevision', type: 'text', required: true },
        { name: 'issuedAt', type: 'date', required: true },
        { name: 'expiresAt', type: 'date', required: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_play_sessions_user ON play_sessions (user)'],
    });
    app.save(playSessions);

    // 공개 조회는 채보의 현재 revision 기록만 보여 준다. 쓰기는 서버 훅을 거친다.
    const scores = new Collection({
      type: 'base',
      name: 'scores',
      listRule: 'chartRevision = chart.revision',
      viewRule: 'chartRevision = chart.revision',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'user',
          type: 'relation',
          required: true,
          collectionId: users.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'chart',
          type: 'relation',
          required: true,
          collectionId: charts.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'chartRevision', type: 'text', required: true },
        { name: 'score', type: 'number' },
        { name: 'accuracy', type: 'number' },
        { name: 'maxCombo', type: 'number' },
        { name: 'cleared', type: 'bool' },
        { name: 'counts', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_scores_user_chart_revision ON scores (user, chart, chartRevision)',
      ],
    });
    app.save(scores);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('scores'));
    app.delete(app.findCollectionByNameOrId('play_sessions'));
  },
);
