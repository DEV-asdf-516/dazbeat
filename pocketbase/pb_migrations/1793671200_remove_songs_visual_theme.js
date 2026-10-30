/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const songs = app.findCollectionByNameOrId('songs');
    songs.fields.removeByName('visualTheme');
    app.save(songs);
  },
  (app) => {
    const songs = app.findCollectionByNameOrId('songs');
    songs.fields.add(new TextField({ name: 'visualTheme', required: false }));
    app.save(songs);
  },
);
