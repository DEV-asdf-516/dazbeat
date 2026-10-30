/// <reference path="../pb_data/types.d.ts" />
// 카테고리의 곡 목록, 그 총개수, keyset 이어 읽기가 목록 순서대로 이 인덱스를 읽는다.
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
