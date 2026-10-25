/// <reference path="../pb_data/types.d.ts" />
// revision is the hash of the stored chart data, recomputed on every save so request bodies cannot forge it.
// JSVM handlers cannot see the outer scope, so each handler computes it inline.
onRecordCreate((e) => {
  const { checkChartLaneCount } = require(`${__hooks}/lib/chartRecord.cjs`);
  const data = toString(e.record.get('data'));
  checkChartLaneCount(data, e.record.getInt('laneCount'));
  e.record.set('revision', $security.sha256(data));
  e.next();
}, 'charts');

onRecordUpdate((e) => {
  const { checkChartLaneCount } = require(`${__hooks}/lib/chartRecord.cjs`);
  const data = toString(e.record.get('data'));
  checkChartLaneCount(data, e.record.getInt('laneCount'));
  e.record.set('revision', $security.sha256(data));
  e.next();
}, 'charts');
