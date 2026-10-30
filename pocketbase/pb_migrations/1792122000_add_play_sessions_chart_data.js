/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // 이 마이그레이션 전에 발급된 세션에는 검증할 채보 스냅샷이 없다.
    app.findAllRecords('play_sessions').forEach((record) => {
      app.delete(record);
    });

    const playSessions = app.findCollectionByNameOrId('play_sessions');
    // maxSize 를 두지 않아 charts.data 가 담을 수 있는 채보는 스냅샷에도 담긴다(같은 1MB 기본값).
    playSessions.fields.add(new JSONField({ name: 'chartData', required: true }));
    app.save(playSessions);
  },
  (app) => {
    const playSessions = app.findCollectionByNameOrId('play_sessions');
    playSessions.fields.removeByName('chartData');
    app.save(playSessions);
  },
);
