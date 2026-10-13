/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const charts = app.findCollectionByNameOrId('charts');
    charts.fields.add(new TextField({ name: 'revision' }));
    app.save(charts);

    // Same expression as the charts hook, so re-saving unchanged data keeps the backfilled revision.
    app.findAllRecords('charts').forEach((record) => {
      record.set('revision', $security.sha256(toString(record.get('data'))));
      app.save(record);
    });
  },
  (app) => {
    const charts = app.findCollectionByNameOrId('charts');
    charts.fields.removeByName('revision');
    app.save(charts);
  },
);
