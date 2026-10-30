/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const charts = app.findCollectionByNameOrId('charts');
    charts.fields.add(new TextField({ name: 'revision' }));
    app.save(charts);

    // charts 훅과 같은 식이라, 바뀌지 않은 data 를 다시 저장해도 소급 계산한 revision 이 유지된다.
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
