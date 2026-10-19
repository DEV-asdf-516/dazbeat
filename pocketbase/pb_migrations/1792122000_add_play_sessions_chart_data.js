/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // Sessions issued before this migration have no chart snapshot to verify against.
    app.findAllRecords('play_sessions').forEach((record) => {
      app.delete(record);
    });

    const playSessions = app.findCollectionByNameOrId('play_sessions');
    // No maxSize, so the snapshot holds any chart charts.data can hold (same 1MB default).
    playSessions.fields.add(new JSONField({ name: 'chartData', required: true }));
    app.save(playSessions);
  },
  (app) => {
    const playSessions = app.findCollectionByNameOrId('play_sessions');
    playSessions.fields.removeByName('chartData');
    app.save(playSessions);
  },
);
