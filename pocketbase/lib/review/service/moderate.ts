import { requireDefined } from '../../../../src/invariant.js';
import type { JsvmApp, JsvmRuntime } from '../../jsvm.js';
import type { ReviewDecision } from '../dto.js';
import { findPlayResultRecord, parsePlayResultRecord, savePlayReview } from '../repository.js';
import { readCurrentChart } from '../../session/repository.js';
import { applyApprovedPlay } from './approve.js';

export type PlayDecision = { readonly kind: 'decided' } | { readonly kind: 'alreadyReviewed' };

/** 플레이 레코드의 상태 저장은 호출자가 같은 트랜잭션에서 한다. */
export function decidePlay(
  runtime: JsvmRuntime,
  tx: JsvmApp,
  request: {
    readonly playId: string;
    readonly decision: ReviewDecision;
    readonly note: string;
    readonly reviewer: { readonly id: string; readonly email: string };
  },
): PlayDecision {
  const { playId, decision } = request;
  // 요청이 읽은 레코드가 아니라 트랜잭션 안에서 다시 읽어, 동시에 결정해도 하나만 통과한다.
  const record = requireDefined(findPlayResultRecord(tx, playId), 'Play result is missing', playId);
  if (record.getString('reviewStatus') !== 'pending') {
    return { kind: 'alreadyReviewed' };
  }
  savePlayReview(runtime, tx, {
    playResult: playId,
    decision,
    reviewerId: request.reviewer.id,
    reviewerEmail: request.reviewer.email,
    note: request.note,
  });
  if (decision === 'rejected') {
    return { kind: 'decided' };
  }
  const play = parsePlayResultRecord(record);
  applyApprovedPlay(runtime, tx, {
    ...play,
    chart: {
      ...play.chart,
      // 지워진 채보는 현재 상태가 없다.
      current: readCurrentChart(runtime, tx, play.chart.id) ?? null,
    },
  });
  return { kind: 'decided' };
}
