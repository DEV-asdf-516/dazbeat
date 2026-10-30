/// <reference path="../pb_data/types.d.ts" />
// 0 은 숫자 필드의 빈 값이라 "값 없음"이고, 클라이언트가 gameStartMs 로 대신한다.
migrate(
  (app) => {
    const songs = app.findCollectionByNameOrId('songs');
    songs.fields.add(new NumberField({ name: 'previewStartMs', min: 0, onlyInt: true }));
    app.save(songs);
  },
  (app) => {
    const songs = app.findCollectionByNameOrId('songs');
    songs.fields.removeByName('previewStartMs');
    app.save(songs);
  },
);
