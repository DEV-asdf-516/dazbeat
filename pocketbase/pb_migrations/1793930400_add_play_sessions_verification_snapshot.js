/// <reference path="../pb_data/types.d.ts" />
// 발급 뒤 곡·채보 메타데이터가 바뀌어도 발급 때 기준으로 검증하도록 그 값을 세션에 고정한다.
migrate(
  (app) => {
    // 이 마이그레이션 전에 발급된 세션에는 고정한 검증 기준이 없어, 값을 추측하지 않고 만료시킨다.
    app.db().delete('play_sessions').execute();

    const playSessions = app.findCollectionByNameOrId('play_sessions');
    playSessions.fields.add(new TextField({ name: 'songKey', required: true }));
    playSessions.fields.add(new NumberField({ name: 'gameStartMs', required: false }));
    playSessions.fields.add(new NumberField({ name: 'gameEndMs', required: true }));
    playSessions.fields.add(
      new SelectField({
        name: 'difficulty',
        required: true,
        maxSelect: 1,
        values: ['easy', 'normal', 'hard', 'expert'],
      }),
    );
    playSessions.fields.add(
      new NumberField({ name: 'laneCount', required: true, onlyInt: true, min: 4, max: 6 }),
    );
    app.save(playSessions);
  },
  (app) => {
    const playSessions = app.findCollectionByNameOrId('play_sessions');
    ['songKey', 'gameStartMs', 'gameEndMs', 'difficulty', 'laneCount'].forEach((name) => {
      playSessions.fields.removeByName(name);
    });
    app.save(playSessions);
  },
);
