/// <reference path="../pb_data/types.d.ts" />
// The song list of a category, its total and its keyset continuation read this index in list order.
const INDEX_NAME = 'idx_songs_category_released_on_id';

migrate(
  (app) => {
    const songs = app.findCollectionByNameOrId('songs');
    songs.addIndex(INDEX_NAME, false, 'category, releasedOn DESC, id DESC', '');
    app.save(songs);
  },
  (app) => {
    const songs = app.findCollectionByNameOrId('songs');
    songs.removeIndex(INDEX_NAME);
    app.save(songs);
  },
);
