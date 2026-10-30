/// <reference path="../pb_data/types.d.ts" />
// NFC 훅 전에 저장된 제목에는 제목 검색이 찾지 못하는 분해형 문자가 있을 수 있다.
migrate(
  (app) => {
    app.findAllRecords('songs').forEach((record) => {
      const title = record.getString('title');
      const normalized = title.normalize('NFC');
      if (normalized !== title) {
        record.set('title', normalized);
        app.saveNoValidate(record);
      }
    });
  },
  () => {},
);
