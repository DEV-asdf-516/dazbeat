/// <reference path="../pb_data/types.d.ts" />
// 곡 제목 검색: 짧은 검색어는 NOCASE 인덱스로 제목 앞부분을, 긴 검색어는 트리거가 동기화하는
// FTS5 trigram 테이블로 제목 어디서든 찾는다.
const TITLE_INDEX = 'idx_songs_title_nocase';
const FTS_TABLE = 'songs_title_fts';
const TRIGGERS = {
  insert: 'songs_title_fts_after_insert',
  update: 'songs_title_fts_after_update',
  delete: 'songs_title_fts_after_delete',
};

migrate(
  (app) => {
    const songs = app.findCollectionByNameOrId('songs');
    songs.addIndex(TITLE_INDEX, false, 'title COLLATE NOCASE', '');
    app.save(songs);

    const execute = (sql) => app.db().newQuery(sql).execute();
    try {
      execute(
        `CREATE VIRTUAL TABLE ${FTS_TABLE} USING fts5(title, songId UNINDEXED, tokenize='trigram')`,
      );
    } catch (error) {
      throw new Error(
        `Song title search requires SQLite FTS5 with the trigram tokenizer: ${String(error)}`,
      );
    }
    execute(`INSERT INTO ${FTS_TABLE} (rowid, title, songId) SELECT rowid, title, id FROM songs`);
    execute(
      `CREATE TRIGGER ${TRIGGERS.insert} AFTER INSERT ON songs BEGIN
        INSERT INTO ${FTS_TABLE} (rowid, title, songId) VALUES (new.rowid, new.title, new.id);
      END`,
    );
    execute(
      `CREATE TRIGGER ${TRIGGERS.update} AFTER UPDATE OF title ON songs BEGIN
        DELETE FROM ${FTS_TABLE} WHERE rowid = old.rowid;
        INSERT INTO ${FTS_TABLE} (rowid, title, songId) VALUES (new.rowid, new.title, new.id);
      END`,
    );
    execute(
      `CREATE TRIGGER ${TRIGGERS.delete} AFTER DELETE ON songs BEGIN
        DELETE FROM ${FTS_TABLE} WHERE rowid = old.rowid;
      END`,
    );
  },
  (app) => {
    const execute = (sql) => app.db().newQuery(sql).execute();
    Object.values(TRIGGERS).forEach((name) => execute(`DROP TRIGGER IF EXISTS ${name}`));
    execute(`DROP TABLE IF EXISTS ${FTS_TABLE}`);

    const songs = app.findCollectionByNameOrId('songs');
    songs.removeIndex(TITLE_INDEX);
    app.save(songs);
  },
);
