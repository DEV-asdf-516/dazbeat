/// <reference path="../pb_data/types.d.ts" />
// JSVM cannot import src/data/songs.ts, so this mirrors ZODIACS in the same order.
const ZODIACS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
];

migrate(
  (app) => {
    const songs = app.findCollectionByNameOrId('songs');
    songs.fields.add(
      new SelectField({ name: 'constellation', required: true, maxSelect: 1, values: ZODIACS }),
    );
    app.save(songs);

    // Only the seeded sample song has a known constellation; other songs must be set by an admin.
    const samples = app.findRecordsByFilter('songs', 'key = {:key}', '', 1, 0, { key: 'sample' });
    samples.forEach((record) => {
      record.set('constellation', 'gemini');
      app.save(record);
    });
  },
  (app) => {
    const songs = app.findCollectionByNameOrId('songs');
    songs.fields.removeByName('constellation');
    app.save(songs);
  },
);
