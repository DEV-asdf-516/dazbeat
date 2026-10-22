/// <reference path="../pb_data/types.d.ts" />
// Titles saved before the NFC hook may hold decomposed characters that title search cannot match.
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
