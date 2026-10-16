/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    // Per-user session issue window; only superusers and server hooks touch it.
    const playSessionQuotas = new Collection({
      type: 'base',
      name: 'play_session_quotas',
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
        { name: 'windowStartedAt', type: 'date', required: true },
        { name: 'issuedCount', type: 'number', required: true, onlyInt: true, min: 1 },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_play_session_quotas_user ON play_session_quotas (user)'],
    });
    app.save(playSessionQuotas);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('play_session_quotas'));
  },
);
