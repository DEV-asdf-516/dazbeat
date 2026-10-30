/// <reference path="../pb_data/types.d.ts" />

// 제목 검색은 코드 포인트를 비교하므로 분해형(NFD) 제목은 조합형 검색어에 걸리지 않는다. NFC 로 저장한다.
onRecordCreate((e) => {
  e.record.set('title', e.record.getString('title').normalize('NFC'));
  e.next();
}, 'songs');

onRecordUpdate((e) => {
  e.record.set('title', e.record.getString('title').normalize('NFC'));
  e.next();
}, 'songs');

routerAdd('GET', '/api/dazbeat/songs/search', (e) => {
  const { parseSongSearchInput, SongSearchRejectedError, SONG_SEARCH_REJECTIONS } = require(
    `${__hooks}/lib/song/dto.cjs`,
  );
  const { buildSongSearchQuery, readSongSearchPage } = require(
    `${__hooks}/lib/song/repository.cjs`,
  );
  const { SONG_LIST_FIELDS, HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);
  const fail = (status, code, message) => e.json(status, { status, code, message });

  const requestInfo = e.requestInfo();
  const { title, category, afterReleasedOn, afterId, scope } = requestInfo.query;
  let search;
  try {
    search = buildSongSearchQuery(
      parseSongSearchInput({
        title,
        category,
        afterReleasedOn,
        afterId,
        scope,
        // superuser 의 e.auth 는 users 레코드가 아니라 isEditor 가 없다.
        canListUnpublished:
          requestInfo.hasSuperuserAuth() || (e.auth !== null && e.auth.getBool('isEditor')),
      }),
    );
  } catch (error) {
    if (error instanceof SongSearchRejectedError) {
      return fail(SONG_SEARCH_REJECTIONS[error.code].status, error.code, error.message);
    }
    throw error;
  }

  const { totalItems, songs, chartsBySong, hasMore } = readSongSearchPage(
    { Record, DynamicModel, arrayOf, dbx: $dbx },
    e.app,
    search,
    (record, rule) => e.app.canAccessRecord(record, requestInfo, rule),
  );
  if (songs.length === 0) {
    return e.json(HTTP_STATUS.ok, { items: [], totalItems, next: null });
  }

  const items = songs.map((song) => {
    const exported = song.publicExport();
    const item = {};
    SONG_LIST_FIELDS.forEach((field) => {
      item[field] = exported[field];
    });
    const songCharts = chartsBySong.get(song.id);
    if (songCharts !== undefined) {
      item['expand'] = { charts_via_song: songCharts };
    }
    return item;
  });
  // 커서는 마지막으로 보낸 항목에서 만들어, list rule 로 숨긴 곡이 커서로 새지 않는다.
  const last = items[items.length - 1];
  const next = hasMore ? { releasedOn: last['releasedOn'], recordId: last['id'] } : null;
  return e.json(HTTP_STATUS.ok, { items, totalItems, next });
});
