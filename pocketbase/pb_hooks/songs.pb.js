/// <reference path="../pb_data/types.d.ts" />
// JSVM handlers cannot see the outer scope, so each handler defines what it needs inline.

// Title search compares code points, so a decomposed (NFD) title would miss a composed query; store NFC.
onRecordCreate((e) => {
  e.record.set('title', e.record.getString('title').normalize('NFC'));
  e.next();
}, 'songs');

onRecordUpdate((e) => {
  e.record.set('title', e.record.getString('title').normalize('NFC'));
  e.next();
}, 'songs');

routerAdd('GET', '/api/dazbeat/songs/search', (e) => {
  const { buildSongSearchQuery, InvalidSongSearchError } = require(`${__hooks}/lib/songSearch.cjs`);
  const { column, CHARTS, SONGS, SONG_LIST_FIELDS, HTTP_STATUS } = require(
    `${__hooks}/lib/pbQuery.cjs`,
  );
  const fail = (status, code, message) => e.json(status, { status, code, message });

  const requestInfo = e.requestInfo();
  const { title, category, afterReleasedOn, afterId } = requestInfo.query;
  let search;
  try {
    search = buildSongSearchQuery({ title, category, afterReleasedOn, afterId });
  } catch (error) {
    if (error instanceof InvalidSongSearchError) {
      return fail(HTTP_STATUS.badRequest, 'invalid_request', error.message);
    }
    throw error;
  }

  const songsCollection = e.app.findCachedCollectionByNameOrId('songs');
  // The count runs in SQL without the per-record list rule, so it is answered only when every match
  // is listable to this requester; otherwise it would reveal how many hidden songs match.
  const canListEverySong =
    requestInfo.hasSuperuserAuth() ||
    (songsCollection.listRule !== null && String(songsCollection.listRule) === '');
  // The list and the count match the same songs, so both take the same join and condition.
  const matching = (query) =>
    (search.join === null
      ? query
      : query.innerJoin(search.join.table, $dbx.exp(search.join.on))
    ).andWhere($dbx.exp(search.condition, search.params));
  let totalItems = null;
  if (search.shouldCount && canListEverySong) {
    // A builder query rather than queryRow (which takes an SQL string), so the count goes through
    // the same `matching` as the list instead of a second copy of the SQL.
    const countRow = new DynamicModel({ total: 0 });
    matching(e.app.db().select('COUNT(*) AS total').from('songs')).one(countRow);
    totalItems = countRow.total;
  }
  // A null rule means superuser only; the rule argument is a Go string, so null is never passed on.
  const canRead = (record, rule) =>
    rule === null
      ? requestInfo.hasSuperuserAuth()
      : e.app.canAccessRecord(record, requestInfo, rule);

  const matched = arrayOf(new Record(songsCollection));
  // Only the fields the song list uses; collectionId and collectionName are not columns but come with the collection.
  matching(
    e.app
      .recordQuery(songsCollection)
      .select(
        ...SONG_LIST_FIELDS.filter(
          (field) => field !== 'collectionId' && field !== 'collectionName',
        ).map((field) => column(SONGS, field)),
      ),
  )
    .orderBy(...search.orderBy)
    .limit(search.limit)
    .all(matched);
  const songs = matched.filter((record) => canRead(record, songsCollection.listRule));
  if (songs.length === 0) {
    return e.json(HTTP_STATUS.ok, { items: [], totalItems, next: null });
  }

  const chartsCollection = e.app.findCachedCollectionByNameOrId('charts');
  const charts = arrayOf(new Record(chartsCollection));
  // Only the columns the list needs, so the chart data column is never read.
  e.app
    .recordQuery(chartsCollection)
    .select(
      column(CHARTS, 'id'),
      column(CHARTS, 'song'),
      column(CHARTS, 'difficulty'),
      column(CHARTS, 'laneCount'),
    )
    .where($dbx.in(column(CHARTS, 'song'), ...songs.map((song) => song.id)))
    .all(charts);
  const chartsBySong = {};
  charts
    .filter((chart) => canRead(chart, chartsCollection.viewRule))
    .forEach((chart) => {
      const songId = chart.getString('song');
      if (chartsBySong[songId] === undefined) {
        chartsBySong[songId] = [];
      }
      chartsBySong[songId].push({
        id: chart.id,
        difficulty: chart.getString('difficulty'),
        laneCount: chart.getInt('laneCount'),
      });
    });

  const items = songs.map((song) => {
    const exported = song.publicExport();
    const item = {};
    SONG_LIST_FIELDS.forEach((field) => {
      item[field] = exported[field];
    });
    const songCharts = chartsBySong[song.id];
    if (songCharts !== undefined) {
      item['expand'] = { charts_via_song: songCharts };
    }
    return item;
  });
  // A page shorter than the SQL limit is the last one; the cursor comes from the last item sent,
  // so a song hidden by the list rule never leaks through it.
  const last = items[items.length - 1];
  const next =
    matched.length === search.limit
      ? { releasedOn: last['releasedOn'], recordId: last['id'] }
      : null;
  return e.json(HTTP_STATUS.ok, { items, totalItems, next });
});
