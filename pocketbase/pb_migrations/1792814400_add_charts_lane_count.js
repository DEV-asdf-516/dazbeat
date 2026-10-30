/// <reference path="../pb_data/types.d.ts" />
// 곡은 레인 수마다 난이도별로 채보를 하나씩 가질 수 있어 레인 수를 유니크 키에 넣는다.
migrate(
  (app) => {
    const charts = app.findCollectionByNameOrId('charts');
    charts.fields.add(
      new NumberField({ name: 'laneCount', required: true, onlyInt: true, min: 4, max: 6 }),
    );
    charts.removeIndex('idx_charts_song_difficulty');
    charts.addIndex(
      'idx_charts_song_difficulty_lane_count',
      true,
      'song, difficulty, laneCount',
      '',
    );
    app.save(charts);
  },
  (app) => {
    const charts = app.findCollectionByNameOrId('charts');
    charts.removeIndex('idx_charts_song_difficulty_lane_count');
    charts.addIndex('idx_charts_song_difficulty', true, 'song, difficulty', '');
    charts.fields.removeByName('laneCount');
    app.save(charts);
  },
);
