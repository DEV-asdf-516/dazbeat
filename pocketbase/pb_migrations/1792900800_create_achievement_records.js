/// <reference path="../pb_data/types.d.ts" />
// JSVM cannot import src/data, so these mirror DIFFICULTIES, ZODIACS and AchievementMark.
const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert'];
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
const MARKS = ['clear', 's', 'fc', 'ap'];
const COLLECTION_NAMES = [
  'play_results',
  'achievement_marks',
  'song_masteries',
  'earned_achievements',
];

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    // Only superusers and server hooks touch these. Songs and charts are stored as plain ids so
    // deleting or editing them never cascades into past achievements.
    const serverOnly = (name, fields, indexes) =>
      new Collection({
        type: 'base',
        name,
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'user',
            type: 'relation',
            required: true,
            collectionId: users.id,
            maxSelect: 1,
            cascadeDelete: true,
          },
          ...fields,
        ],
        indexes,
      });

    app.save(
      serverOnly(
        'play_results',
        [
          { name: 'session', type: 'text', required: true },
          { name: 'song', type: 'text', required: true },
          { name: 'chart', type: 'text', required: true },
          {
            name: 'difficulty',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: DIFFICULTIES,
          },
          { name: 'laneCount', type: 'number' },
          // The revision the session was issued with, i.e. the chart the play was verified on.
          { name: 'chartRevision', type: 'text', required: true },
          { name: 'constellation', type: 'select', required: true, maxSelect: 1, values: ZODIACS },
          { name: 'score', type: 'number' },
          { name: 'accuracy', type: 'number' },
          { name: 'maxCombo', type: 'number' },
          { name: 'counts', type: 'json' },
          { name: 'cleared', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        ],
        [
          'CREATE UNIQUE INDEX idx_play_results_session ON play_results (session)',
          'CREATE INDEX idx_play_results_user ON play_results (user)',
        ],
      ),
    );
    app.save(
      serverOnly(
        'achievement_marks',
        [
          { name: 'kind', type: 'select', required: true, maxSelect: 1, values: MARKS },
          { name: 'song', type: 'text', required: true },
          {
            name: 'difficulty',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: DIFFICULTIES,
          },
          { name: 'chart', type: 'text', required: true },
          { name: 'chartRevision', type: 'text', required: true },
          // Empty for backfilled marks, whose constellation at the time is unknown.
          { name: 'constellation', type: 'select', maxSelect: 1, values: ZODIACS },
          {
            name: 'source',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['play', 'backfill'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        ],
        [
          'CREATE UNIQUE INDEX idx_achievement_marks_unique ON achievement_marks (user, kind, chart, chartRevision, constellation)',
        ],
      ),
    );
    app.save(
      serverOnly(
        'song_masteries',
        [
          { name: 'song', type: 'text', required: true },
          { name: 'kind', type: 'select', required: true, maxSelect: 1, values: MARKS },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        ],
        ['CREATE UNIQUE INDEX idx_song_masteries_unique ON song_masteries (user, song, kind)'],
      ),
    );
    app.save(
      serverOnly(
        'earned_achievements',
        [
          { name: 'achievement', type: 'text', required: true },
          // No path updates an earned row, so the time it was earned never changes.
          { name: 'earnedAt', type: 'autodate', onCreate: true, onUpdate: false },
        ],
        [
          'CREATE UNIQUE INDEX idx_earned_achievements_unique ON earned_achievements (user, achievement)',
        ],
      ),
    );
  },
  (app) => {
    [...COLLECTION_NAMES].reverse().forEach((name) => {
      app.delete(app.findCollectionByNameOrId(name));
    });
  },
);
