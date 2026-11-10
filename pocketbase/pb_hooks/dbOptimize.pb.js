/// <reference path="../pb_data/types.d.ts" />
// PocketBase 가 주기적으로 돌리는 PRAGMA optimize 는 그 연결에서 조회한 테이블만 다시 분석해, 행 수가 크게
// 바뀐 테이블의 통계가 낡은 채 남으면 플래너가 인덱스 대신 테이블 전체를 훑는다(랭킹 조회의 users 등).
// 0x10000 으로 모든 테이블을 보고 analysis_limit 으로 분석 비용을 묶는다. 두 PRAGMA 가 같은 연결에서
// 돌아야 해서 연결이 하나뿐인 nonconcurrentDB 를 쓴다. 이용자가 적은 KST 04:00(UTC 19:00)에 돈다.
cronAdd('dazbeatDbOptimize', '0 19 * * *', () => {
  const db = $app.nonconcurrentDB();
  db.newQuery('PRAGMA analysis_limit=1000').execute();
  db.newQuery('PRAGMA optimize=0x10002').execute();
});
