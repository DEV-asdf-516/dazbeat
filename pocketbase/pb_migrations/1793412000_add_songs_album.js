/// <reference path="../pb_data/types.d.ts" />
const ALBUMS = [
  { key: 'remindfulOne', name: 'Remindful.One', sortOrder: 10 },
  { key: 'remindfulTwo', name: 'Remindful.Two', sortOrder: 20 },
  { key: 'orbit', name: 'orbit', sortOrder: 30 },
  { key: 'newtroWave', name: 'NEWTRO WAVE', sortOrder: 40 },
  { key: 'nemuranaiYume', name: '眠らない夢', sortOrder: 50 },
  { key: 'nostalzia', name: 'Nostalzia', sortOrder: 60 },
];

// 이 필드가 생기기 전에 시드된 곡들의 수록 앨범이다. 새 곡은 시드 매니페스트나 관리자가 설정한다.
const KNOWN_ALBUM_SONG_KEYS = {
  remindfulOne: [
    'yt-FNuGB562C2Q',
    'yt-9MNjK6SKnYo',
    'yt-JifPfJweX_Q',
    'yt-9lLYjchibSg',
    'yt-2M0c-w8Seiw',
    'yt-cm9DTv6nhZU',
  ],
  remindfulTwo: [
    'yt-lFNWUL9fqG8',
    'yt-X7-jVaZk1Q8',
    'yt-5O07CiqXxXE',
    'yt-tNVTuUEeWP0',
    'yt-55mwJr3zKTQ',
    'yt-CIupJBDM7iA',
    'yt-My4Z611KjIY',
    'yt-IneSZE5v75k',
  ],
  orbit: [
    'yt-HbBPw-EPebM',
    'yt-gqUStT2oax0',
    'yt-Y732jibDixc',
    'yt-0d3rehA2qUo',
    'yt-APynYFzPh6A',
    'yt-xM-tlje7_w8',
    'yt-58tAL6TkTmI',
    'yt-P10Jfga8hHo',
    'yt-L8u_DVYz2sE',
    'yt-f09oTPk4hTY',
  ],
  newtroWave: [
    'yt-BtY-pC1ZBCk',
    'yt-aJePDwiNgRc',
    'yt-quzAzfn4P2M',
    'yt-wxxRAez0bqA',
    'yt-UKj7eM-5qEE',
  ],
  nemuranaiYume: ['yt-5A-ei_hKwH4', 'yt-6At3gq_Azig'],
  nostalzia: [
    'yt-jLYZalnOty8',
    'yt-tGIzKMmgVgk',
    'yt-BC74zTA-tDE',
    'yt-Mz47JEvYys0',
    'yt-s3g_Q3JxluI',
    'yt-BGqzr9pia0w',
    'yt-MdTAJ1J2LeM',
    'yt-8UiMBVJ1_Sw',
  ],
};

migrate(
  (app) => {
    const albums = new Collection({
      type: 'base',
      name: 'albums',
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'key', type: 'text', required: true, pattern: '^[a-z][A-Za-z0-9]*$' },
        { name: 'name', type: 'text', required: true },
        { name: 'sortOrder', type: 'number', onlyInt: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_albums_key ON albums (key)'],
    });
    app.save(albums);

    const albumIdByKey = new Map(
      ALBUMS.map((album) => {
        const record = new Record(albums);
        record.set('key', album.key);
        record.set('name', album.name);
        record.set('sortOrder', album.sortOrder);
        app.save(record);
        return [album.key, record.id];
      }),
    );

    const songs = app.findCollectionByNameOrId('songs');
    songs.fields.add(
      new RelationField({
        name: 'album',
        collectionId: albums.id,
        maxSelect: 1,
        cascadeDelete: false,
      }),
    );
    app.save(songs);

    Object.entries(KNOWN_ALBUM_SONG_KEYS).forEach(([album, keys]) => {
      keys.forEach((key) => {
        const records = app.findRecordsByFilter('songs', 'key = {:key}', '', 1, 0, { key });
        records.forEach((record) => {
          record.set('album', albumIdByKey.get(album));
          app.save(record);
        });
      });
    });
  },
  (app) => {
    const songs = app.findCollectionByNameOrId('songs');
    songs.fields.removeByName('album');
    app.save(songs);
    app.delete(app.findCollectionByNameOrId('albums'));
  },
);
