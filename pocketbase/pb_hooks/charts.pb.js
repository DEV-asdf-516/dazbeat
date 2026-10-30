/// <reference path="../pb_data/types.d.ts" />
// revision 은 저장된 채보 data 의 해시다. 요청 본문으로 위조할 수 없도록 저장할 때마다 다시 계산한다.
onRecordCreate((e) => {
  const { checkChartLaneCount } = require(`${__hooks}/lib/song/service.cjs`);
  const data = toString(e.record.get('data'));
  checkChartLaneCount(data, e.record.getInt('laneCount'));
  e.record.set('revision', $security.sha256(data));
  e.next();
}, 'charts');

onRecordUpdate((e) => {
  const { checkChartLaneCount } = require(`${__hooks}/lib/song/service.cjs`);
  const data = toString(e.record.get('data'));
  checkChartLaneCount(data, e.record.getInt('laneCount'));
  e.record.set('revision', $security.sha256(data));
  e.next();
}, 'charts');
