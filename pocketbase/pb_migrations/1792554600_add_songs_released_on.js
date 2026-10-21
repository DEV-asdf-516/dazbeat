/// <reference path="../pb_data/types.d.ts" />
// YouTube upload dates of the songs seeded before this field existed; other songs must be set by an admin.
const KNOWN_RELEASES = {
  sample: '2026-10-02 00:00:00.000Z',
  karma: '2026-05-01 00:00:00.000Z',
  lucy: '2026-08-11 00:00:00.000Z',
  moechakka: '2024-11-22 00:00:00.000Z',
};

migrate(
  (app) => {
    const songs = app.findCollectionByNameOrId('songs');
    songs.fields.add(new DateField({ name: 'releasedOn', required: true }));
    app.save(songs);

    Object.entries(KNOWN_RELEASES).forEach(([key, releasedOn]) => {
      const records = app.findRecordsByFilter('songs', 'key = {:key}', '', 1, 0, { key });
      records.forEach((record) => {
        record.set('releasedOn', releasedOn);
        app.save(record);
      });
    });
  },
  (app) => {
    const songs = app.findCollectionByNameOrId('songs');
    songs.fields.removeByName('releasedOn');
    app.save(songs);
  },
);
