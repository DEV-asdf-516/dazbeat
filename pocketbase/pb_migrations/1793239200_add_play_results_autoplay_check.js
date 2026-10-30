/// <reference path="../pb_data/types.d.ts" />
// JSVM 은 pocketbase/lib/autoplayCheck.ts 를 import 할 수 없어 판정·사유 값을 옮겨 둔다.
const AUTOPLAY_CHECKS = ['unjudged', 'clear', 'suspicious'];
const AUTOPLAY_REASONS = ['low_std_dev', 'zero_cluster', 'synced_chords'];

migrate(
  (app) => {
    const playResults = app.findCollectionByNameOrId('play_results');
    // 이전 행은 빈 값으로 남아 기능 배포 전 기록을 뜻하므로 필수로 두지 않는다.
    playResults.fields.add(
      new SelectField({ name: 'autoplayCheck', maxSelect: 1, values: AUTOPLAY_CHECKS }),
    );
    playResults.fields.add(
      new SelectField({
        name: 'autoplayReasons',
        maxSelect: AUTOPLAY_REASONS.length,
        values: AUTOPLAY_REASONS,
      }),
    );
    playResults.fields.add(new JSONField({ name: 'inputStats' }));
    app.save(playResults);
  },
  (app) => {
    const playResults = app.findCollectionByNameOrId('play_results');
    playResults.fields.removeByName('autoplayCheck');
    playResults.fields.removeByName('autoplayReasons');
    playResults.fields.removeByName('inputStats');
    app.save(playResults);
  },
);
