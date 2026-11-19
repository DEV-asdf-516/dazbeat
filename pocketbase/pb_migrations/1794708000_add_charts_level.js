/// <reference path="../pb_data/types.d.ts" />
// 0.5 단위는 요청 훅이 검사한다.
const MIN_LEVEL = 1;
const MAX_LEVEL = 5;

migrate(
  (app) => {
    const charts = app.findCollectionByNameOrId('charts');
    charts.fields.add(
      new NumberField({
        name: 'level',
        min: MIN_LEVEL,
        max: MAX_LEVEL,
        onlyInt: false,
        required: true,
      }),
    );
    app.save(charts);
  },
  (app) => {
    const charts = app.findCollectionByNameOrId('charts');
    charts.fields.removeByName('level');
    app.save(charts);
  },
);
