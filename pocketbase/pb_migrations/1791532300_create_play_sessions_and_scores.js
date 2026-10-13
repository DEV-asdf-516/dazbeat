/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const charts = app.findCollectionByNameOrId('charts');

    // Only superusers and server hooks touch sessions.
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

    // Public reads only show records of the chart's current revision; writes go through server hooks.
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
