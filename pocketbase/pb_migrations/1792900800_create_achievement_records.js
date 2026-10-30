/// <reference path="../pb_data/types.d.ts" />
// JSVM 은 src/data 를 import 할 수 없어 DIFFICULTIES, ZODIACS, AchievementMark 를 그대로 옮겨 둔다.
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
    // superuser 와 서버 훅만 다룬다. 곡과 채보는 일반 id 로 저장해, 지우거나 고쳐도 과거 업적으로
    // cascade 되지 않는다.
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
          // 세션이 발급될 때의 revision, 즉 플레이를 검증한 채보다.
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
          // 소급한 mark 는 당시 별자리를 몰라 비어 있다.
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
          // 획득한 행을 고치는 경로가 없어 획득 시각은 바뀌지 않는다.
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
