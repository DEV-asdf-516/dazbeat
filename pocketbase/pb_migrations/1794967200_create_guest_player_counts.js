/// <reference path="../pb_data/types.d.ts" />
// 로그인하지 않은 완주는 서버 기록이 없어 순위표 플레이어 수에 더할 수만 있도록 채보 revision 마다 센다.
// 순위표처럼 revision 이 바뀌면 다시 센다.
migrate(
  (app) => {
    const charts = app.findCollectionByNameOrId('charts');

    // superuser 와 서버 훅만 다룬다.
    const guestPlayerCounts = new Collection({
      type: 'base',
      name: 'guest_player_counts',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'chart',
          type: 'relation',
          required: true,
          collectionId: charts.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'chartRevision', type: 'text', required: true },
        { name: 'playerCount', type: 'number', required: true, onlyInt: true, min: 1 },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_guest_player_counts_chart_revision ON guest_player_counts (chart, chartRevision)',
      ],
    });
    app.save(guestPlayerCounts);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('guest_player_counts'));
  },
);
