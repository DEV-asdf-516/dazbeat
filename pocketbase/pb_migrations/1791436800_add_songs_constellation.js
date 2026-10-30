/// <reference path="../pb_data/types.d.ts" />
// JSVM 은 src/data/songs.ts 를 import 할 수 없어 ZODIACS 를 같은 순서로 옮겨 둔다.
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

    // 별자리를 아는 곡은 시드 샘플 곡뿐이다. 다른 곡은 관리자가 설정해야 한다.
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
