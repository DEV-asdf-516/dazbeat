/// <reference path="../pb_data/types.d.ts" />
// A song can have one chart per difficulty for each lane count, so the lane count joins the unique key.
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
