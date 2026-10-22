/// <reference path="../pb_data/types.d.ts" />
// JSVM handlers cannot see the outer scope, so each handler defines what it needs inline.

routerAdd('GET', '/api/dazbeat/songs/search', (e) => {
  const { buildSongSearchQuery, InvalidSongSearchError } = require(`${__hooks}/lib/songSearch.cjs`);
  const fail = (status, code, message) => e.json(status, { status, code, message });

  const requestInfo = e.requestInfo();
  const { title, category, afterReleasedOn, afterId } = requestInfo.query;
  let search;
  try {
    search = buildSongSearchQuery({ title, category, afterReleasedOn, afterId });
  } catch (error) {
    if (error instanceof InvalidSongSearchError) {
      return fail(400, 'invalid_request', error.message);
    }
    throw error;
  }

  const idRows = arrayOf(new DynamicModel({ id: '' }));
  e.app.db().newQuery(search.sql).bind(search.params).all(idRows);
  if (idRows.length === 0) {
    return e.json(200, { items: [] });
  }

  // A null rule means superuser only; the rule argument is a Go string, so null is never passed on.
  const canRead = (record, rule) =>
    rule === null
      ? requestInfo.hasSuperuserAuth()
      : e.app.canAccessRecord(record, requestInfo, rule);

  const songIds = idRows.map((row) => row.id);
  const songsCollection = e.app.findCachedCollectionByNameOrId('songs');
  const songs = e.app
    .findRecordsByIds(songsCollection, songIds)
    .sort((a, b) => songIds.indexOf(a.id) - songIds.indexOf(b.id))
    .filter((record) => canRead(record, songsCollection.listRule));

  const chartsCollection = e.app.findCachedCollectionByNameOrId('charts');
  const charts = arrayOf(new Record(chartsCollection));
  // Only the columns the list needs, so the chart data column is never read.
  e.app
    .recordQuery(chartsCollection)
    .select('charts.id', 'charts.song', 'charts.difficulty')
    .where($dbx.in('charts.song', ...songs.map((song) => song.id)))
    .all(charts);
  const chartsBySong = {};
  charts
    .filter((chart) => canRead(chart, chartsCollection.viewRule))
    .forEach((chart) => {
      const songId = chart.getString('song');
      chartsBySong[songId] = (chartsBySong[songId] || []).concat({
        id: chart.id,
        difficulty: chart.getString('difficulty'),
      });
    });

  return e.json(200, {
    items: songs.map((song) => {
      const item = song.publicExport();
      const songCharts = chartsBySong[song.id];
      if (songCharts !== undefined) {
        item['expand'] = { charts_via_song: songCharts };
      }
      return item;
    }),
  });
});
