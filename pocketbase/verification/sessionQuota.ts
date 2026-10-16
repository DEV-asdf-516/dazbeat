// 사용자 단위 플레이 세션 발급 한도. 첫 발급 시각부터 60초 고정 윈도 안에서 20회까지 발급한다.

export const SESSION_ISSUE_LIMIT = 20;
export const SESSION_ISSUE_WINDOW_MS = 60_000;

export interface SessionQuota {
  windowStartedAtMs: number;
  issuedCount: number;
}

export type SessionIssueDecision =
  { kind: 'allowed'; quota: SessionQuota } | { kind: 'limited'; retryAfterSeconds: number };

/** quota 는 그 사용자의 저장된 행 값, 행이 없으면 null. */
export function decideSessionIssue(
  quota: SessionQuota | null,
  nowMs: number,
): SessionIssueDecision {
  // 저장된 시작 시각이 미래(시계 역행)인 행도 활성 윈도로 보지 않고 새 윈도를 연다.
  if (
    quota === null ||
    nowMs < quota.windowStartedAtMs ||
    nowMs >= quota.windowStartedAtMs + SESSION_ISSUE_WINDOW_MS
  ) {
    return {
      kind: 'allowed',
      quota: {
        windowStartedAtMs: nowMs,
        issuedCount: 1,
      },
    };
  }
  if (quota.issuedCount >= SESSION_ISSUE_LIMIT) {
    const remainingMs = quota.windowStartedAtMs + SESSION_ISSUE_WINDOW_MS - nowMs;
    return {
      kind: 'limited',
      retryAfterSeconds: Math.ceil(remainingMs / 1000),
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
