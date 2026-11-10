/// <reference path="../pb_data/types.d.ts" />
// 운영자는 대시보드에서 play_results 를 고쳐 검토하므로 결정 사유를 적을 칸을 둔다. 사유와 심사자는
// 결정할 때 play_reviews 에 옮겨 적어 계정 삭제 뒤에도 남긴다.
// JSVM 은 pocketbase/lib/review/dto.ts 를 import 할 수 없어 길이 상한을 옮겨 둔다.
const REVIEW_NOTE_MAX_LENGTH = 500;

migrate(
  (app) => {
    const playResults = app.findCollectionByNameOrId('play_results');
    playResults.fields.add(new TextField({ name: 'reviewNote', max: REVIEW_NOTE_MAX_LENGTH }));
    app.save(playResults);
  },
  (app) => {
    const playResults = app.findCollectionByNameOrId('play_results');
    playResults.fields.removeByName('reviewNote');
    app.save(playResults);
  },
);
