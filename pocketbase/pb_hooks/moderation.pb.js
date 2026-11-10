/// <reference path="../pb_data/types.d.ts" />
// 검토는 PocketBase 대시보드에서 superuser 가 play_results 의 reviewStatus 와 reviewNote 를 고쳐 한다.
// play_results 는 서버 전용이라 이 요청 훅에는 superuser 만 들어온다.
onRecordUpdateRequest((e) => {
  const { InvalidModerationRequestError, MODERATION_REJECTIONS, parseReviewUpdate } = require(
    `${__hooks}/lib/review/dto.cjs`,
  );
  const { decidePlay } = require(`${__hooks}/lib/review/service/moderate.cjs`);
  const readReviewFields = (record) => ({
    reviewStatus: record.getString('reviewStatus'),
    reviewNote: record.getString('reviewNote'),
  });
  const toApiError = (code) => {
    const { status, field, message } = MODERATION_REJECTIONS[code];
    return new ApiError(status, message, { [field]: new ValidationError(code, message) });
  };

  try {
    const update = parseReviewUpdate(
      readReviewFields(e.record.original()),
      readReviewFields(e.record),
    );
    if (update === undefined) {
      e.next();
      return;
    }
    e.record.set('reviewNote', update.note);
    // 결정과 감사 이력, 점수와 업적 반영, 상태 저장을 한 트랜잭션에 묶는다.
    let decided;
    e.app.runInTransaction((txApp) => {
      decided = decidePlay({ Record, DynamicModel, arrayOf, dbx: $dbx }, txApp, {
        playId: e.record.id,
        decision: update.decision,
        note: update.note,
        reviewer: { id: e.auth.id, email: e.auth.getString('email') },
      });
      if (decided.kind === 'decided') {
        e.app = txApp;
        e.next();
      }
    });
    if (decided.kind === 'alreadyReviewed') {
      throw toApiError('already_reviewed');
    }
  } catch (error) {
    if (error instanceof InvalidModerationRequestError) {
      throw toApiError(error.code);
    }
    throw error;
  }
}, 'play_results');
