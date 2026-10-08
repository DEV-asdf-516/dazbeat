/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const songs = new Collection({
      type: 'base',
      name: 'songs',
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'key', type: 'text', required: true },
        { name: 'title', type: 'text', required: true },
        {
          name: 'category',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['original', 'cover'],
        },
        { name: 'youtubeVideoId', type: 'text', required: true },
        { name: 'jacket', type: 'file', required: true, maxSelect: 1 },
        { name: 'accentColor', type: 'number', required: true },
        { name: 'gameStartMs', type: 'number', required: false },
        { name: 'gameEndMs', type: 'number', required: true },
        { name: 'visualTheme', type: 'text', required: false },
        { name: 'credit', type: 'json', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_songs_key ON songs (key)'],
    });
    app.save(songs);

    const charts = new Collection({
      type: 'base',
      name: 'charts',
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'song',
          type: 'relation',
          required: true,
          collectionId: songs.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'difficulty',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['easy', 'normal', 'hard', 'expert'],
        },
        { name: 'data', type: 'json', required: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_charts_song_difficulty ON charts (song, difficulty)'],
    });
    app.save(charts);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('charts'));
    app.delete(app.findCollectionByNameOrId('songs'));
  },
);
