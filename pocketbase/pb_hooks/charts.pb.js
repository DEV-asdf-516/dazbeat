/// <reference path="../pb_data/types.d.ts" />
// 마이그레이션의 app.save() 도 모델 훅을 거치므로 전체 검증은 요청 훅에서 한다.
onRecordCreateRequest((e) => {
  const { checkChartRecord } = require(`${__hooks}/lib/song/service.cjs`);
  const { CHART_SAVE_REJECTIONS, InvalidChartSaveError, parseChartRecord } = require(
    `${__hooks}/lib/song/dto.cjs`,
  );
  try {
    checkChartRecord(
      { DynamicModel, arrayOf, dbx: $dbx },
      e.app,
      parseChartRecord({
        song: e.record.getString('song'),
        difficulty: e.record.getString('difficulty'),
        laneCount: e.record.getInt('laneCount'),
        data: toString(e.record.get('data')),
      }),
    );
  } catch (error) {
    if (error instanceof InvalidChartSaveError) {
      const { status, field } = CHART_SAVE_REJECTIONS[error.code];
      throw new ApiError(status, error.message, {
        [field]: new ValidationError(error.code, error.message),
      });
    }
    throw error;
  }
  e.next();
}, 'charts');

onRecordUpdateRequest((e) => {
  const { checkChartRecord, decideChartRevision } = require(`${__hooks}/lib/song/service.cjs`);
  const {
    CHART_SAVE_REJECTIONS,
    InvalidChartSaveError,
    parseBaseRevision,
    parseChartRecord,
  } = require(`${__hooks}/lib/song/dto.cjs`);
  const reject = (code, message) => {
    const { status, field } = CHART_SAVE_REJECTIONS[code];
    return new ApiError(status, message, {
      [field]: new ValidationError(code, message),
    });
  };
  const runtime = { DynamicModel, arrayOf, dbx: $dbx };
  try {
    // superuser 수정은 운영 작업이라 기준 revision 없이 저장한다.
    const isSuperuser = e.hasSuperuserAuth();
    const baseRevision = isSuperuser
      ? undefined
      : parseBaseRevision(e.requestInfo().body.baseRevision);
    checkChartRecord(
      runtime,
      e.app,
      parseChartRecord({
        song: e.record.getString('song'),
        difficulty: e.record.getString('difficulty'),
        laneCount: e.record.getInt('laneCount'),
        data: toString(e.record.get('data')),
      }),
    );
    if (isSuperuser) {
      e.next();
      return;
    }
    // 비교와 저장을 한 트랜잭션에 묶어, 같은 기준으로 동시에 저장하면 하나만 통과한다.
    e.app.runInTransaction((txApp) => {
      const decision = decideChartRevision(runtime, txApp, e.record.id, baseRevision);
      if (decision.kind === 'conflict') {
        throw reject('chart_revision_conflict', decision.message);
      }
      e.app = txApp;
      e.next();
    });
  } catch (error) {
    if (error instanceof InvalidChartSaveError) {
      throw reject(error.code, error.message);
    }
    throw error;
  }
}, 'charts');

// revision 은 저장된 채보 data 의 해시다. 요청 본문으로 위조할 수 없도록 저장할 때마다 다시 계산한다.
onRecordCreate((e) => {
  e.record.set('revision', $security.sha256(toString(e.record.get('data'))));
  e.next();
}, 'charts');

onRecordUpdate((e) => {
  e.record.set('revision', $security.sha256(toString(e.record.get('data'))));
  e.next();
}, 'charts');
