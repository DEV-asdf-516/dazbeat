import { getPlayDurationMs } from '../../../../src/rhythm/playTiming.js';
import { msToSec, secToMs } from '../../../../src/time.js';
import { requireDefined } from '../../../../src/invariant.js';
import type { JsvmRuntime, DbApp, TransactionalApp } from '../../jsvm.js';
import { SessionRejectedError } from '../dto.js';
import type { SessionQuota, SessionRequest, VerificationSong } from '../dto.js';
import {
  deletePlaySessions,
  readSessionChart,
  readSessionQuota,
  savePlaySession,
  saveSessionQuota,
} from '../repository.js';

export const SESSION_ISSUE_LIMIT = 20;
export const SESSION_ISSUE_WINDOW_MS = 60_000;

export type SessionIssueDecision =
  { kind: 'allowed'; quota: SessionQuota } | { kind: 'limited'; retryAfterSeconds: number };

export function decideSessionIssue(
  quota: SessionQuota | null,
  nowMs: number,
): SessionIssueDecision {
  if (quota === null) {
    return {
      kind: 'allowed',
      quota: {
        windowStartedAtMs: nowMs,
        issuedCount: 1,
      },
    };
  }
  const windowEndsAtMs = quota.windowStartedAtMs + SESSION_ISSUE_WINDOW_MS;
  // 저장된 시작 시각이 미래(시계 역행)인 행도 활성 윈도로 보지 않고 새 윈도를 연다.
  if (nowMs < quota.windowStartedAtMs || nowMs >= windowEndsAtMs) {
    return {
      kind: 'allowed',
      quota: {
        windowStartedAtMs: nowMs,
        issuedCount: 1,
      },
    };
  }
  if (quota.issuedCount >= SESSION_ISSUE_LIMIT) {
    return {
      kind: 'limited',
      retryAfterSeconds: Math.ceil(msToSec(windowEndsAtMs - nowMs)),
    };
  }
  return {
    kind: 'allowed',
    quota: {
      windowStartedAtMs: quota.windowStartedAtMs,
      issuedCount: quota.issuedCount + 1,
    },
  };
}

/**
 * 플레이 길이 이후의 세션 유효 시간. 일시정지가 길다고 판을 무효로 만들지 않도록 넉넉히 두고,
 * 세션을 몰아 두는 남용은 발급 때 이전 세션을 지우는 사용자당 활성 세션 1개 규칙이 막는다.
 */
export const SESSION_GRACE_MS = secToMs(12 * 60 * 60);

export function getSessionExpiresAtMs(song: VerificationSong, issuedAtMs: number): number {
  return issuedAtMs + getPlayDurationMs(song.gameStartMs, song.gameEndMs) + SESSION_GRACE_MS;
}

/** 요청한 revision 그대로인 공개 곡의 채보만 돌려준다. */
export function loadSessionChart(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>,
  app: DbApp,
  request: SessionRequest,
) {
  const chart = readSessionChart(runtime, app, request.chartId);
  if (chart === undefined) {
    throw new SessionRejectedError('chart_not_found');
  }
  if (chart.revision !== request.chartRevision) {
    throw new SessionRejectedError('chart_changed');
  }
  return chart;
}

export type SessionIssue =
  | { readonly kind: 'limited'; readonly retryAfterSeconds: number }
  | { readonly kind: 'issued'; readonly sessionId: string; readonly expiresAtMs: number };

export function issuePlaySession(
  runtime: Pick<JsvmRuntime, 'Record' | 'dbx'>,
  app: TransactionalApp,
  userId: string,
  chart: ReturnType<typeof loadSessionChart>,
): SessionIssue {
  let issue: SessionIssue | undefined;
  app.runInTransaction((tx) => {
    // quota 읽기, 판단, 쓰기를 한 트랜잭션에서 해야 같은 사용자의 동시 발급이 한도를 넘지 않는다.
    // 같은 이유로 시각은 quota 행을 읽은 뒤에 잰다.
    const quota = readSessionQuota(tx, userId);
    const issuedAtMs = Date.now();
    const decision = decideSessionIssue(quota, issuedAtMs);
    if (decision.kind === 'limited') {
      issue = {
        kind: 'limited',
        retryAfterSeconds: decision.retryAfterSeconds,
      };
      return;
    }
    saveSessionQuota(runtime, tx, userId, decision.quota);
    const expiresAtMs = getSessionExpiresAtMs(
      {
        key: chart.songKey,
        gameStartMs: chart.gameStartMs,
        gameEndMs: chart.gameEndMs,
      },
      issuedAtMs,
    );
    deletePlaySessions(runtime, tx, { user: userId });
    issue = {
      kind: 'issued',
      sessionId: savePlaySession(runtime, tx, {
        userId,
        chart,
        issuedAtMs,
        expiresAtMs,
      }),
      expiresAtMs,
    };
  });
  return requireDefined(issue, 'Session issue transaction did not decide', userId);
}
